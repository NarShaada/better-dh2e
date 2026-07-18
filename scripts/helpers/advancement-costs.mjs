// scripts/helpers/advancement-costs.mjs — PURE (config import only).
import { BDH } from "../config.mjs";

export const RANK_ORDER = ["untrained", "known", "trained", "experienced", "veteran"];

/** How many of an advance's aptitudes the character has (0/1/2). */
export function aptitudeMatches(advanceAptitudes, charAptitudes) {
  const set = new Set(charAptitudes);
  return advanceAptitudes.filter((a) => set.has(a)).length;
}

/** BC alignment match tier as a DH2-style match count: True=2, Allied=1, Opposed=0.
 *  Unaligned is Allied to everything on either side (including unaligned-on-unaligned);
 *  Khorne↔Nurgle and Tzeentch↔Slaanesh are Allied; the remaining god pairs are Opposed. */
export function alignmentMatches(charAlignment, advanceAlignment) {
  const a = charAlignment || "unaligned";
  const b = advanceAlignment || "unaligned";
  if (a === "unaligned" || b === "unaligned") return 1;
  if (a === b) return 2;
  const allied = (x, y) => (x === "khorne" && y === "nurgle") || (x === "nurgle" && y === "khorne")
                        || (x === "tzeentch" && y === "slaanesh") || (x === "slaanesh" && y === "tzeentch");
  return allied(a, b) ? 1 : 0;
}

/** Shared table indexer: table = {2:[...],1:[...],0:[...]}; null past the end of the array. */
function costFromTable(table, matches, level) {
  const arr = table[matches];
  return level >= 0 && level < arr.length ? arr[level] : null;
}

/** Cost to buy the next characteristic advance; advancesOwned = tiers already bought. Null if maxed. */
export function characteristicCost(matches, advancesOwned) {
  return costFromTable(BDH.xpCosts.characteristic, matches, advancesOwned);
}

/** Cost to advance a skill from its current rank to the next; null if already veteran. */
export function skillCost(matches, currentRank) {
  return costFromTable(BDH.xpCosts.skill, matches, RANK_ORDER.indexOf(currentRank));
}

/** Cost of a talent by tier (1..3) and match count. */
export function talentCost(matches, tier) {
  return tier >= 1 ? costFromTable(BDH.xpCosts.talent, matches, tier - 1) : null;
}

/** Black Crusade variants — identical signatures, BC tables. */
export function characteristicCostBC(matches, advancesOwned) {
  return costFromTable(BDH.xpCostsBC.characteristic, matches, advancesOwned);
}
export function skillCostBC(matches, currentRank) {
  return costFromTable(BDH.xpCostsBC.skill, matches, RANK_ORDER.indexOf(currentRank));
}
export function talentCostBC(matches, tier) {
  return tier >= 1 ? costFromTable(BDH.xpCostsBC.talent, matches, tier - 1) : null;
}

/** BC psy rating: flat — priced as a tier-3 Unaligned talent (Allied for every character) = 750. */
export function psyRatingCostBC() {
  return talentCostBC(1, 3);
}

/** XP cost to reach a given psy rating level (200 per level: 1st=200, 2nd=400, ...). */
export function psyRatingCost(newLevel) {
  return 200 * newLevel;
}

/** When a talent / psychic power is acquired (via the ＋ button or a drag-drop), is it already purchased?
 *  Custom mode = owned outright; Simple/Play (any non-custom mode) = awaits a Buy. Only talents and
 *  psychic powers carry a `purchased` flag; every other item type returns null (no flag to set). */
export function purchasedOnAcquire(type, mode) {
  if (type !== "talent" && type !== "psychicPower") return null;
  return mode === "custom";
}
