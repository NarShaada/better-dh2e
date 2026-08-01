// scripts/rolls/sustain.mjs — actor-side sustained-power state: flag I/O and chat cards.
// Mirrors conditions.mjs: the RULES live in helpers/sustain-data.mjs (pure, unit-tested); this
// module only touches Foundry. State is one flag holding an ordered array, oldest first:
//   flags.better-dh2e.sustained = [{ powerId, name, castEffPR, sustainAction }]
// `name` and `sustainAction` are snapshots taken at cast, so an entry survives its Item being
// deleted mid-combat — release keys on powerId, not on the Item.
import { resolveSustained, reminderLines } from "../helpers/sustain-data.mjs";
import { escapeHtml } from "../helpers/html-escape.mjs";

const NS = "better-dh2e";
const KEY = "sustained";

/** The actor's sustained-power entries, oldest first. Always an array. */
export function readSustained(actor) {
  const raw = actor?.getFlag(NS, KEY);
  return Array.isArray(raw) ? raw : [];
}

/** Add an entry, or replace it in place when the power is already held — re-manifesting at a
 *  higher PR upgrades the running effect instead of double-counting toward the psyker's own
 *  penalty. Then apply the PR-0 cascade and report anything it ended. */
export async function addSustained(actor, entry) {
  const entries = readSustained(actor);
  const at = entries.findIndex((x) => x.powerId === entry.powerId);
  if (at >= 0) entries[at] = entry; else entries.push(entry);

  const { survivors, dropped } = resolveSustained(entries);
  await actor.setFlag(NS, KEY, survivors);
  if (dropped.length) await postDropped(actor, dropped);
}

/** Release one held power. The only way the block empties, apart from the PR-0 cascade. */
export async function releaseSustained(actor, powerId) {
  await actor.setFlag(NS, KEY, readSustained(actor).filter((x) => x.powerId !== powerId));
}

async function postDropped(actor, dropped) {
  const names = escapeHtml(dropped.map((x) => x.name).join(", "));
  const verb = dropped.length === 1 ? "ends" : "end";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${escapeHtml(actor.name)} overreaches.</header>`
      + `<div class="bdh-card-line">Sustaining this many powers drops the effective Psy Rating to zero — ${names} ${verb}.</div>`
      + `</div>`
  });
}

/** Turn-start reminder of the action cost, and the phenomena bonus when it applies.
 *  No-op when the actor is sustaining nothing. */
export async function postSustainReminder(actor) {
  const lines = reminderLines(actor.name, readSustained(actor));
  if (!lines.length) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${escapeHtml(lines[0])}</header>`
      + (lines[1] ? `<div class="bdh-card-line">${escapeHtml(lines[1])}</div>` : "")
      + `</div>`
  });
}
