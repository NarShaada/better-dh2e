// scripts/helpers/sustain-data.mjs — sustained-psychic-power rules (p. 195). PURE: no Foundry.
//
// The book prints this rule twice and the printings disagree at exactly one sustained power.
// Table 6-1's "Sustaining Powers" column reads "+10 to all rolls on Table 6-2, decrease psy rating
// by 1 per power" with no qualifier; the p. 195 body text applies both effects only when sustaining
// TWO OR MORE. They agree at 2+ and differ at 1, which is the common case. The body text wins:
// a single sustained power costs no PR and adds no phenomena bonus.
//
// Dark Heresy 2e and Black Crusade print this rule identically, so there is no ruleset branch here.

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
