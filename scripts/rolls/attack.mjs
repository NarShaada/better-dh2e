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
  // Apply Damage is only usable by an owner of the target (GM owns everything) — hide it for everyone else.
  const applyBtn = html.querySelector('[data-bdh="applyDamage"]');
  if (applyBtn) {
    const target = flags.targetUuid ? fromUuidSync(flags.targetUuid) : null;
    if (!target?.isOwner) applyBtn.remove();
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
  return performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
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
  return performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
}
async function rollFlameTest(message) {
  const defender = await resolveDefender(message.flags[NS]);
  if (!defender) { ui.notifications.warn("Select a token to test Agility."); return; }
  const label = "Agility (Flame)";
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.agility.total, modifier: choice.modifier });
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
  return performTest(defender, { label, base: defender.system.characteristics.agility.total, modifier: choice.modifier });
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
async function rollDamage(message) {
  const f = message.flags[NS];
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
  const rolls = [];
  const rolled = [];   // per hit: { hit, wRoll, bRoll, rf, baseTotal }
  for (const hit of f.hits) {
    // Weapon damage — RF-eligible; Tearing applies to the weapon dice only.
    const weaponFormula = weaponDamageFormula(qualities, weaponBase);
    const wRoll = await new Roll(weaponFormula).evaluate();
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
    if (bonusParts.length) { bRoll = await new Roll(bonusParts.join(" + ")).evaluate(); rolls.push(bRoll); }
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
    toxic: toxicValue(qualities) || null,
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
  // Defensive guard: block Parry if the incoming weapon is Flexible or the defender's only melee weapons are Unwieldy.
  if (noParry && choice.reaction === "parry") {
    ui.notifications.warn(flexible ? "A Flexible weapon cannot be parried." : "An Unwieldy weapon cannot parry.");
    return null;
  }
  if (choice.reaction === "parry") {
    const pmod = parryModifier(parryWeapons.map((i) => ({ qualities: i.system.qualities, craftsmanship: i.system.craftsmanship })));
    const base = defender.system.characteristics.weaponSkill.total;
    const label = pmod ? `Parry (WS, weapon ${pmod >= 0 ? "+" : ""}${pmod})` : "Parry (WS)";
    return performTest(defender, { label, base, modifier: modifier + pmod });
  }
  const dodge = defender.system.skills.dodge;
  const base = defender.system.characteristics.agility.total + (BDH.skillRanks[dodge.rank] ?? -20);
  return performTest(defender, { label: "Dodge", base, modifier });
}
async function applyDamage(message) {
  const f = message.flags[NS];
  const target = await fromUuid(f.targetUuid);
  if (!target) { ui.notifications.warn("No target to apply damage to."); return; }
  const sys = target.system;
  const tb = sys.characteristics.toughness.bonus;
  const equipped = target.items.filter((i) => i.type === "armour" && i.system.equipped).map((a) => a.system);
  const ap = computeArmour(equipped, 0);               // pure per-location AP (tb=0 so TB isn't folded in)
  const qualities = f.qualities ?? [];
  const felX = fellingValue(qualities);
  const tbEff = felX ? felledToughnessBonus(tb, sys.characteristics.toughness.unnatural ?? 0, felX) : tb;
  const graviton = hasGraviton(qualities);
  let wounds = sys.wounds.value;
  let totalCrit = 0;
  const lines = [];
  for (const h of f.hits) {
    const locAp = ap[h.location] ?? 0;
    const eff = soak(h.total + (graviton ? locAp : 0), locAp, f.penetration, tbEff);  // pen vs AP, then tbEff
    const res = applyWounds(wounds, sys.wounds.max, eff);
    wounds = res.wounds;
    totalCrit += res.critical;
    lines.push(`${h.label}: ${h.total} → ${eff} dmg${res.critical ? ` (${res.critical} critical)` : ""}`);
  }
  await target.update({ "system.wounds.value": wounds, "system.wounds.critical": (sys.wounds.critical ?? 0) + totalCrit });
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
  const roll = await new Roll(weapon.system.damage).evaluate();
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
export async function rollAttack(actor, weaponId) {
  const weapon = actor.items.get(weaponId);
  if (!weapon) return null;

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

  const rangeOpts = Object.entries(BDH.rangeOptions)
    .map(([k, r]) => `<option value="${k}"${k === "normal" ? " selected" : ""}>${r.label}</option>`)
    .join("");

  const locOpts = Object.entries(BDH.hitLocationLabels)
    .map(([k, l]) => `<option value="${k}">${l}</option>`)
    .join("");

  const charShort = BDH.characteristics[charKey].short;
  const maximalRow = isRanged && hasMaximal(weapon.system.qualities)
    ? `<div class="form-group"><label>Maximal (×3 ammo)</label><input type="checkbox" name="maximal"/></div>` : "";
  const dialogContent = `
    <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>
    <div class="form-group"><label>Aim</label><select name="aim">${aimOpts}</select></div>
    <div class="form-group"><label>Attack Type</label><select name="attackType">${typeOpts}</select></div>
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
  const { consumeAmmo = true } = opts;

  // Recompute setup-scope locals (needed whether called from rollAttack or a reroll)
  const isMelee = weapon.system.weaponClass === "melee";
  const isRanged = !isMelee;
  const charKey = isMelee ? "weaponSkill" : "ballisticSkill";
  const charShort = BDH.characteristics[charKey].short;
  const storm = hasStorm(weapon.system.qualities);
  const maximal = isRanged && !!choice.maximal;

  // Combine modifiers, clamped ±60
  const at = BDH.attackTypes[choice.attackType];
  const aimMod = hasInaccurate(weapon.system.qualities) ? 0 : (BDH.aimOptions[choice.aim]?.mod ?? 0);
  const rangeMod = isRanged ? (BDH.rangeOptions[choice.range]?.mod ?? 0) : 0;
  const manual = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  const aiming = choice.aim !== "none";
  const qualMod = qualityToHitMod(weapon.system.qualities, { aiming });
  const craftMod = isMelee ? meleeCraftToHit(weapon.system.craftsmanship) : 0;
  const scatterMod = scatterToHit(weapon.system.qualities, choice.range);
  const rawModifier = manual + aimMod + rangeMod + at.mod + qualMod + craftMod + scatterMod;
  const base = actor.system.characteristics[charKey].total;

  // Ammo check — block if clip is too low; compute rounds consumed for this attack type
  const usesAmmo = weaponClassFlags(weapon.system.weaponClass).usesAmmo;
  const rounds = (at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : (weapon.system.rateOfFire?.single || 1)) * (maximal ? 3 : 1) * (storm ? 2 : 1);
  if (usesAmmo && (weapon.system.clip?.value ?? 0) < rounds) {
    ui.notifications.warn(`Not enough ammo: needs ${rounds}, ${weapon.system.clip?.value ?? 0} in the clip.`);
    return null;
  }

  // Roll and evaluate
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: rawModifier, roll: roll.total });
  // evaluateTest returns: { base, modifier (clamped), target, roll, success, degrees }
  const { success, degrees, target, modifier } = result;

  // Degrees of success (0 on failure)
  const dos = success ? degrees : 0;

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
      reroll: { kind: "attack", actorUuid: actor.uuid, weaponId: weapon.id, choice, targetUuid, targetName }
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
    degrees,
    attackTypeLabel: at.label,
    aimLabel,
    rangeLabel,
    hits,
    jammed,
    overheats: jammed && hasOverheats(weapon.system.qualities),
    targetName,
    hasHits: nHits > 0,
    qualityLabels,
    attackNotes: qualityNotes(weapon.system.qualities, "attack", { maximal })
  });

  // Create chat message (apply current roll mode)
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll],
    content,
    flags
  };
  ChatMessage.applyRollMode(messageData, "roll");
  const msg = await ChatMessage.create(messageData);
  // Force field: a hit target with an equipped field auto-tests it.
  if (success && liveTarget?.actor) await rollForceField(liveTarget.actor);
  // Deduct rounds after the message is created (jam still consumes); skip on rerolls
  if (consumeAmmo && usesAmmo) await weapon.update({ "system.clip.value": weapon.system.clip.value - rounds });
  return msg;
}
