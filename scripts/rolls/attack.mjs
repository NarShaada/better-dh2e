// scripts/rolls/attack.mjs
// Full to-hit flow: dialog → 1d100 → DoS/hits/locations/jam → attack chat card.
import { evaluateTest } from "./test-logic.mjs";
import { hitLocation, computeHits, locationSequence, checkJam } from "../helpers/attack-math.mjs";
import { BDH } from "../config.mjs";

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
    });
  });
}

// --- Follow-up step handlers (filled in by later tasks) ---
async function rollDamage(message) { /* Plan 16 Task 5 */ }
async function rollEvade(message) { /* Plan 16 Task 7 */ }
async function applyDamage(message) { /* Plan 16 Task 6 */ }

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
  const rawModifier = manual + aimMod + rangeMod + at.mod;
  const base = actor.system.characteristics[charKey].total;

  // Roll and evaluate
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: rawModifier, roll: roll.total });
  // evaluateTest returns: { base, modifier (clamped), target, roll, success, degrees }
  const { success, degrees, target, modifier } = result;

  // Degrees of success (0 on failure)
  const dos = success ? degrees : 0;

  // RoF cap
  const rofCap = at.rof ? (weapon.system.rateOfFire?.[at.rof] ?? 1) : Infinity;

  // Hit count and locations
  const nHits = success ? computeHits(at, dos, rofCap) : 0;
  const firstLoc = at.calledShot ? choice.calledShotLocation : hitLocation(roll.total);
  const locs = success ? locationSequence(firstLoc, nHits) : [];

  // Jam check
  const jammed = checkJam(roll.total, success, isRanged);

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
      targetUuid: targetToken?.actor?.uuid ?? null,
      targetName: targetToken?.name ?? null,
      hits,
      success,
      jammed
    }
  };

  // Render card template
  const modifierLabel = `${modifier >= 0 ? "+" : ""}${modifier}`;
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
    hits,
    jammed,
    targetName: targetToken?.name ?? null,
    hasHits: nHits > 0
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
