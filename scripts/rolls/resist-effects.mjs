// scripts/rolls/resist-effects.mjs — resist tests whose FAILURE changes the target, and the
// bookkeeping that lets a Fate reroll take that change back.
//
// Shocking, Concussive, Flame, Snare, Toxic and Rad-Phage each end in a test the target rolls; fail
// it and something lands on the actor at once (a condition, Fatigue, wounds, characteristic damage).
// Spending Fate to reroll replays that moment, so the first result has to be REPLACED: before this
// module the reroll only re-rolled the dice, and a card could read "Success" over a target that
// was still On Fire.
//
// How it fits together:
//   - rollResistTest() rolls the test and, on a failure, applies the consequence and remembers
//     exactly what THAT ROLL changed in an actor flag (oldest first, last KEEP kept):
//       flags.better-dh2e.resistApplied = [{ id, at, effects?, stunned?, fatigue?, wounds?,
//                                            critical?, magnitude?, injury? } | { id, at, used }]
//     The card's reroll payload carries the matching `resist: { effect, id, at, … }`.
//   - rerollResistTest() (called by fate.mjs) undoes the remembered change, rolls again, and
//     applies whatever the new result calls for.
//
// THE SAFETY RULE. The undo is automatic only while the actor is still exactly as that roll left
// it; in every other case the reroll is DICE ONLY — what every reroll was before this module — and
// a chat note says so. Dice only when:
//   - the card was already rerolled (a `used` entry marks it) — else an old card could be undone,
//     or have its consequence applied, a second time;
//   - the roll is more than MAX_AGE_MS old — a Fate reroll belongs to the moment of the roll;
//   - a failed roll left no record (pushed out by later rolls, or its roller could not write one);
//   - anything the roll changed has changed again: the condition it added is gone or was replaced
//     by another (conditions are matched by the effect DOCUMENT it created, not by name), or the
//     Fatigue / Wounds / Critical / Magnitude value is no longer the one it left behind.
// It is all or nothing — never half an undo. A wrong automatic undo would be worse than none: it
// could wipe wounds dealt since, or put out a fire someone else lit. After a dice-only reroll the
// new card is a plain test card, so rerolling IT cannot start automating on top of an actor nobody
// undid.
//
// The record lives on the ACTOR, not the chat card, on purpose: whoever rerolls is an owner of the
// actor (canReroll requires it) but is often not the card's author — the GM clicks the chip, the
// player spends the Fate — and a ChatMessage can be updated only by its author or a GM. Nothing is
// written for a passed test, so a user who merely rolls someone else's test is never refused.
// Cards posted before this module existed carry no `resist` and keep rerolling as they did.
//
// NOT undone: Unconscious from the Fatigue knockout threshold (conditions.mjs applies it from a
// hook, some time after the Fatigue write, so it cannot be attributed to one roll) — the GM clears
// that by hand — and the chat cards the failure posted, which stay in the log with a note after them.
import { performTest } from "./roll-test.mjs";
import { applyStunned, addFatigue, applyOnFire, applyHelpless } from "./conditions.mjs";
import { applyWounds } from "../helpers/attack-math.mjs";
import { hordeMagnitudeLoss } from "../helpers/horde-data.mjs";
import { battlemapEnabled } from "../helpers/battlemap-data.mjs";
import { escapeHtml } from "../helpers/html-escape.mjs";

const NS = "better-dh2e";
const KEY = "resistApplied";
/** Entries kept per actor. Only recent rolls can be rerolled automatically anyway (MAX_AGE_MS). */
const KEEP = 12;
/** A Fate reroll belongs to the moment of the roll; past this it is dice only. */
const MAX_AGE_MS = 15 * 60 * 1000;

const STATUS_LABEL = { onFire: "On Fire", helpless: "Helpless", stunned: "Stunned" };

const hasStatus = (actor, id) =>
  !!(actor.statuses?.has?.(id) || actor.effects?.some?.((e) => e.statuses?.has?.(id)));
const effectWith = (actor, status) => actor.effects?.find?.((e) => e.statuses?.has?.(status)) ?? null;
const effectById = (actor, id) => actor.effects?.find?.((e) => e.id === id) ?? null;
const stunRounds = (eff) => eff?.flags?.[NS]?.rounds ?? 0;
const rounds = (n) => `${n} Round${n === 1 ? "" : "s"}`;
const sameInjury = (a) => (b) => ["type", "characteristic", "amount", "description"].every((k) => a?.[k] === b?.[k]);

/** The actor's entries, oldest first. Always an array. */
function readApplied(actor) {
  const raw = actor?.getFlag(NS, KEY);
  return Array.isArray(raw) ? raw : [];
}

async function note(actor, head, line) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${escapeHtml(actor.name)} — ${escapeHtml(head)}</header>`
      + `<div class="bdh-card-line">${escapeHtml(line)}</div></div>`
  });
}

// ---------------------------------------------------------------------------
// Consequences. Each applies one and returns what it changed ({} when it changed nothing).
// Numbers are stored as { by, after }: `by` is what to take back, `after` is the value the roll
// left behind — the undo runs only if the actor still reads `after`.
// ---------------------------------------------------------------------------

/** A condition the failure adds outright. Not recorded if the actor already had it; recorded by
 *  the id of the effect document it created, so only THAT effect is ever removed again. */
async function addStatus(actor, status, apply) {
  const had = hasStatus(actor, status);
  await apply(actor);
  const eff = had ? null : effectWith(actor, status);
  return eff?.id ? { effects: [{ status, id: eff.id }] } : {};
}

/** Stunned for `n` rounds: either new, or an existing Stunned made longer (applyStunned keeps the
 *  higher of the two) — the reroll must restore the earlier duration, not remove the condition. */
async function stun(actor, n) {
  const before = effectWith(actor, "stunned");
  const from = before ? stunRounds(before) : null;
  await applyStunned(actor, n);
  const after = effectWith(actor, "stunned");
  if (!after?.id) return {};
  if (from === null) return { effects: [{ status: "stunned", id: after.id }] };
  const to = stunRounds(after);
  return to > from ? { stunned: { id: after.id, from, to } } : {};
}

async function fatigue(actor, n) {
  const before = actor.system.fatigue?.value ?? 0;
  await addFatigue(actor, n);
  const after = actor.system.fatigue?.value ?? 0;
  return after > before ? { fatigue: { by: after - before, after } } : {};
}

/** Failed Toxic resist: 1d10 of the stored damage type, NOT reduced by armour or Toughness (per the
 *  Black Crusade wording of the same quality — DH2e leaves it implicit). */
async function toxicDamage(defender, resist) {
  const roll = await new Roll("1d10").evaluate();
  const dealt = roll.total;
  const type = resist.damageType ? `${resist.damageType} ` : "";   // omit if unknown rather than mislabel
  let statusLine = "";
  const changed = {};
  if (defender.type === "horde") {   // a horde has no wounds — apply the Magnitude rule instead
    const before = defender.system.magnitude ?? 0;
    const loss = hordeMagnitudeLoss(dealt);
    const mag = Math.max(0, before - loss);
    if (loss) await defender.update({ "system.magnitude": mag });
    statusLine = `<div class="bdh-card-line">Magnitude: ${mag} (−${loss})</div>`;
    if (before - mag > 0) changed.magnitude = { by: before - mag, after: mag };
  } else {
    const w = defender.system.wounds;
    const res = applyWounds(w.value, w.max, dealt);
    const critical = (w.critical ?? 0) + res.critical;
    // Deltas taken BEFORE the update: `w` is the live object and reads the new values after it.
    if (res.wounds - w.value > 0) changed.wounds = { by: res.wounds - w.value, after: res.wounds };
    if (res.critical > 0) changed.critical = { by: res.critical, after: critical };
    await defender.update({ "system.wounds.value": res.wounds, "system.wounds.critical": critical });
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    rolls: [roll],
    content: `<div class="bdh-card"><header class="bdh-card-head">${defender.name} takes ${dealt} ${type}damage from Toxic</header>`
      + `<div class="bdh-card-line">1d10: ${roll.total} (ignores armour &amp; Toughness)</div>${statusLine}</div>`
  });
  return changed;
}

/** Failed Rad-Phage: 2d10 raw Toughness characteristic damage (no soak), stored as a charDamage injury entry. */
async function radPhageDamage(defender) {
  const roll = await new Roll("2d10").evaluate();
  if (defender.type === "horde") {   // characteristic damage is meaningless on a Magnitude-only actor
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: defender }),
      rolls: [roll],
      content: `<div class="bdh-card"><header class="bdh-card-head">${defender.name} — Rad-Phage has no effect on a Horde</header></div>`
    });
    return {};
  }
  const entry = { type: "charDamage", characteristic: "toughness", amount: roll.total, description: "Rad-Phage" };
  const injuries = foundry.utils.deepClone(defender.system.injuries);
  injuries.push(entry);
  await defender.update({ "system.injuries": injuries });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: defender }),
    rolls: [roll],
    content: `<div class="bdh-card"><header class="bdh-card-head">${defender.name} suffers &minus;${roll.total} Toughness from Rad-Phage</header>`
      + `<div class="bdh-card-line">2d10: ${roll.total} characteristic damage (raw, armour &amp; Toughness ignored)</div></div>`
  });
  return { injury: entry };
}

/** effect key → (defender, resist, result) => what changed. `result` is a FAILED test. */
const EFFECTS = {
  shocking:    async (d, _resist, result) => ({ ...(await stun(d, Math.ceil(result.degrees / 2))), ...(await fatigue(d, 1)) }),
  concussive:  (d, _resist, result) => stun(d, result.degrees),
  flame:       (d) => addStatus(d, "onFire", applyOnFire),
  snare:       (d) => addStatus(d, "helpless", applyHelpless),
  toxicResist: toxicDamage,
  radPhage:    radPhageDamage,
};

// ---------------------------------------------------------------------------
// Undo
// ---------------------------------------------------------------------------

/** What a record says its roll applied, for the note on a dice-only reroll. */
function describeApplied(r) {
  const out = (r.effects ?? []).map((e) => STATUS_LABEL[e.status] ?? e.status);
  if (r.stunned) out.push(`Stunned lengthened to ${rounds(r.stunned.to)}`);
  if (r.fatigue) out.push(`Fatigue +${r.fatigue.by}`);
  if (r.wounds) out.push(`Wounds +${r.wounds.by}`);
  if (r.critical) out.push(`Critical +${r.critical.by}`);
  if (r.magnitude) out.push(`Magnitude −${r.magnitude.by}`);
  if (r.injury) out.push(`${r.injury.amount} ${r.injury.description} damage`);
  return out;
}

/** Is everything this roll changed still exactly as it left it? */
function intact(actor, r) {
  const sys = actor.system;
  if ((r.effects ?? []).some((e) => !effectById(actor, e.id))) return false;
  if (r.stunned) {
    const eff = effectById(actor, r.stunned.id);
    if (!eff || stunRounds(eff) !== r.stunned.to) return false;
  }
  if (r.fatigue && (sys.fatigue?.value ?? 0) !== r.fatigue.after) return false;
  if (r.wounds && (sys.wounds?.value ?? 0) !== r.wounds.after) return false;
  if (r.critical && (sys.wounds?.critical ?? 0) !== r.critical.after) return false;
  if (r.magnitude && (sys.magnitude ?? 0) !== r.magnitude.after) return false;
  if (r.injury && !(sys.injuries ?? []).some(sameInjury(r.injury))) return false;
  return true;
}

/** Why this card's reroll must be dice only, or null when the undo is safe. See THE SAFETY RULE. */
function whyDiceOnly(actor, rr, record) {
  if (record?.used) return "That roll has already been rerolled.";
  if (!(Date.now() - (rr.resist.at ?? 0) <= MAX_AGE_MS)) return "That roll was made too long ago to undo automatically.";
  if (!record) return rr.success ? null : "There is no record of what that roll applied.";
  return intact(actor, record) ? null : "The character has changed since that roll.";
}

/** Take back what `record` says its roll changed (null → nothing to take back) and store `entries`
 *  as the actor's new list. The list and every number land in ONE update, so two clients acting on
 *  the same card write the same absolute values rather than subtracting twice. Returns what was undone. */
async function undo(actor, record, entries) {
  const undone = [];
  const changes = { [`flags.${NS}.${KEY}`]: entries };
  if (record?.fatigue) {
    changes["system.fatigue.value"] = Math.max(0, record.fatigue.after - record.fatigue.by);
    undone.push(`Fatigue −${record.fatigue.by}`);
  }
  if (record?.wounds) {
    changes["system.wounds.value"] = Math.max(0, record.wounds.after - record.wounds.by);
    undone.push(`Wounds −${record.wounds.by}`);
  }
  if (record?.critical) {
    changes["system.wounds.critical"] = Math.max(0, record.critical.after - record.critical.by);
    undone.push(`Critical −${record.critical.by}`);
  }
  if (record?.magnitude) {
    changes["system.magnitude"] = record.magnitude.after + record.magnitude.by;
    undone.push(`Magnitude +${record.magnitude.by}`);
  }
  if (record?.injury) {
    const injuries = foundry.utils.deepClone(actor.system.injuries ?? []);
    const at = injuries.findLastIndex(sameInjury(record.injury));
    if (at >= 0) {
      injuries.splice(at, 1);
      changes["system.injuries"] = injuries;
      undone.push(`${record.injury.amount} ${record.injury.description} damage removed`);
    }
  }
  await actor.update(changes);

  for (const e of record?.effects ?? []) {
    await effectById(actor, e.id)?.delete();
    undone.push(`${STATUS_LABEL[e.status] ?? e.status} removed`);
  }
  if (record?.stunned) {
    await effectById(actor, record.stunned.id)?.update({ [`flags.${NS}.rounds`]: record.stunned.from });
    undone.push(`Stunned back to ${rounds(record.stunned.from)}`);
  }
  return undone;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/** Roll a resist test and apply the consequence of failing it.
 *  @param {Actor}  defender
 *  @param {{label:string, base:number, modifier:(string|number), characteristic:string}} test
 *  @param {string} effect  a key of EFFECTS
 *  @param {object} [data]  extra facts the consequence needs (Toxic's damage type); kept on the card
 *  @returns the test result, as performTest */
export async function rollResistTest(defender, test, effect, data = {}) {
  // Consequences are part of battlemap integration, exactly as the inline code this replaced.
  // Without it there is nothing to apply or undo, so the card is a plain test card.
  if (!battlemapEnabled()) return performTest(defender, test);
  const resist = { ...data, effect, id: foundry.utils.randomID(), at: Date.now() };
  const result = await performTest(defender, { ...test, resist });
  if (!result || result.success) return result;   // a pass changes nothing and writes nothing
  const changed = (await EFFECTS[effect]?.(defender, resist, result)) ?? {};
  // Recorded even when nothing changed (the target was already On Fire): that is what tells a
  // later reroll "this failure is fully accounted for" apart from "the record is missing".
  if (defender.isOwner) {
    await defender.setFlag(NS, KEY, [...readApplied(defender), { id: resist.id, at: resist.at, ...changed }].slice(-KEEP));
  }
  return result;
}

/** Fate reroll of a resist test card (`rr` is its reroll payload, which carries `resist`).
 *  Safe to undo → undo what that roll changed, roll again, apply the new result.
 *  Otherwise → roll the dice only, as before this module, and say why. */
export async function rerollResistTest(actor, rr) {
  const { id, effect, at, ...data } = rr.resist;
  const test = { label: rr.label, base: rr.base, modifier: rr.modifier, characteristic: rr.characteristic };
  const entries = readApplied(actor);
  const record = entries.find((r) => r.id === id) ?? null;
  // Either way this card is now spent: its entry becomes a `used` marker.
  const spent = [...entries.filter((r) => r.id !== id), { id, at: at ?? Date.now(), used: true }].slice(-KEEP);

  const reason = whyDiceOnly(actor, rr, record);
  if (reason) {
    if (!record?.used) await actor.setFlag(NS, KEY, spent);
    const applied = record && !record.used ? describeApplied(record) : [];
    await note(actor, "reroll resolved as dice only",
      `${reason}${applied.length ? ` It had applied: ${applied.join(", ")}.` : ""} Nothing was changed automatically — adjust the character by hand if the new result calls for it.`);
    return performTest(actor, test);
  }

  const undone = await undo(actor, record, spent);
  if (undone.length) await note(actor, "rerolled: the earlier result is undone", undone.join(" · "));
  return rollResistTest(actor, test, effect, data);
}
