// scripts/rolls/attack.mjs
// Full to-hit flow: dialog → 1d100 → DoS/hits/locations/jam → attack chat card.
import { evaluateTest } from "./test-logic.mjs";
import { performTest, promptTest } from "./roll-test.mjs";
import { hitLocation, computeHits, locationSequence, checkJam, soak, applyWounds } from "../helpers/attack-math.mjs";
import { computeArmour } from "../helpers/combat-data.mjs";
import { BDH } from "../config.mjs";
import { qualityToHitMod, weaponDamageFormula, accurateBonusDice, parryModifier, hasShocking, concussiveValue, fellingValue, felledToughnessBonus, hasGraviton, hasFlame, hallucinogenicValue, hasFlexible, hasUnwieldy, hasInaccurate, effectivePenetration, hasOverheats, primitiveValue, provenValue, transformDamageDie, hasMaximal, scatterToHit, scatterDamage, hasStorm, snareValue, vengefulValue, toxicValue } from "../helpers/quality-modules.mjs";
import { effectiveJamFloor, meleeCraftToHit, meleeCraftDamageBonus } from "../helpers/craftsmanship-data.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";
import { resolveFocusTarget } from "../helpers/psychic-manifest.mjs";
import { forceFieldResult } from "../helpers/force-field-data.mjs";
import { rangeBand, battlemapEnabled } from "../helpers/battlemap-data.mjs";
import { sizeToHitModifier } from "../helpers/derived.mjs";
import { targetAttackModifiers, selfAttackModifiers, evadeConditionModifier, doubleDamageDice } from "../helpers/condition-data.mjs";
import { applyStunned, applyProne, addFatigue, applyToxic, applyOnFire, applyHelpless } from "./conditions.mjs";
import { safeRoll } from "./dice.mjs";
import { scatterDirection } from "../helpers/scatter.mjs";
import { createBlastRegion, tokensInRegion, deleteRegionByUuid, placeConeRegion } from "../canvas/region.mjs";

const NS = "better-dh2e";
const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** Comma-joined "Label (value)" for the weapon qualities whose config noteOn matches `on` (red card note). */
function qualityNotes(qualities, on, { maximal = false } = {}) {
  const items = (qualities ?? [])
    .filter((q) => CONFIG.BDH.qualities[q.key]?.noteOn === on)
    .map((q) => {
      let v = q.value;
      if (maximal && q.key === "blast" && v) v = String(Number(v) + 2);   // Maximal: +2 Blast
      return `${CONFIG.BDH.qualities[q.key].label}${v ? ` (${v})` : ""}`;
    });
  if (maximal && on === "attack") {
    items.unshift("Maximal");
    if (!qualities?.some((q) => q.key === "recharge")) items.push("Recharge");   // Maximal grants Recharge
  }
  return items.join(", ");
}

const CARD = "systems/better-dh2e/templates/chat/attack-card.hbs";

/** Bind attack/damage card buttons (called from the renderChatMessageHTML hook). */
export function bindCardButtons(message, html) {
  const flags = message.flags?.[NS];
  if (!flags) return;
  // Apply Damage and the condition-applying resist tests (Shocking/Concussive) write to the target —
  // usable only by an owner of the target (GM owns everything). Hide them for everyone else so a
  // non-owner click can't half-apply and throw on the permission-gated write.
  if (flags.kind === "spray") {
    // Spray Apply writes to MANY actors — GM-only gate. AgTest buttons are open to all.
    if (!game.user.isGM) {
      html.querySelectorAll('[data-bdh="sprayApply"]').forEach((b) => b.remove());
    }
  } else if (flags.blast) {
    // Blast Apply writes to MANY actors — GM-only gate (GM owns everything).
    if (!game.user.isGM) {
      html.querySelectorAll('[data-bdh="applyDamage"]').forEach((b) => b.remove());
    }
  } else if (flags.kind === "sprayResult") {
    // Spray quality resist tests — no single target; the GM resolves each per selected hit token.
    if (!game.user.isGM) {
      html.querySelectorAll('[data-bdh="shockTest"],[data-bdh="concussiveTest"],[data-bdh="flameTest"],[data-bdh="hallucinogenicTest"],[data-bdh="snareTest"]').forEach((b) => b.remove());
    }
  } else {
    const target = flags.targetUuid ? fromUuidSync(flags.targetUuid) : null;
    if (!target?.isOwner) {
      html.querySelectorAll('[data-bdh="applyDamage"],[data-bdh="shockTest"],[data-bdh="concussiveTest"],[data-bdh="toxicResist"],[data-bdh="onFireApply"]')
        .forEach((b) => b.remove());
    }
  }
  html.querySelectorAll("[data-bdh]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.bdh === "rollDamage") await rollDamage(message);
      else if (btn.dataset.bdh === "evade") await rollEvade(message);
      else if (btn.dataset.bdh === "applyDamage") await applyDamage(message);
      else if (btn.dataset.bdh === "shockTest") await rollShockTest(message);
      else if (btn.dataset.bdh === "concussiveTest") await rollConcussiveTest(message);
      else if (btn.dataset.bdh === "flameTest") await rollFlameTest(message);
      else if (btn.dataset.bdh === "hallucinogenicTest") await rollHallucinogenicTest(message);
      else if (btn.dataset.bdh === "snareTest") await rollSnareTest(message);
      else if (btn.dataset.bdh === "toxicTest") await rollToxicTest(message);
      else if (btn.dataset.bdh === "overheatDrop") await rollOverheatDrop(message);
      else if (btn.dataset.bdh === "overheatDamage") await rollOverheatDamage(message);
      else if (btn.dataset.bdh === "castResist") await rollCastResist(message);
      else if (btn.dataset.bdh === "toxicResist") await rollToxicResist(message);
      else if (btn.dataset.bdh === "onFireApply") await applyOnFireDamage(message);
      else if (btn.dataset.bdh === "onFireWP") await rollOnFireWP(message);
      else if (btn.dataset.bdh === "sprayAgTest") await rollSprayAgTest(message, btn.dataset.uuid);
      else if (btn.dataset.bdh === "sprayApply") await applySpray(message, html);
    });
  });
}

/** Render a Roll as a transparent breakdown, e.g. "[4]+3+[5]+[2]" (dice in brackets, flats plain).
 *  Tearing-dropped dice show as "[a|b]" with the kept one bold; the DoS-substituted die (if any) reads "[v(N DoS)]". */
function formatRoll(roll, subResult = null, dos = 0, transform = (v) => v) {
  const ann = (r) => {
    if (r === subResult) return `${r.result}(${dos} DoS)`;
    const v = transform(r.result);
    return v === r.result ? `${v}` : `${r.result}→${v}`;   // e.g. 9→7
  };
  return roll.terms.map((t) => {
    if (Array.isArray(t.results)) {
      if (t.results.some((r) => !r.active)) {
        return `[${t.results.map((r) => (r.active ? `<b>${ann(r)}</b>` : `${ann(r)}`)).join("|")}]`;
      }
      return t.results.filter((r) => r.active).map((r) => `[${ann(r)}]`).join("+");
    }
    if (t.operator) return t.operator;
    if (t.number !== undefined && t.number !== null) return String(t.number);
    return "";
  }).join("");
}

// --- Follow-up step handlers ---
async function resolveDefender(f) {
  return (f.targetUuid ? await fromUuid(f.targetUuid) : null) ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
}
async function rollShockTest(message) {
  const defender = await resolveDefender(message.flags[NS]);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const label = "Toughness (Shocking)";
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  const result = await performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
  if (battlemapEnabled() && result && !result.success) {
    await applyStunned(defender, Math.ceil(result.degrees / 2));
    await addFatigue(defender, 1);
  }
  return result;
}
async function rollCastResist(message) {
  const f = message.flags[NS];
  if (!f?.opposed) return;
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to resist the power."); return; }
  const tgt = resolveFocusTarget(defender.system, f.opposedBy);
  const oppLabel = game.i18n.localize(
    CONFIG.BDH.characteristics[f.opposedBy]?.label ?? CONFIG.BDH.skills[f.opposedBy]?.label ?? f.opposedBy
  );
  const label = `${oppLabel} (Resist ${f.powerName} — caster ${f.casterDoS ?? 0} DoS)`;
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  return performTest(defender, { label, base: tgt.total, modifier: choice.modifier });
}
async function rollConcussiveTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = concussiveValue(f.qualities);
  const label = `Toughness (Concussive ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });   // penalty pre-filled, GM can adjust
  if (!choice) return null;
  const result = await performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
  if (battlemapEnabled() && result && !result.success) await applyStunned(defender, result.degrees);
  return result;
}
async function rollFlameTest(message) {
  const defender = await resolveDefender(message.flags[NS]);
  if (!defender) { ui.notifications.warn("Select a token to test Agility."); return; }
  const label = "Agility (Flame)";
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  const result = await performTest(defender, { label, base: defender.system.characteristics.agility.total, modifier: choice.modifier });
  if (battlemapEnabled() && result && !result.success) await applyOnFire(defender);
  return result;
}
async function rollHallucinogenicTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = hallucinogenicValue(f.qualities);
  const label = `Toughness (Hallucinogenic ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
}
async function rollSnareTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Agility."); return; }
  const x = snareValue(f.qualities);
  const label = `Agility (Snare ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  const result = await performTest(defender, { label, base: defender.system.characteristics.agility.total, modifier: choice.modifier });
  if (battlemapEnabled() && result && !result.success) await applyHelpless(defender);
  return result;
}
async function rollToxicTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = toxicValue(f.qualities);
  const label = `Toughness (Toxic ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
}
async function rollToxicResist(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = f.potency ?? 1;
  const label = `Toughness (Toxic Resist ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  const result = await performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
  if (battlemapEnabled() && result && !result.success) {
    // Failed resist: deal 1d10 of the stored damage type, soaked by Toughness Bonus only (no armour).
    const roll = await new Roll("1d10").evaluate();
    const tb = defender.system.characteristics.toughness.bonus ?? 0;
    const dealt = Math.max(0, roll.total - tb);
    const w = defender.system.wounds;
    const res = applyWounds(w.value, w.max, dealt);
    await defender.update({ "system.wounds.value": res.wounds, "system.wounds.critical": (w.critical ?? 0) + res.critical });
    const type = f.damageType ? `${f.damageType} ` : "";   // omit if unknown rather than mislabel
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      rolls: [roll],
      content: `<div class="bdh-card"><header class="bdh-card-head">${defender.name} takes ${dealt} ${type}damage from Toxic</header>`
        + `<div class="bdh-card-line">1d10: ${roll.total} − Toughness ${tb} = ${dealt} (armour ignored)</div></div>`
    });
  }
  return result;
}
async function rollSprayAgTest(message, uuid) {
  const target = uuid ? await fromUuid(uuid) : null;
  if (!target) { ui.notifications.warn("Token not found for the Agility test."); return; }
  const label = `Agility (Spray — ${target.name})`;
  const choice = await promptTest({ title: label, defaultModifier: "+0" });
  if (!choice) return null;
  return performTest(target, { label, base: target.system.characteristics.agility.total, modifier: choice.modifier });
}
async function applySpray(message, html) {
  const f = message.flags[NS];
  const attacker = await fromUuid(f.actorUuid);
  const weapon = attacker?.items.get(f.weaponId);
  if (!weapon) { ui.notifications.warn("Weapon not found."); return; }
  const checked = [...html.querySelectorAll(".bdh-spray-hit:checked")].map((c) => c.dataset.uuid);
  const qualities = weapon.system.qualities ?? [];
  const roll = await safeRoll(weaponDamageFormula(qualities, weapon.system.damage), "weapon damage");
  if (!roll) return;
  // Penetration like the ranged path (no DoS for spray):
  const penBase = Number((await safeRoll(String(weapon.system.penetration || "0"), "penetration"))?.total) || 0;
  const penetration = effectivePenetration(penBase, { qualities, dos: 0, success: true, closeRange: false });
  // Primitive/Proven clamp each die (same as the normal damage path — weaponDamageFormula only does Tearing).
  const primitiveX = primitiveValue(qualities), provenX = provenValue(qualities);
  const transform = (v) => transformDamageDie(v, { primitiveX, provenX });
  let dieDelta = 0;
  for (const d of roll.dice) for (const r of d.results) if (r.active) dieDelta += transform(r.result) - r.result;
  const damageTotal = roll.total + dieDelta;
  // Jam: natural 9 on ANY active d10 damage die — ignores Reliable/Unreliable.
  const jammed = roll.dice.some((d) => d.faces === 10 && d.results.some((r) => r.active && r.result === 9));
  const lines = [];
  for (const uuid of checked) {
    const actor = await fromUuid(uuid);
    if (!actor) continue;
    const dealt = await applyHitToToken(actor, {
      damageTotal, penetration, damageType: f.damageType, qualities, location: "body",
    });
    lines.push(`${actor.name}: ${dealt} dmg (Body)`);
  }
  await deleteRegionByUuid(f.regionUuid);
  // Quality effects — select a hit token, then test (GM resolves each, like the normal resist buttons).
  const resist = [
    hasShocking(qualities) ? `<div class="bdh-card-line">⚡ Shocking — <button type="button" data-bdh="shockTest">Toughness Test</button></div>` : "",
    concussiveValue(qualities) ? `<div class="bdh-card-line">⚡ Concussive (${concussiveValue(qualities)}) — <button type="button" data-bdh="concussiveTest">Toughness Test</button></div>` : "",
    hasFlame(qualities) ? `<div class="bdh-card-line">🔥 Flame — <button type="button" data-bdh="flameTest">Agility Test</button></div>` : "",
    hallucinogenicValue(qualities) ? `<div class="bdh-card-line">☣ Hallucinogenic (${hallucinogenicValue(qualities)}) — <button type="button" data-bdh="hallucinogenicTest">Toughness Test</button></div>` : "",
    snareValue(qualities) ? `<div class="bdh-card-line">🕸 Snare (${snareValue(qualities)}) — <button type="button" data-bdh="snareTest">Agility Test</button></div>` : "",
  ].filter(Boolean).join("");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker(), rolls: [roll],
    content: `<div class="bdh-card"><header class="bdh-card-head">${weapon.name} — Spray damage (${damageTotal})</header>`
      + `<div class="bdh-card-line">${lines.join("<br>") || "No one hit."}</div>`
      + (jammed ? `<div class="bdh-card-line fail">&#9888; Jammed! (natural 9)</div>` : "")
      + (resist ? `<div class="bdh-card-line bdh-qnote">Select a hit token, then test:</div>${resist}` : "") + `</div>`,
    flags: { [NS]: { kind: "sprayResult", qualities, damageType: f.damageType } },
  });
}
async function applyOnFireDamage(message) {
  const f = message.flags[NS];
  const target = await resolveDefender(f);
  if (!target) { ui.notifications.warn("Select a token to apply fire damage."); return; }
  const tb = target.system.characteristics.toughness.bonus ?? 0;
  const dealt = Math.max(0, (f.damage ?? 0) - tb);   // ignore armour, toughness soaks
  const w = target.system.wounds;
  const res = applyWounds(w.value, w.max, dealt);
  await target.update({ "system.wounds.value": res.wounds, "system.wounds.critical": (w.critical ?? 0) + res.critical });
  await addFatigue(target, 1);
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${target.name} takes ${dealt} Energy damage (Body) and 1 Fatigue from fire</header>`
      + `<div class="bdh-card-line">1d10: ${f.damage} − Toughness ${tb} = ${dealt} (armour ignored)</div></div>` });
}
async function rollOnFireWP(message) {
  const f = message.flags[NS];
  const target = await resolveDefender(f);
  if (!target) { ui.notifications.warn("Select a token for the Willpower test."); return; }
  const label = "Willpower (On Fire)";
  const choice = await promptTest({ title: label, defaultModifier: "0" });
  if (!choice) return null;
  return performTest(target, { label, base: target.system.characteristics.willpower.total, modifier: choice.modifier });
}
const DAMAGE_CARD = "systems/better-dh2e/templates/chat/damage-card.hbs";

async function rollDamage(message) {
  const f = message.flags[NS];

  // --- Blast branch: ONE shared roll for all tokens still inside the template ---
  if (f.regionUuid) {
    const region = await fromUuid(f.regionUuid);
    const caught = new Set(f.caughtUuids ?? []);
    const pool = (region ? tokensInRegion(region) : [])
      .filter((t) => caught.has(t.actor.uuid));    // RAW: re-check who is STILL inside before rolling
    if (!pool.length) {
      ui.notifications.info("No targets remain in the blast.");
      await deleteRegionByUuid(f.regionUuid);   // everyone moved out → no damage, clean up
      return;
    }
    // Build the weapon formula the same way the normal path does (no RoF loop, no per-hit bonus).
    const actor = await fromUuid(f.actorUuid);
    const weapon = actor?.items.get(f.weaponId);
    if (!weapon) return;
    const baseFormula = weapon.system.damage;
    const qualities = f.qualities ?? weapon.system.qualities ?? [];
    // Ranged blast: strBonus is always 0, craftDmg is 0 (melee-only).
    let weaponBase = baseFormula;
    if (f.maximal) weaponBase = `${weaponBase} + 1d10`;
    if (f.scatterDmg) weaponBase = `${weaponBase} ${f.scatterDmg > 0 ? "+" : "-"} ${Math.abs(f.scatterDmg)}`;
    if (f.helpless) weaponBase = doubleDamageDice(weaponBase);
    const weaponFormula = weaponDamageFormula(qualities, weaponBase);
    const dmgRoll = await safeRoll(weaponFormula, "weapon damage");
    if (!dmgRoll) return;
    const breakdown = formatRoll(dmgRoll);
    const cardData = {
      blast: true,
      weaponName: f.weaponName ?? weapon.name,
      damageType: f.damageType,
      penetration: f.penetration,
      poolNames: pool.map((t) => t.name).join(", "),
      damageTotal: dmgRoll.total,
      breakdown,
      // Per-token quality resist buttons are NOT shown on blast cards — they would test only the primary
      // target, not the pool (multi-target quality conditions are a deferred slice).
      damageNotes: qualityNotes(qualities, "damage"),
    };
    const content = await renderTemplate(DAMAGE_CARD, cardData);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      rolls: [dmgRoll],
      flags: {
        [NS]: {
          ...f,
          blast: true,
          poolUuids: pool.map((t) => t.actor.uuid),
          damageTotal: dmgRoll.total,
          penetration: f.penetration,
          damageType: f.damageType,
          qualities: f.qualities ?? [],
          regionUuid: f.regionUuid,
        },
      },
    });
    return;
  }

  const actor = await fromUuid(f.actorUuid);
  const psychic = !!f.psychic;
  const weapon = psychic ? null : actor?.items.get(f.weaponId);
  if (!psychic && !weapon) return;
  const baseFormula = psychic ? (f.damage || "0") : weapon.system.damage;   // e.g. "1d10+3" or PR-substituted formula
  const weaponDisplayName = f.weaponName ?? weapon?.name;
  const mod = await DialogV2.prompt({
    window: { title: `${weaponDisplayName} — Damage` },
    content: `<div class="form-group"><label>Damage Modifier (flat or dice)</label><input type="text" name="mod" value="+0"/></div>`,
    ok: { label: "Roll", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object.mod },
    rejectClose: false
  });
  if (mod == null) return;
  const trimmed = String(mod).trim();
  const qualities = psychic ? (f.qualities ?? []) : (f.qualities ?? weapon.system.qualities ?? []);
  const dos = f.dos ?? 0;
  const rfThreshold = vengefulValue(qualities) || 10;
  const primitiveX = primitiveValue(qualities);
  const provenX = provenValue(qualities);
  const transform = (v) => transformDamageDie(v, { primitiveX, provenX });
  const dieDelta = (roll) => {
    if (!roll) return 0;
    let d = 0;
    for (const die of roll.dice) for (const r of die.results) if (r.active) d += transform(r.result) - r.result;
    return d;
  };
  // Melee-only bonuses: psychic powers skip craftsmanship and Strength bonus.
  const craftDmg = (!psychic && !f.isRanged) ? meleeCraftDamageBonus(weapon.system.craftsmanship) : 0;
  // Melee weapons add the attacker's Strength Bonus (already includes unnatural Strength) to each hit.
  const strBonus = (!psychic && !f.isRanged) ? (actor.system.characteristics.strength?.bonus ?? 0) : 0;
  let weaponBase = baseFormula;
  if (strBonus) weaponBase = `${weaponBase} + ${strBonus}`;
  if (craftDmg) weaponBase = `${weaponBase} + ${craftDmg}`;
  if (f.maximal) weaponBase = `${weaponBase} + 1d10`;
  if (f.scatterDmg) weaponBase = `${weaponBase} ${f.scatterDmg > 0 ? "+" : "-"} ${Math.abs(f.scatterDmg)}`;
  if (f.helpless) weaponBase = doubleDamageDice(weaponBase);   // every die term doubles for Helpless
  const rolls = [];
  const rolled = [];   // per hit: { hit, wRoll, bRoll, rf, baseTotal }
  for (const hit of f.hits) {
    // Weapon damage — RF-eligible; Tearing applies to the weapon dice only.
    const weaponFormula = weaponDamageFormula(qualities, weaponBase);
    const wRoll = await safeRoll(weaponFormula, "weapon damage");
    if (!wRoll) return;
    const rf = wRoll.dice.some((d) => d.faces === 10 && d.results.some((res) => res.active && res.result >= rfThreshold));
    rolls.push(wRoll);
    // Bonus damage — non-RF; first hit only: the input modifier + Accurate's DoS dice.
    const bonusParts = [];
    if (hit.index === 0) {
      if (trimmed && trimmed !== "+0") bonusParts.push(trimmed);
      const acc = accurateBonusDice(qualities, { isRanged: f.isRanged, aiming: f.aiming, dos });
      if (acc) bonusParts.push(acc);
    }
    let bRoll = null;
    if (bonusParts.length) { bRoll = await safeRoll(bonusParts.join(" + "), "damage modifier"); if (!bRoll) return; rolls.push(bRoll); }
    rolled.push({ hit, wRoll, bRoll, rf, baseTotal: wRoll.total + (bRoll?.total ?? 0) + dieDelta(wRoll) + dieDelta(bRoll) });
  }
  // RAW: the attacker may replace ONE damage die in the whole attack with the DoS — auto-pick the global lowest active die if it's below the DoS.
  let subResult = null;
  let subHitIdx = -1;
  rolled.forEach(({ wRoll, bRoll }, i) => {
    for (const roll of [wRoll, bRoll].filter(Boolean)) {
      for (const die of roll.dice) for (const r of die.results) {
        if (r.active && (subResult === null || transform(r.result) < transform(subResult.result))) { subResult = r; subHitIdx = i; }
      }
    }
  });
  const applySub = subResult !== null && transform(subResult.result) < dos;
  const hits = rolled.map(({ hit, wRoll, bRoll, rf, baseTotal }, i) => {
    const sr = applySub && i === subHitIdx ? subResult : null;
    const total = baseTotal + (sr ? dos - transform(subResult.result) : 0);
    const bonusBreak = bRoll ? formatRoll(bRoll, sr, dos, transform) : "";
    const breakdown = formatRoll(wRoll, sr, dos, transform) + (bonusBreak ? `+${bonusBreak.replace(/^\+/, "")}` : "");
    return { index: hit.index, location: hit.location, label: hit.label, total, rf, breakdown };
  });
  const cardData = { weaponName: weaponDisplayName, damageType: f.damageType, penetration: f.penetration, hits,
    targetName: f.targetName, canApply: !!f.targetUuid, shocking: hasShocking(qualities),
    concussive: concussiveValue(qualities) || null,
    flame: hasFlame(qualities),
    hallucinogenic: hallucinogenicValue(qualities) || null,
    snare: snareValue(qualities) || null,
    toxic: battlemapEnabled() ? null : (toxicValue(qualities) || null),
    damageNotes: qualityNotes(qualities, "damage") };
  const content = await renderTemplate("systems/better-dh2e/templates/chat/damage-card.hbs", cardData);
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }), rolls, content,
    flags: { [NS]: { type: "damage", targetUuid: f.targetUuid, targetName: f.targetName, penetration: f.penetration, damageType: f.damageType,
      qualities: f.qualities ?? [],
      hits: hits.map((h) => ({ location: h.location, label: h.label, total: h.total, rf: h.rf })) } }
  };
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
}
async function rollEvade(message) {
  const f = message.flags[NS];
  // Defender: the bound target if available, else the user's controlled token, else their assigned character.
  const defender = (await fromUuid(f.targetUuid)) ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!defender) { ui.notifications.warn("Select a token to evade with."); return; }
  const meleeWeapons = defender.items.filter((i) => i.type === "weapon" && i.system.weaponClass === "melee" && i.system.equipped);
  const parryWeapons = meleeWeapons.filter((i) => !hasUnwieldy(i.system.qualities));
  const onlyUnwieldy = meleeWeapons.length > 0 && parryWeapons.length === 0;   // holding only Unwieldy melee
  const flexible = hasFlexible(f.qualities);
  const noParry = flexible || onlyUnwieldy;
  const parryOption = noParry ? "" : `<option value="parry">Parry</option>`;
  const parryNote = flexible
    ? `<div class="form-group"><p class="hint">This weapon is Flexible — it cannot be parried.</p></div>`
    : onlyUnwieldy
    ? `<div class="form-group"><p class="hint">Your only melee weapon is Unwieldy — it cannot parry.</p></div>`
    : "";
  const choice = await DialogV2.prompt({
    window: { title: "Evade" },
    content: `${parryNote}<div class="form-group"><label>Reaction</label><select name="reaction"><option value="dodge">Dodge</option>${parryOption}</select></div>
              <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>`,
    ok: { label: "React", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if (!choice) return;
  const modifier = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  const evadeCondMod = battlemapEnabled() ? evadeConditionModifier(defender.statuses) : 0;
  // Defensive guard: block Parry if the incoming weapon is Flexible or the defender's only melee weapons are Unwieldy.
  if (noParry && choice.reaction === "parry") {
    ui.notifications.warn(flexible ? "A Flexible weapon cannot be parried." : "An Unwieldy weapon cannot parry.");
    return null;
  }
  if (choice.reaction === "parry") {
    const pmod = parryModifier(parryWeapons.map((i) => ({ qualities: i.system.qualities, craftsmanship: i.system.craftsmanship })));
    const base = defender.system.characteristics.weaponSkill.total;
    const label = pmod ? `Parry (WS, weapon ${pmod >= 0 ? "+" : ""}${pmod})` : "Parry (WS)";
    return performTest(defender, { label, base, modifier: modifier + pmod + evadeCondMod });
  }
  const dodge = defender.system.skills.dodge;
  const base = defender.system.characteristics.agility.total + (BDH.skillRanks[dodge.rank] ?? -20);
  return performTest(defender, { label: "Dodge", base, modifier: modifier + evadeCondMod });
}
/**
 * Apply one hit's worth of damage to a token's actor: soak vs armour@location + toughness, then wounds.
 * Returns the effective dealt amount (after soak).
 * @param {Actor} actor
 * @param {{damageTotal: number, penetration: number, damageType: string, qualities: object[], location: string}} opts
 * @returns {Promise<number>}
 */
async function applyHitToToken(actor, { damageTotal, penetration, damageType, qualities, location }) {
  const sys = actor.system;
  const tb = sys.characteristics.toughness.bonus;
  const equipped = actor.items.filter((i) => i.type === "armour" && i.system.equipped).map((a) => a.system);
  const ap = computeArmour(equipped, 0);   // pure per-location AP (tb=0 so TB isn't folded in)
  const felX = fellingValue(qualities);
  const tbEff = felX ? felledToughnessBonus(tb, sys.characteristics.toughness.unnatural ?? 0, felX) : tb;
  const graviton = hasGraviton(qualities);
  const locAp = ap[location] ?? 0;
  const eff = soak(damageTotal + (graviton ? locAp : 0), locAp, penetration, tbEff);
  const w = sys.wounds;
  const res = applyWounds(w.value, w.max, eff);
  await actor.update({ "system.wounds.value": res.wounds, "system.wounds.critical": (w.critical ?? 0) + res.critical });
  return eff;
}

async function applyDamage(message) {
  const f = message.flags[NS];

  // --- Blast branch: soak each pooled token individually, per-token hit location ---
  if (f.blast) {
    const lines = [];
    for (const uuid of f.poolUuids ?? []) {
      const actor = await fromUuid(uuid);
      if (!actor) continue;
      const location = hitLocation((await safeRoll("1d100", "hit location"))?.total ?? 50);
      const dealt = await applyHitToToken(actor, {
        damageTotal: f.damageTotal, penetration: f.penetration, damageType: f.damageType, qualities: f.qualities ?? [], location,
      });
      lines.push(`${actor.name}: ${dealt} dmg (${BDH.hitLocationLabels[location] ?? location})`);
    }
    await deleteRegionByUuid(f.regionUuid);   // remove the template after applying
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker(),
      content: `<div class="bdh-card"><header class="bdh-card-head">Blast damage applied</header><div class="bdh-card-line">${lines.join("<br>") || "No targets."}</div></div>`,
    });
    return;
  }

  // --- Single-target branch ---
  const target = await fromUuid(f.targetUuid);
  if (!target) { ui.notifications.warn("No target to apply damage to."); return; }
  const sys = target.system;
  const qualities = f.qualities ?? [];
  let prevCrit = sys.wounds.critical ?? 0;
  let maxApplied = 0;   // largest single hit's effective damage (Concussive Prone trigger)
  const lines = [];
  for (const h of f.hits) {
    const eff = await applyHitToToken(target, {
      damageTotal: h.total, penetration: f.penetration, damageType: f.damageType, qualities, location: h.location,
    });
    const nowCrit = target.system.wounds.critical ?? 0;
    const hitCrit = nowCrit - prevCrit;
    prevCrit = nowCrit;
    maxApplied = Math.max(maxApplied, eff);
    lines.push(`${h.label}: ${h.total} → ${eff} dmg${hitCrit > 0 ? ` (${hitCrit} critical)` : ""}`);
  }
  const totalCrit = (target.system.wounds.critical ?? 0) - (sys.wounds.critical ?? 0);
  const wounds = target.system.wounds.value;
  // Concussive: a single blow exceeding the target's Strength Bonus knocks it Prone.
  if (battlemapEnabled() && qualities.some((q) => q.key === "concussive")
      && maxApplied > (target.system.characteristics.strength.bonus ?? 0)) {
    await applyProne(target);
  }
  // Toxic: if any hit dealt >=1 effective damage, apply the Toxic condition at the weapon's potency.
  const toxPot = toxicValue(qualities);
  if (battlemapEnabled() && toxPot > 0 && maxApplied >= 1) {
    await applyToxic(target, toxPot, f.damageType ?? "");
  }
  const crit = totalCrit > 0 ? `<div class="bdh-card-line fail">Critical damage: ${totalCrit}</div>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="bdh-card"><div class="bdh-card-head">${target.name} — Damage Applied</div><div class="bdh-card-line">${lines.join("<br>")}</div>${crit}<div class="bdh-card-line">Wounds: ${wounds} / ${sys.wounds.max}</div></div>`
  });
}

async function rollOverheatDrop(message) {
  const f = message.flags[NS];
  const attacker = await fromUuid(f.actorUuid);
  const weapon = attacker?.items.get(f.weaponId);
  if (!weapon) return;
  await weapon.update({ "system.equipped": false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="bdh-card"><div class="bdh-card-line">${attacker.name} drops ${weapon.name} — overheat avoided.</div></div>`
  });
}

async function rollOverheatDamage(message) {
  const f = message.flags[NS];
  const attacker = await fromUuid(f.actorUuid);
  const weapon = attacker?.items.get(f.weaponId);
  if (!weapon) return;
  const hand = await DialogV2.prompt({
    window: { title: "Overheat — which hand?" },
    content: `<div class="form-group"><label>Hand</label><select name="hand"><option value="rightArm">Right Arm</option><option value="leftArm">Left Arm</option></select></div>`,
    ok: { label: "Roll Damage", callback: (event, button) => button.form.elements.hand.value },
    rejectClose: false
  });
  if (!hand) return;
  const roll = await safeRoll(weapon.system.damage, "weapon damage");
  if (!roll) return;
  const rf = roll.dice.some((d) => d.faces === 10 && d.results.some((r) => r.active && r.result === 10));
  const hits = [{ location: hand, label: BDH.hitLocationLabels[hand], total: roll.total, rf, breakdown: formatRoll(roll) }];
  const cardData = {
    weaponName: `${weapon.name} (Overheat)`, damageType: weapon.system.damageType, penetration: 0, hits,
    targetName: attacker.name, canApply: true,
    shocking: false, concussive: null, flame: false, hallucinogenic: null, damageNotes: ""
  };
  const content = await renderTemplate("systems/better-dh2e/templates/chat/damage-card.hbs", cardData);
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor: attacker }), rolls: [roll], content,
    flags: { [NS]: { type: "damage", targetUuid: attacker.uuid, targetName: attacker.name, penetration: 0,
      damageType: weapon.system.damageType, qualities: [],
      hits: hits.map((h) => ({ location: h.location, label: h.label, total: h.total, rf: h.rf })) } }
  };
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
}

/** Auto-roll an equipped force field for a hit target. No-op if the target has no equipped field. */
async function rollForceField(actor) {
  const field = actor?.items.find((i) => i.type === "forceField" && i.system.equipped);
  if (!field) return;
  const roll = await new Roll("1d100").evaluate();
  const res = forceFieldResult(roll.total, field.system.protectionRating, field.system.overload);
  const content = await renderTemplate("systems/better-dh2e/templates/chat/forcefield-card.hbs", {
    fieldName: field.name,
    protection: field.system.protectionRating,
    overloadRating: field.system.overload,
    roll: roll.total,
    success: res.success,
    overloaded: res.overload,
  });
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll] };
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
}

/**
 * Full to-hit roll for a weapon: dialog (Aim / Attack Type / Range / Called-Shot) →
 * 1d100 vs WS or BS → DoS → hits + locations + jam → attack chat card.
 * @param {Actor} actor
 * @param {string} weaponId
 * @returns {Promise<ChatMessage|null>}
 */
async function rollSpray(actor, weapon) {
  const token = actor.getActiveTokens()[0];
  if (!token) { ui.notifications.warn("The attacker needs a token on the scene."); return; }
  // Minimize open windows (the sheet blocks the map) so the player can see + aim the cone; restore after.
  const minimized = [];
  for (const app of foundry.applications.instances.values()) {
    if (app.rendered && !app.minimized) { await app.minimize(); minimized.push(app); }
  }
  const length = Number(weapon.system.range) || 10;            // cone length = weapon range (m)
  const region = await placeConeRegion(token, length, 30);
  for (const app of minimized) await app.maximize?.();         // restore windows after placement/cancel
  if (!region) return;                                          // cancelled
  const caught = tokensInRegion(region).filter((t) => t.actor && t.actor.uuid !== actor.uuid);
  const rows = caught.map((t) => ({ uuid: t.actor.uuid, name: t.name }));
  if (!rows.length) await deleteRegionByUuid(region.uuid);   // caught no one → no apply step, clean up now
  const cardData = { weaponName: weapon.name, caught: rows, hasCaught: rows.length > 0, damageType: weapon.system.damageType };
  const content = await renderTemplate("systems/better-dh2e/templates/chat/spray-card.hbs", cardData);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), content,
    flags: { [NS]: { kind: "spray", actorUuid: actor.uuid, weaponId: weapon.id, regionUuid: rows.length ? region.uuid : null,
      caughtUuids: rows.map((r) => r.uuid), damageType: weapon.system.damageType } },
  });
}

export async function rollAttack(actor, weaponId) {
  const weapon = actor.items.get(weaponId);
  if (!weapon) return null;

  const isSpray = (weapon.system.qualities ?? []).some((q) => q.key === "spray");
  if (battlemapEnabled() && isSpray) return rollSpray(actor, weapon);

  const isMelee = weapon.system.weaponClass === "melee";
  const isRanged = !isMelee;
  const charKey = isMelee ? "weaponSkill" : "ballisticSkill";

  // Build option HTML for selects
  const typeOpts = Object.entries(BDH.attackTypes)
    .filter(([k, t]) => (t.scope === "any" || t.scope === (isMelee ? "melee" : "ranged"))
      && !(k === "lightning" && hasUnwieldy(weapon.system.qualities)))
    .map(([k, t]) => `<option value="${k}">${t.label}</option>`)
    .join("");

  const aimOpts = Object.entries(BDH.aimOptions)
    .map(([k, a]) => `<option value="${k}">${a.label}</option>`)
    .join("");

  const targetTok = game.user.targets.first() ?? null;

  let defaultRange = "normal";
  let measuredDistance = null;
  if (isRanged && battlemapEnabled() && (weapon.system.range ?? 0) > 0) {
    const attackerTok = actor.getActiveTokens?.()[0] ?? canvas.tokens?.controlled?.[0] ?? null;
    if (targetTok && attackerTok && targetTok.scene?.id === attackerTok.scene?.id) {
      // v13/v14 grid measurement between token centres.
      const path = canvas.grid.measurePath([attackerTok.center, targetTok.center]);
      measuredDistance = Math.round(path?.distance ?? path ?? 0);
      // NOTE (deferred): if the attacker is engaged in melee, Point-Blank should NOT apply.
      // Requires melee-engagement tracking (Foundry statuses/conditions) — a later battlemap piece.
      defaultRange = rangeBand(measuredDistance, weapon.system.range);
    }
  }

  const rangeOpts = Object.entries(BDH.rangeOptions)
    .map(([k, r]) => `<option value="${k}"${k === defaultRange ? " selected" : ""}>${r.label}</option>`)
    .join("");

  const locOpts = Object.entries(BDH.hitLocationLabels)
    .map(([k, l]) => `<option value="${k}">${l}</option>`)
    .join("");

  const charShort = BDH.characteristics[charKey].short;
  const maximalRow = isRanged && hasMaximal(weapon.system.qualities)
    ? `<div class="form-group"><label>Maximal (×3 ammo)</label><input type="checkbox" name="maximal"/></div>` : "";

  // Target-condition row and self-condition row for the dialog display (the to-hit modifier itself is
  // computed in resolveAttack, so it stays correct on Fate rerolls too).
  let targetCondRow = "", selfCondRow = "";
  if (battlemapEnabled()) {
    if (targetTok?.actor) {
      const cmods = targetAttackModifiers(targetTok.actor.statuses, isMelee, defaultRange);
      const parts = cmods.map((m) => `${m.label} (${m.mod > 0 ? "+" : ""}${m.mod})`);
      // Helpless isn't a numeric mod (melee auto-hit + doubled dice) — surface it in the row.
      if (isMelee && targetTok.actor.statuses?.has?.("helpless")) parts.unshift("Helpless (auto-hit, ×2 dice)");
      if (parts.length) targetCondRow = `<div class="form-group"><label>Target has</label><span class="bdh-target-cond">${parts.join(", ")}</span></div>`;
    }
    const smods = selfAttackModifiers(actor.statuses, isMelee);
    if (smods.length) selfCondRow = `<div class="form-group"><label>You have</label><span class="bdh-self-cond">${smods.map((m) => `${m.label} (${m.mod > 0 ? "+" : ""}${m.mod})`).join(", ")}</span></div>`;
  }

  // Target Size row — always shown when the target's size is not Average (4).
  let targetSizeRow = "";
  if (targetTok?.actor) {
    const sz = targetTok.actor.system?.size ?? 4;
    const m = sizeToHitModifier(sz);
    if (m !== 0) targetSizeRow = `<div class="form-group"><label>Target Size</label><span class="bdh-target-size">${BDH.sizes[sz]} (${m > 0 ? "+" : ""}${m})</span></div>`;
  }

  const dialogContent = `
    ${targetSizeRow}
    ${targetCondRow}
    ${selfCondRow}
    <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>
    <div class="form-group"><label>Aim</label><select name="aim">${aimOpts}</select></div>
    <div class="form-group"><label>Attack Type</label><select name="attackType">${typeOpts}</select></div>
    ${isRanged && measuredDistance != null ? `<div class="form-group"><label>Range to Target</label><span class="bdh-measured">${measuredDistance} m</span></div>` : ""}
    ${isRanged ? `<div class="form-group"><label>Range</label><select name="range">${rangeOpts}</select></div>` : ""}
    <div class="form-group" id="bdh-cs-row" style="display:none"><label>Called-Shot Location</label><select name="calledShotLocation">${locOpts}</select></div>
    ${maximalRow}`;

  const choice = await DialogV2.prompt({
    window: { title: `${weapon.name} — Attack (${charShort})` },
    content: dialogContent,
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog.element;
      const sel = root.querySelector('[name="attackType"]');
      const row = root.querySelector('#bdh-cs-row');
      if (!sel || !row) return;
      const toggle = () => { row.style.display = sel.value === "calledShot" ? "" : "none"; };
      sel.addEventListener("change", toggle);
      toggle();
    },
    ok: {
      label: "Attack",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  });
  if (!choice) return null;
  return resolveAttack(actor, weapon, choice, { consumeAmmo: true });
}

/**
 * Resolution body for an attack: 1d100 → DoS → hits/locations/jam → attack chat card.
 * Separated from rollAttack so Fate rerolls can invoke it without re-showing the dialog.
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {object} choice   — the FormData object from the attack dialog
 * @param {object} [opts]
 * @param {boolean} [opts.consumeAmmo=true]  — set false to skip the clip deduction (Fate reroll)
 * @param {string|null} [opts.targetUuid]    — override live targets (Fate reroll re-targets original)
 * @param {string|null} [opts.targetName]    — override live target name
 * @returns {Promise<ChatMessage|null>}
 */
export async function resolveAttack(actor, weapon, choice, opts = {}) {
  const { consumeAmmo = true, fixedRoll = null, dosBonus = 0 } = opts;

  // Recompute setup-scope locals (needed whether called from rollAttack or a reroll)
  const isMelee = weapon.system.weaponClass === "melee";
  const isRanged = !isMelee;
  const charKey = isMelee ? "weaponSkill" : "ballisticSkill";
  const charShort = BDH.characteristics[charKey].short;
  const storm = hasStorm(weapon.system.qualities);
  const maximal = isRanged && !!choice.maximal;

  // Target-condition + self-condition to-hit modifiers — resolved here (from the live target or the
  // reroll's stored target) so they apply on the normal path AND on Fate rerolls.
  const condTarget = opts.targetUuid ? fromUuidSync(opts.targetUuid) : (game.user.targets.first()?.actor ?? null);
  let conditionMod = 0;
  if (battlemapEnabled()) {
    if (condTarget) conditionMod += targetAttackModifiers(condTarget.statuses, isMelee, choice.range).reduce((s, m) => s + m.mod, 0);
    conditionMod += selfAttackModifiers(actor.statuses, isMelee).reduce((s, m) => s + m.mod, 0);
  }

  // Size modifier vs the target — always active, not battlemap-gated.
  const sizeMod = condTarget ? sizeToHitModifier(condTarget.system?.size ?? 4) : 0;

  // Combine modifiers, clamped ±60
  const at = BDH.attackTypes[choice.attackType];
  const aimMod = hasInaccurate(weapon.system.qualities) ? 0 : (BDH.aimOptions[choice.aim]?.mod ?? 0);
  const rangeMod = isRanged ? (BDH.rangeOptions[choice.range]?.mod ?? 0) : 0;
  const manual = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  const aiming = choice.aim !== "none";
  const qualMod = qualityToHitMod(weapon.system.qualities, { aiming });
  const craftMod = isMelee ? meleeCraftToHit(weapon.system.craftsmanship) : 0;
  const scatterMod = scatterToHit(weapon.system.qualities, choice.range);
  const rawModifier = manual + aimMod + rangeMod + at.mod + qualMod + craftMod + scatterMod + conditionMod + sizeMod;
  const base = actor.system.characteristics[charKey].total;

  // Ammo check — block if clip is too low; compute rounds consumed for this attack type
  const usesAmmo = weaponClassFlags(weapon.system.weaponClass).usesAmmo;
  const rounds = (at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : (weapon.system.rateOfFire?.single || 1)) * (maximal ? 3 : 1) * (storm ? 2 : 1);
  // Only gate on ammo when we'd actually consume it — a Fate reroll re-resolves the same (already-fired) shot.
  if (consumeAmmo && usesAmmo && (weapon.system.clip?.value ?? 0) < rounds) {
    ui.notifications.warn(`Not enough ammo: needs ${rounds}, ${weapon.system.clip?.value ?? 0} in the clip.`);
    return null;
  }

  // Roll and evaluate
  const roll = fixedRoll != null ? { total: fixedRoll } : await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: rawModifier, roll: roll.total });
  // evaluateTest returns: { base, modifier (clamped), target, roll, success, degrees }
  let { success, degrees, target, modifier } = result;

  // Degrees of success (0 on failure)
  let dos = success ? degrees + dosBonus : 0;

  // Helpless target: melee attacks auto-succeed with DoS = attacker WS bonus
  const vsHelpless = isMelee && battlemapEnabled() && (condTarget?.statuses?.has?.("helpless") ?? false);
  if (vsHelpless) {
    success = true;
    dos = actor.system.characteristics.weaponSkill.bonus ?? 0;   // DoS = attacker WS bonus
  }

  // Effective penetration (Lance scales with DoS; Melta doubles at close range)
  const penetration = effectivePenetration((weapon.system.penetration ?? 0) + (maximal ? 2 : 0), {
    qualities: weapon.system.qualities,
    dos,
    success,
    closeRange: ["pointBlank", "short"].includes(choice.range)
  });

  // RoF cap
  const rofCap = at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : Infinity;

  // Hit count and locations
  let nHits = success ? computeHits(at, dos, storm ? Infinity : rofCap) : 0;
  if (storm && success) nHits = Math.min(nHits * 2, rofCap);
  const firstLoc = at.calledShot ? choice.calledShotLocation : hitLocation(roll.total);
  const locs = success ? locationSequence(firstLoc, nHits) : [];

  // Jam check
  const jammed = checkJam(roll.total, success, isRanged, effectiveJamFloor(weapon.system.qualities, weapon.system.craftsmanship));

  // Scatter flat damage modifier (range-based; 0 for melee or no Scatter quality)
  const scatterDmg = scatterDamage(weapon.system.qualities, choice.range);

  // Target token — opts override takes precedence (Fate reroll), else read live targets
  const liveTarget = opts.targetUuid ? null : (game.user.targets.first() ?? null);
  const targetUuid = opts.targetUuid ?? liveTarget?.actor?.uuid ?? null;
  const targetName = opts.targetName ?? liveTarget?.name ?? null;

  // Build hits array for the card and flags
  const hits = locs.map((loc, i) => ({ index: i, location: loc, label: BDH.hitLocationLabels[loc] }));

  // Blast(X) — place a circle Region on the target, scatter on miss
  let blastFlags = null, blastCaughtNames = "";
  const blastQuality = (weapon.system.qualities ?? []).find((q) => q.key === "blast");
  const blastX = blastQuality ? (Number(blastQuality.value) || 0) + (maximal ? 2 : 0) : 0;   // Maximal: +2 Blast
  // Resolve target token PLACEABLE (not just actor): liveTarget is already the Token placeable on live path;
  // on Fate-reroll path (opts.targetUuid set, liveTarget null), derive from game.user.targets or the actor.
  const targetToken = liveTarget ?? (opts.targetUuid
    ? (game.user.targets.first()?.actor?.uuid === opts.targetUuid
        ? game.user.targets.first()
        : fromUuidSync(opts.targetUuid)?.getActiveTokens?.()[0] ?? null)
    : null);
  if (battlemapEnabled() && blastX > 0 && targetToken?.center) {
    let { x, y } = targetToken.center;
    if (!success) {                                   // MISS → scatter 1d5 squares in a 1d10 direction
      const dist = (await safeRoll("1d5", "scatter distance"))?.total ?? 1;
      const dir = (await safeRoll("1d10", "scatter direction"))?.total ?? 1;
      const { dx, dy } = scatterDirection(dir);
      x += dx * dist * canvas.dimensions.size;        // canvas.dimensions.size = pixels per square
      y += dy * dist * canvas.dimensions.size;
    }
    const region = await createBlastRegion(canvas.scene, x, y, blastX);
    const caughtToks = tokensInRegion(region);
    if (caughtToks.length) {
      blastFlags = { blast: blastX, regionUuid: region.uuid, caughtUuids: caughtToks.map((t) => t.actor.uuid), scattered: !success };
      blastCaughtNames = caughtToks.map((t) => t.name).join(", ");
    } else {
      await deleteRegionByUuid(region.uuid);   // scattered into empty space → no damage step, clean up now
    }
  }

  // Message flags (namespace "better-dh2e")
  const flags = {
    [NS]: {
      type: "attack",
      actorUuid: actor.uuid,
      weaponId: weapon.id,
      isRanged,
      maximal,
      penetration,
      damageType: weapon.system.damageType,
      qualities: weapon.system.qualities ?? [],
      aiming,
      dos,
      targetUuid,
      targetName,
      hits,
      success,
      jammed,
      scatterDmg,
      helpless: vsHelpless,
      reroll: { kind: "attack", actorUuid: actor.uuid, weaponId: weapon.id, choice, targetUuid, targetName, roll: roll.total, success, dosBonus },
      ...(blastFlags ?? {})
    }
  };

  // Quality labels for the card
  const qualityLabels = (weapon.system.qualities ?? [])
    .map((q) => `${CONFIG.BDH.qualities[q.key]?.label ?? q.key}${q.value ? ` (${q.value})` : ""}`)
    .join(", ");

  // Render card template
  const modifierLabel = `${modifier >= 0 ? "+" : ""}${modifier}`;
  const stripMod = (s) => (s ?? "").replace(/\s[+−-]\d+$/, "");   // "Half Aim +10" -> "Half Aim"
  const aimLabel = stripMod(BDH.aimOptions[choice.aim]?.label) || "No Aim";
  const rangeLabel = isRanged ? (stripMod(BDH.rangeOptions[choice.range]?.label) || "Normal") : null;
  const content = await renderTemplate(CARD, {
    weaponName: weapon.name,
    charShort,
    target,
    modifier,
    modifierLabel,
    roll: roll.total,
    success,
    degrees: success ? dos : degrees,
    attackTypeLabel: at.label,
    aimLabel,
    rangeLabel,
    hits,
    jammed,
    overheats: jammed && hasOverheats(weapon.system.qualities),
    targetName,
    hasHits: nHits > 0,
    // Show Roll Damage / Evade on a HIT, OR for a blast that caught targets even on a miss (scatter still lands).
    showActions: nHits > 0 || !!blastFlags,
    qualityLabels,
    attackNotes: qualityNotes(weapon.system.qualities, "attack", { maximal }),
    dosBonus,
    helplessNote: vsHelpless ? "Automatic Hit (Helpless)" : null,
    blastCaught: blastCaughtNames || null,
    blastScattered: blastFlags?.scattered ?? false
  });

  // Create chat message (apply current roll mode)
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags
  };
  if (fixedRoll == null) messageData.rolls = [roll];
  ChatMessage.applyRollMode(messageData, "roll");
  const msg = await ChatMessage.create(messageData);
  // Force field: a hit target with an equipped field auto-tests it.
  if (success && liveTarget?.actor) await rollForceField(liveTarget.actor);
  // Deduct rounds after the message is created (jam still consumes); skip on rerolls
  if (consumeAmmo && usesAmmo) await weapon.update({ "system.clip.value": weapon.system.clip.value - rounds });
  return msg;
}
