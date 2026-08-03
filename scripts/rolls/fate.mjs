// scripts/rolls/fate.mjs — Spend Fate to reroll a test.
import { performTest } from "./roll-test.mjs";
import { resolveAttack } from "./attack.mjs";
import { resolveManifest } from "./manifest.mjs";
import { resolveRequisition } from "./requisition.mjs";
import { releaseSustained } from "./sustain.mjs";
import { maleficCorruptionGain } from "../helpers/psychic-manifest.mjs";

const NS = "better-dh2e";

/** May the current user spend Fate to reroll this message? (owns the actor + has ≥1 Fate) */
export function canReroll(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr) return false;
  const actor = fromUuidSync(rr.actorUuid);
  return !!actor?.isOwner && (actor.system?.fate?.value ?? 0) >= 1;
}

/** Spend 1 Fate → post a "spends Fate" card → re-resolve the test with a fresh roll. */
export async function rerollFromFate(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr) return;
  const actor = await fromUuid(rr.actorUuid);
  if (!actor?.isOwner) { ui.notifications.warn("You don't own this character."); return; }
  const fate = actor.system.fate?.value ?? 0;
  if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
  await actor.update({ "system.fate.value": fate - 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} spends a Fate point to reroll.</header></div>`
  });
  if (rr.kind === "test") {
    await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier, characteristic: rr.characteristic });
  } else if (rr.kind === "attack") {
    const weapon = actor.items.get(rr.weaponId) ?? (rr.weaponUuid ? await fromUuid(rr.weaponUuid) : null);
    if (weapon) await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, targetUuid: rr.targetUuid, targetName: rr.targetName });
  } else if (rr.kind === "cast") {
    const power = actor.items.get(rr.powerId);
    // A reroll re-plays the same moment: the successful cast being rerolled already entered the
    // sustained block, so release it FIRST. Otherwise a reroll that fails would leave the entry
    // behind, and the live `sustainCount` read inside resolveManifest would count the power being
    // recast toward its own phenomena strain.
    if (rr.success && rr.sustain) await releaseSustained(actor, rr.powerId);
    // Same shape for Malefic Corruption (Enemies Beyond p. 54): a successful cast already granted
    // its points, and the re-resolution grants again — or grants nothing, if the reroll fails. Take
    // the original grant back FIRST so the new outcome replaces it instead of stacking (and so a
    // reroll into failure doesn't leave corruption raised behind a "Failure" card).
    // Gated on the setting: if the GM turned Malefic Corruption off since the cast, the system never
    // granted these points and must not subtract them.
    if (rr.success && power && game.settings.get(NS, "maleficCorruption")) {
      // Reuse the rule helper rather than restating it here — the cast's effective PR is on the
      // payload (statePR is the fallback for legacy cards that carried only a rung).
      const undo = maleficCorruptionGain(power.system?.discipline, true, rr.effPR ?? rr.statePR);
      if (undo) await actor.update({ "system.corruption": Math.max(0, (actor.system.corruption ?? 0) - undo) });
    }
    if (power) await resolveManifest(actor, power, { rulesetKey: rr.rulesetKey, state: rr.state, statePR: rr.statePR, prBonus: rr.prBonus, effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName, sustain: rr.sustain });
  } else if (rr.kind === "requisition") {
    // The whole choice is stored, so the rerolled card keeps its item and its Add button —
    // the "test" branch passes only label/base/modifier and would drop both.
    const actor2 = await fromUuid(rr.actorUuid);
    if (actor2) await resolveRequisition(actor2, rr.choice);
  }
}

/** May the current user spend Fate to add +1 DoS? (success + owns + ≥1 Fate + not already boosted) */
export function canAddDoS(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr || !rr.success || (rr.dosBonus ?? 0) !== 0) return false;
  if (rr.kind === "requisition") return false;
  const actor = fromUuidSync(rr.actorUuid);
  return !!actor?.isOwner && (actor.system?.fate?.value ?? 0) >= 1;
}

/** Spend 1 Fate → re-resolve the SAME roll with +1 DoS (non-stackable). */
export async function addDoSFromFate(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr || !rr.success || (rr.dosBonus ?? 0) !== 0) return;
  if (rr.kind === "requisition") return;
  const actor = await fromUuid(rr.actorUuid);
  if (!actor?.isOwner) { ui.notifications.warn("You don't own this character."); return; }
  const fate = actor.system.fate?.value ?? 0;
  if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
  await actor.update({ "system.fate.value": fate - 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} spends a Fate point (+1 DoS).</header></div>`
  });
  const boost = { fixedRoll: rr.roll, dosBonus: 1 };
  if (rr.kind === "test") {
    await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier, characteristic: rr.characteristic, ...boost });
  } else if (rr.kind === "attack") {
    const weapon = actor.items.get(rr.weaponId) ?? (rr.weaponUuid ? await fromUuid(rr.weaponUuid) : null);
    if (weapon) await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, targetUuid: rr.targetUuid, targetName: rr.targetName, ...boost });
  } else if (rr.kind === "cast") {
    const power = actor.items.get(rr.powerId);
    if (power) await resolveManifest(actor, power, { rulesetKey: rr.rulesetKey, state: rr.state, statePR: rr.statePR, prBonus: rr.prBonus, effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName, sustain: rr.sustain, ...boost });
  }
}
