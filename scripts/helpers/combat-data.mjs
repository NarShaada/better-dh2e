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
