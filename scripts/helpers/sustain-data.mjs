// scripts/helpers/sustain-data.mjs — sustained-psychic-power rules (p. 195). PURE: no Foundry.
//
// The book prints this rule twice and the printings disagree at exactly one sustained power.
// Table 6-1's "Sustaining Powers" column reads "+10 to all rolls on Table 6-2, decrease psy rating
// by 1 per power" with no qualifier; the p. 195 body text applies both effects only when sustaining
// TWO OR MORE. They agree at 2+ and differ at 1, which is the common case. The body text wins:
// a single sustained power costs no PR and adds no phenomena bonus.
//
// Dark Heresy 2e and Black Crusade print this rule identically, so there is no ruleset branch here.

import { BDH } from "../config.mjs";

/** Sustain action cost, cheapest first. See BDH.sustainActions for why `reaction` is absent. */
export const SUSTAIN_RANK = { no: 0, free: 1, half: 2, full: 3 };

/** Coerce a legacy or malformed `system.sustained` into a valid key.
 *  Pre-enum worlds stored a boolean, and a choices-constrained StringField THROWS on one — see
 *  the migrateData note in base-item-model.mjs for what that throw breaks. */
export function normalizeSustain(value) {
  if (value === true) return "half";
  if (typeof value === "string" && value in SUSTAIN_RANK) return value;
  return "no";
}

/** The action the psyker must spend this turn: the costliest among the powers being sustained. */
export function longestSustainAction(entries) {
  let best = "no";
  for (const e of entries ?? []) {
    const key = normalizeSustain(e?.sustainAction);
    if (SUSTAIN_RANK[key] > SUSTAIN_RANK[best]) best = key;
  }
  return best;
}

/** A held power's live effective PR. No penalty below two sustained powers (p. 195 body text).
 *  `castEffPR` is the effPR the power was cast at — snapshotted, never recomputed. */
export function currentPR(castEffPR, count) {
  return count < 2 ? castEffPR : castEffPR - count;
}

/** +10 per power sustained beyond the first, for the Table 6-2 roll only. */
export function phenomenaSustainBonus(count) {
  return 10 * Math.max(0, count - 1);
}

/** Apply the PR penalty and end anything it reduces to 0 or less.
 *
 *  A power cannot be cast at effective PR 0, so a held power driven to 0 has no effect and ends.
 *  Applying that naively cascades: three powers cast at PR 2 are all at -1 and would all die at
 *  once, leaving the psyker nothing when the maths permits one survivor. So remove ONE entry per
 *  pass — the lowest current PR, ties to the newest — and recompute, which drops the fewest
 *  possible. Terminates: every pass removes exactly one entry.
 *
 *  Returns fresh arrays; the input is not mutated. `dropped` is in removal order (weakest first) —
 *  NOT newest first: with [A castEffPR 1, B 2, C 2] the strict minimum removes the OLDEST entry
 *  first. Ties alone break to the newest; that is what makes the all-equal case look newest-first. */
export function resolveSustained(entries) {
  const survivors = [...(entries ?? [])];
  const dropped = [];
  for (;;) {
    const count = survivors.length;
    let worst = -1;
    let worstPR = Infinity;
    for (let i = 0; i < count; i++) {
      const pr = currentPR(survivors[i].castEffPR, count);
      // `<=` keeps the LAST tied entry, and the array is oldest-first, so ties break to the newest.
      if (pr <= 0 && pr <= worstPR) { worst = i; worstPR = pr; }
    }
    if (worst === -1) return { survivors, dropped };
    dropped.push(survivors.splice(worst, 1)[0]);
  }
}

/** The turn-start reminder, as plain text lines. Pure so the wording is testable without Foundry;
 *  the caller escapes and wraps them in markup. Empty array when nothing is sustained. */
export function reminderLines(actorName, entries) {
  const held = entries ?? [];
  const count = held.length;
  if (count === 0) return [];
  const action = BDH.sustainActions[longestSustainAction(held)];
  const names = held.map((x) => x.name).join(", ");
  const lines = [`${actorName} must spend a ${action} to sustain ${count} power${count === 1 ? "" : "s"}: ${names}.`];
  const bonus = phenomenaSustainBonus(count);
  if (bonus > 0) lines.push(`+${bonus} to Psychic Phenomena while sustained.`);
  return lines;
}
