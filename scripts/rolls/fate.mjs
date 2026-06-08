// scripts/rolls/fate.mjs — Spend Fate to reroll a test.
import { performTest } from "./roll-test.mjs";
import { resolveAttack } from "./attack.mjs";
import { resolveManifest } from "./manifest.mjs";

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
    await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier });
  } else if (rr.kind === "attack") {
    const weapon = actor.items.get(rr.weaponId);
    if (weapon) await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, targetUuid: rr.targetUuid, targetName: rr.targetName });
  } else if (rr.kind === "cast") {
    const power = actor.items.get(rr.powerId);
    if (power) await resolveManifest(actor, power, { effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName });
  }
}
