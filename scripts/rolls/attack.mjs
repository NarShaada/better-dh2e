// scripts/rolls/attack.mjs
// Full to-hit flow: dialog → 1d100 → DoS/hits/locations/jam → attack chat card.
import { evaluateTest } from "./test-logic.mjs";
import { performTest } from "./roll-test.mjs";
import { hitLocation, computeHits, locationSequence, checkJam, soak, applyWounds } from "../helpers/attack-math.mjs";
import { computeArmour } from "../helpers/combat-data.mjs";
import { BDH } from "../config.mjs";
import { qualityToHitMod, qualityJamFloor, weaponDamageFormula, accurateBonusDice, parryModifier, hasShocking } from "../helpers/quality-modules.mjs";

const NS = "better-dh2e";
const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const CARD = "systems/better-dh2e/templates/chat/attack-card.hbs";

/** Bind attack/damage card buttons (called from the renderChatMessageHTML hook). */
export function bindCardButtons(message, html) {
  const flags = message.flags?.[NS];
  if (!flags) return;
  html.querySelectorAll("[data-bdh]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.bdh === "rollDamage") await rollDamage(message);
      else if (btn.dataset.bdh === "evade") await rollEvade(message);
      else if (btn.dataset.bdh === "applyDamage") await applyDamage(message);
      else if (btn.dataset.bdh === "shockTest") await rollShockTest(message);
    });
  });
}

/** Render a Roll as a transparent breakdown, e.g. "[4]+3+[5]+[2]" (dice in brackets, flats plain). */
function formatRoll(roll) {
  return roll.terms.map((t) => {
    if (Array.isArray(t.results)) return t.results.filter((r) => r.active).map((r) => `[${r.result}]`).join("+");
    if (t.operator) return t.operator;
    if (t.number !== undefined && t.number !== null) return String(t.number);
    return "";
  }).join("");
}

// --- Follow-up step handlers ---
async function rollShockTest(message) {
  const f = message.flags[NS];
  const target = await fromUuid(f.targetUuid);
  if (!target) return;
  return performTest(target, { label: "Toughness (Shocking)", base: target.system.characteristics.toughness.total, modifier: 0 });
}
async function rollDamage(message) {
  const f = message.flags[NS];
  const actor = await fromUuid(f.actorUuid);
  const weapon = actor?.items.get(f.weaponId);
  if (!weapon) return;
  const baseFormula = weapon.system.damage;            // e.g. "1d10+3"
  const mod = await DialogV2.prompt({
    window: { title: `${weapon.name} — Damage` },
    content: `<div class="form-group"><label>Damage Modifier (flat or dice)</label><input type="text" name="mod" value="+0"/></div>`,
    ok: { label: "Roll", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object.mod },
    rejectClose: false
  });
  if (mod == null) return;
  const trimmed = String(mod).trim();
  const qualities = f.qualities ?? [];
  const rolls = [];
  const hits = [];
  for (const hit of f.hits) {
    // Weapon damage — RF-eligible; Tearing applies to the weapon dice only.
    const weaponFormula = weaponDamageFormula(qualities, baseFormula);
    const wRoll = await new Roll(weaponFormula).evaluate();
    const rf = wRoll.dice.some((d) => d.faces === 10 && d.results.some((res) => res.active && res.result === 10));
    rolls.push(wRoll);
    // Bonus damage — non-RF; first hit only: the input modifier + Accurate's DoS dice.
    const bonusParts = [];
    if (hit.index === 0) {
      if (trimmed && trimmed !== "+0") bonusParts.push(trimmed);
      const acc = accurateBonusDice(qualities, { isRanged: f.isRanged, aiming: f.aiming, dos: f.dos });
      if (acc) bonusParts.push(acc);
    }
    let bonusTotal = 0;
    let bonusBreak = "";
    if (bonusParts.length) {
      const bRoll = await new Roll(bonusParts.join(" + ")).evaluate();
      rolls.push(bRoll);
      bonusTotal = bRoll.total;
      bonusBreak = formatRoll(bRoll);
    }
    const total = wRoll.total + bonusTotal;
    const breakdown = formatRoll(wRoll) + (bonusBreak ? `+${bonusBreak}` : "");
    hits.push({ index: hit.index, location: hit.location, label: hit.label, total, rf, breakdown });
  }
  const cardData = { weaponName: weapon.name, damageType: f.damageType, penetration: f.penetration, hits,
    targetName: f.targetName, canApply: game.user.isGM && !!f.targetUuid };
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
  const choice = await DialogV2.prompt({
    window: { title: "Evade" },
    content: `<div class="form-group"><label>Reaction</label><select name="reaction"><option value="dodge">Dodge</option><option value="parry">Parry</option></select></div>
              <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>`,
    ok: { label: "React", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if (!choice) return;
  const modifier = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  if (choice.reaction === "parry") {
    const meleeQs = defender.items
      .filter((i) => i.type === "weapon" && i.system.weaponClass === "melee" && i.system.equipped)
      .map((i) => i.system.qualities);
    const pmod = parryModifier(meleeQs);
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
  let wounds = sys.wounds.value;
  let totalCrit = 0;
  let dealtDamage = false;
  const lines = [];
  for (const h of f.hits) {
    const eff = soak(h.total, ap[h.location] ?? 0, f.penetration, tb);  // pen vs AP, then TB
    if (eff > 0) dealtDamage = true;
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
  if (hasShocking(f.qualities) && dealtDamage) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="bdh-card"><div class="bdh-card-head">⚡ Shocking — ${target.name}</div><div class="bdh-card-line">Must pass a Toughness test or be Stunned.</div><div class="bdh-card-actions"><button type="button" data-bdh="shockTest">Toughness Test</button></div></div>`,
      flags: { [NS]: { type: "shock", targetUuid: f.targetUuid } }
    });
  }
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
    .filter(([, t]) => t.scope === "any" || t.scope === (isMelee ? "melee" : "ranged"))
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
  const dialogContent = `
    <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>
    <div class="form-group"><label>Aim</label><select name="aim">${aimOpts}</select></div>
    <div class="form-group"><label>Attack Type</label><select name="attackType">${typeOpts}</select></div>
    ${isRanged ? `<div class="form-group"><label>Range</label><select name="range">${rangeOpts}</select></div>` : ""}
    <div class="form-group"><label>Called-Shot Location</label><select name="calledShotLocation">${locOpts}</select></div>`;

  const choice = await DialogV2.prompt({
    window: { title: `${weapon.name} — Attack (${charShort})` },
    content: dialogContent,
    rejectClose: false,
    ok: {
      label: "Attack",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  });
  if (!choice) return null;

  // Combine modifiers, clamped ±60
  const at = BDH.attackTypes[choice.attackType];
  const aimMod = BDH.aimOptions[choice.aim]?.mod ?? 0;
  const rangeMod = isRanged ? (BDH.rangeOptions[choice.range]?.mod ?? 0) : 0;
  const manual = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  const aiming = choice.aim !== "none";
  const qualMod = qualityToHitMod(weapon.system.qualities, { aiming });
  const rawModifier = manual + aimMod + rangeMod + at.mod + qualMod;
  const base = actor.system.characteristics[charKey].total;

  // Roll and evaluate
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: rawModifier, roll: roll.total });
  // evaluateTest returns: { base, modifier (clamped), target, roll, success, degrees }
  const { success, degrees, target, modifier } = result;

  // Degrees of success (0 on failure)
  const dos = success ? degrees : 0;

  // RoF cap
  const rofCap = at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : Infinity;

  // Hit count and locations
  const nHits = success ? computeHits(at, dos, rofCap) : 0;
  const firstLoc = at.calledShot ? choice.calledShotLocation : hitLocation(roll.total);
  const locs = success ? locationSequence(firstLoc, nHits) : [];

  // Jam check
  const jammed = checkJam(roll.total, success, isRanged, qualityJamFloor(weapon.system.qualities));

  // Target token (if any)
  const targetToken = game.user.targets.first() ?? null;

  // Build hits array for the card and flags
  const hits = locs.map((loc, i) => ({ index: i, location: loc, label: BDH.hitLocationLabels[loc] }));

  // Message flags (namespace "better-dh2e")
  const flags = {
    [NS]: {
      type: "attack",
      actorUuid: actor.uuid,
      weaponId,
      isRanged,
      penetration: weapon.system.penetration ?? 0,
      damageType: weapon.system.damageType,
      qualities: weapon.system.qualities ?? [],
      aiming,
      dos,
      targetUuid: targetToken?.actor?.uuid ?? null,
      targetName: targetToken?.name ?? null,
      hits,
      success,
      jammed
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
    targetName: targetToken?.name ?? null,
    hasHits: nHits > 0,
    qualityLabels
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
  return msg;
}
