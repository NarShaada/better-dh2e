// scripts/helpers/advancement-costs.mjs — PURE (config import only).
import { BDH } from "../config.mjs";

export const RANK_ORDER = ["untrained", "known", "trained", "experienced", "veteran"];

/** How many of an advance's aptitudes the character has (0/1/2). */
export function aptitudeMatches(advanceAptitudes, charAptitudes) {
  const set = new Set(charAptitudes);
  return advanceAptitudes.filter((a) => set.has(a)).length;
}

/** Cost to buy the next characteristic advance; advancesOwned = tiers already bought (0..4). Null if maxed. */
export function characteristicCost(matches, advancesOwned) {
  const table = BDH.xpCosts.characteristic[matches];
  return advancesOwned >= 0 && advancesOwned < table.length ? table[advancesOwned] : null;
}

/** Cost to advance a skill from its current rank to the next; null if already veteran. */
export function skillCost(matches, currentRank) {
  const level = RANK_ORDER.indexOf(currentRank);
  const table = BDH.xpCosts.skill[matches];
  return level >= 0 && level < table.length ? table[level] : null;
}

/** Cost of a talent by tier (1..3) and match count. */
export function talentCost(matches, tier) {
  const table = BDH.xpCosts.talent[matches];
  return tier >= 1 && tier <= table.length ? table[tier - 1] : null;
}
