// scripts/rolls/fate.mjs — Spend Fate to reroll a test.
import { performTest } from "./roll-test.mjs";
import { resolveAttack } from "./attack.mjs";
import { resolveManifest } from "./manifest.mjs";
import { resolveRequisition } from "./requisition.mjs";
import { releaseSustained } from "./sustain.mjs";
import { rerollResistTest } from "./resist-effects.mjs";
import { maleficCorruptionGain } from "../helpers/psychic-manifest.mjs";
import { deleteRegionByUuid } from "../canvas/region.mjs";

const NS = "better-dh2e";
const SPENT_KEY = "spentCards";
/** Spent cards remembered per actor. Old cards scroll out of reach long before this many rerolls. */
const SPENT_KEEP = 40;

// A reroll or "+1 DoS" SUPERSEDES the card it is spent on: a new card is posted and the old one is
// history. Left live, the old card could be rerolled or boosted again and again, each pass
// re-running its kind's undo — a Malefic cast took its Corruption grant back every time
// (14 → 10 → 6). So the actor remembers the ids of the cards it has spent Fate on:
//   flags.better-dh2e.spentCards = [messageId, …]   (oldest first, last SPENT_KEEP kept)
// On the ACTOR, not the card: whoever spends the Fate owns the actor, but is often not the card's
// author, and only a card's author or a GM can update it.
function spentCards(actor) {
  const raw = actor?.getFlag?.(NS, SPENT_KEY);
  return Array.isArray(raw) ? raw : [];
}
const isSpent = (actor, message) => !!message?.id && spentCards(actor).includes(message.id);

/** The actor update that spends one Fate point AND marks `message` spent — one write, so the two
 *  cannot land separately. */
function spendFate(actor, message, fate) {
  const changes = { "system.fate.value": fate - 1 };
  if (message?.id) {
    changes[`flags.${NS}.${SPENT_KEY}`] = [...spentCards(actor).filter((id) => id !== message.id), message.id].slice(-SPENT_KEEP);
  }
  return actor.update(changes);
}

/** What a card needs in order to be re-resolved, looked up BEFORE any Fate is spent: an attack
 *  needs its weapon, a cast its power. Returns { ok: false } after warning when it is gone —
 *  spending the point and then silently doing nothing was the old behaviour. */
async function resolveSubject(actor, rr) {
  if (rr.kind === "attack") {
    const weapon = actor.items.get(rr.weaponId) ?? (rr.weaponUuid ? await fromUuid(rr.weaponUuid) : null);
    if (!weapon) { ui.notifications.warn("The weapon on this card no longer exists — no Fate was spent."); return { ok: false }; }
    return { ok: true, weapon };
  }
  if (rr.kind === "cast") {
    const power = actor.items.get(rr.powerId);
    if (!power) { ui.notifications.warn("The power on this card no longer exists — no Fate was spent."); return { ok: false }; }
    return { ok: true, power };
  }
  return { ok: true };
}

/** The reroll payload of a card Fate may be spent on, or null. A blast DAMAGE card is not one:
 *  cards posted before the fix in attack.mjs copied the attack card's payload onto it, and they are
 *  still in chat logs — spending Fate there re-fired the attack after its damage had been rolled.
 *  A damage card is marked `blast: true`; the attack card carries the blast RADIUS in that field. */
function rerollPayload(message) {
  const f = message?.flags?.[NS];
  if (!f?.reroll || f.blast === true) return null;
  return f.reroll;
}

/** May the current user spend Fate to reroll this message? (owns the actor + has ≥1 Fate + the
 *  card has not already had Fate spent on it) */
export function canReroll(message) {
  const rr = rerollPayload(message);
  if (!rr) return false;
  const actor = fromUuidSync(rr.actorUuid);
  return !!actor?.isOwner && (actor.system?.fate?.value ?? 0) >= 1 && !isSpent(actor, message);
}

/** Spend 1 Fate → post a "spends Fate" card → re-resolve the test with a fresh roll. */
export async function rerollFromFate(message) {
  const rr = rerollPayload(message);
  if (!rr) return;
  const actor = await fromUuid(rr.actorUuid);
  if (!actor?.isOwner) { ui.notifications.warn("You don't own this character."); return; }
  const fate = actor.system.fate?.value ?? 0;
  if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
  if (isSpent(actor, message)) { ui.notifications.warn("Fate has already been spent on that roll — use the card that replaced it."); return; }
  const { ok, weapon, power } = await resolveSubject(actor, rr);
  if (!ok) return;
  await spendFate(actor, message, fate);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} spends a Fate point to reroll.</header></div>`
  });
  if (rr.kind === "test") {
    // A resist test's failure changed the actor (On Fire, Stunned, wounds …). The reroll replaces
    // that result, so the change is undone before rolling again — re-rolling the dice alone left a
    // "Success" card over a target that was still On Fire. Cards from before resist-effects.mjs
    // carry no `resist` and reroll as they always did.
    if (rr.resist) await rerollResistTest(actor, rr);
    else await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier, characteristic: rr.characteristic });
  } else if (rr.kind === "attack") {
    // The rerolled attempt's template is gone: re-resolving places a fresh one. Safe when the uuid
    // is null or the Region was already deleted — deleteRegionByUuid tolerates both. (An
    // unresolvable weapon never gets this far: resolveSubject stopped before the Fate was spent,
    // so the old template is not destroyed for a reroll that cannot happen.)
    await deleteRegionByUuid(rr.regionUuid);
    // replay: the target is the CARD's — possibly none — never whoever the user has targeted now.
    // fieldTested: a force field is tested once per attack. Cards from before the flag existed
    // tested it on every targeted hit, so for them a hit means "already tested".
    await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, replay: true, fieldTested: rr.fieldTested ?? !!rr.success, targetUuid: rr.targetUuid, targetName: rr.targetName, aimPoint: rr.aimPoint ?? null });
  } else if (rr.kind === "cast") {
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
    if (rr.success && game.settings.get(NS, "maleficCorruption")) {
      // Reuse the rule helper rather than restating it here — the cast's effective PR is on the
      // payload (statePR is the fallback for legacy cards that carried only a rung).
      const undo = maleficCorruptionGain(power.system?.discipline, true, rr.effPR ?? rr.statePR);
      if (undo) await actor.update({ "system.corruption": Math.max(0, (actor.system.corruption ?? 0) - undo) });
    }
    await resolveManifest(actor, power, { rulesetKey: rr.rulesetKey, state: rr.state, statePR: rr.statePR, prBonus: rr.prBonus, effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName, sustain: rr.sustain });
  } else if (rr.kind === "requisition") {
    // The whole choice is stored, so the rerolled card keeps its item and its Add button —
    // the "test" branch passes only label/base/modifier and would drop both.
    const actor2 = await fromUuid(rr.actorUuid);
    if (actor2) await resolveRequisition(actor2, rr.choice);
  }
}

/** May the current user spend Fate to add +1 DoS? (success + owns + ≥1 Fate + not already boosted
 *  + the card has not already had Fate spent on it) */
export function canAddDoS(message) {
  const rr = rerollPayload(message);
  if (!rr || !rr.success || (rr.dosBonus ?? 0) !== 0) return false;
  if (rr.kind === "requisition") return false;
  const actor = fromUuidSync(rr.actorUuid);
  return !!actor?.isOwner && (actor.system?.fate?.value ?? 0) >= 1 && !isSpent(actor, message);
}

/** Spend 1 Fate → re-resolve the SAME roll with +1 DoS (non-stackable). */
export async function addDoSFromFate(message) {
  const rr = rerollPayload(message);
  if (!rr || !rr.success || (rr.dosBonus ?? 0) !== 0) return;
  if (rr.kind === "requisition") return;
  const actor = await fromUuid(rr.actorUuid);
  if (!actor?.isOwner) { ui.notifications.warn("You don't own this character."); return; }
  const fate = actor.system.fate?.value ?? 0;
  if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
  if (isSpent(actor, message)) { ui.notifications.warn("Fate has already been spent on that roll — use the card that replaced it."); return; }
  const { ok, weapon, power } = await resolveSubject(actor, rr);
  if (!ok) return;
  await spendFate(actor, message, fate);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} spends a Fate point (+1 DoS).</header></div>`
  });
  const boost = { fixedRoll: rr.roll, dosBonus: 1 };
  if (rr.kind === "test") {
    // +1 DoS replays the SAME roll, and is only offered on a success — which applied nothing, so
    // there is nothing to undo. `resist` rides along so the new card is still a resist card.
    await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier, characteristic: rr.characteristic, resist: rr.resist ?? null, ...boost });
  } else if (rr.kind === "attack") {
    // Same as the plain reroll: this path re-runs the placement block too, so the old template goes.
    await deleteRegionByUuid(rr.regionUuid);
    await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, replay: true, fieldTested: rr.fieldTested ?? !!rr.success, targetUuid: rr.targetUuid, targetName: rr.targetName, aimPoint: rr.aimPoint ?? null, ...boost });
  } else if (rr.kind === "cast") {
    await resolveManifest(actor, power, { rulesetKey: rr.rulesetKey, state: rr.state, statePR: rr.statePR, prBonus: rr.prBonus, effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName, sustain: rr.sustain, ...boost });
  }
}
