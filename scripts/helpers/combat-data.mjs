// scripts/helpers/combat-data.mjs
// PURE — no Foundry imports.
export const HIT_LOCATIONS = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];

/**
 * Per-location protection = best non-additive AP + sum of additive AP + Toughness Bonus.
 * @param {Array<{additive:boolean, locations:Record<string,number>}>} armours  equipped armour
 * @param {number} toughnessBonus
 * @returns {Record<string,number>} protection per location
 */
export function computeArmour(armours, toughnessBonus = 0) {
  const result = {};
  for (const loc of HIT_LOCATIONS) {
    let best = 0;
    let additive = 0;
    for (const a of armours) {
      let ap = a.locations?.[loc] ?? 0;
      if (a.craftsmanship === "best" && ap > 0) ap += 1;   // Best armour: +1 AP per protected location
      if (a.additive) additive += ap;
      else best = Math.max(best, ap);
    }
    result[loc] = best + additive + toughnessBonus;
  }
  return result;
}

/**
 * Corrosive: distribute `amount` points of AP loss at `location` across armour pieces (highest AP
 *  there melts first). Corrosion beyond the total AP burns the wearer directly — RAW: that excess
 *  is not reduced by Toughness (and there is no armour left to reduce it).
 * @param {Array<{locations:Record<string,number>}>} armours  equipped armour (system data, index-aligned with the caller's items)
 * @param {string} location
 * @param {number} amount  the 1d10 corrosion roll
 * @returns {{losses: Array<{index:number, loss:number}>, excess: number}}
 */
export function corrodeArmour(armours, location, amount) {
  const order = armours
    .map((a, index) => ({ index, ap: a.locations?.[location] ?? 0 }))
    .filter((e) => e.ap > 0)
    .sort((a, b) => b.ap - a.ap);
  let remaining = Math.max(0, amount);
  const losses = [];
  for (const e of order) {
    if (remaining <= 0) break;
    const loss = Math.min(e.ap, remaining);
    losses.push({ index: e.index, loss });
    remaining -= loss;
  }
  return { losses, excess: remaining };
}
