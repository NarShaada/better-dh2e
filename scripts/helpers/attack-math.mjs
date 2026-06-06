// scripts/helpers/attack-math.mjs — PURE (no Foundry). Combat resolution math.

const HIT_BANDS = [
  { max: 10, key: "head" }, { max: 20, key: "rightArm" }, { max: 30, key: "leftArm" },
  { max: 69, key: "body" }, { max: 85, key: "rightLeg" }, { max: 100, key: "leftLeg" }
];
const SEQ = ["head", "rightArm", "leftArm", "body", "rightLeg", "leftLeg"];

/** Hit location from a d100 roll by reversing its two digits onto the bands. */
export function hitLocation(roll) {
  const r = roll % 100;                 // 100 -> 0
  let reversed = (r % 10) * 10 + Math.floor(r / 10);
  if (reversed === 0) reversed = 100;
  return HIT_BANDS.find((b) => reversed <= b.max).key;
}

/** Total hits: single = 1; multi = 1 + floor(DoS / dosPer), capped at rof. */
export function computeHits(attackType, dos, rof) {
  if (attackType.hits?.mode !== "multi" || dos < 1) return 1;
  return Math.min(rof, 1 + Math.floor(dos / attackType.hits.dosPer));
}

/** Locations for `count` hits: first as rolled, the rest cycling a fixed order (verify §10). */
export function locationSequence(first, count) {
  const start = SEQ.indexOf(first);
  return Array.from({ length: count }, (_, i) => (i === 0 ? first : SEQ[(start + i) % SEQ.length]));
}

/** Effective damage after armour+pen and Toughness Bonus (floored at 0). */
export function soak(damage, armour, penetration, toughnessBonus) {
  return Math.max(0, damage - Math.max(0, armour - penetration) - toughnessBonus);
}

/** Apply effective damage to a Wounds threshold; overflow past max is Critical. */
export function applyWounds(current, max, effective) {
  const total = current + effective;
  return { wounds: Math.min(max, total), critical: Math.max(0, total - max) };
}

/** Ranged jam: a failed attack rolling at/above the jam floor (base 94; Reliable 100; Unreliable 91). */
export function checkJam(roll, isSuccess, isRanged, jamFloor = 94) {
  return isRanged && !isSuccess && roll >= jamFloor;
}

/** Righteous Fury: a damage die at/above the threshold (natural 10, or Vengeful X). */
export function isRighteousFury(dieValue, threshold = 10) {
  return dieValue >= threshold;
}
