// scripts/helpers/attack-math.mjs — PURE (no Foundry). Combat resolution math.

const HIT_BANDS = [
  { max: 10, key: "head" }, { max: 20, key: "rightArm" }, { max: 30, key: "leftArm" },
  { max: 70, key: "body" }, { max: 85, key: "rightLeg" }, { max: 100, key: "leftLeg" }
];
// Multiple-hits sequence by first-hit category (generic limbs resolved to the first hit's side).
const MULTI_SEQ = {
  head: ["head", "arm", "body", "arm", "body"],
  arm:  ["arm", "body", "head", "body", "arm"],
  body: ["body", "arm", "head", "arm", "body"],
  leg:  ["leg", "body", "arm", "head", "body"]
};
const categoryOf = (loc) =>
  loc === "head" ? "head" : loc === "body" ? "body"
  : (loc === "rightArm" || loc === "leftArm") ? "arm" : "leg";
const sideOf = (loc) => (loc === "leftArm" || loc === "leftLeg") ? "left" : "right";   // Body/Head -> right
const resolveLoc = (generic, side) =>
  generic === "head" ? "head" : generic === "body" ? "body"
  : generic === "arm" ? `${side}Arm` : `${side}Leg`;

/** Reverse a d100's two digits (34 → 43; 100 → 100; single digits pad, e.g. 7 → 70). */
export function reverseD100(roll) {
  const r = (roll ?? 0) % 100;          // 100 -> 0
  const reversed = (r % 10) * 10 + Math.floor(r / 10);
  return reversed === 0 ? 100 : reversed;
}

/** Hit location from a d100 roll by reversing its two digits onto the bands. */
export function hitLocation(roll) {
  return HIT_BANDS.find((b) => reverseD100(roll) <= b.max).key;
}

/** Total hits: single = 1; multi = 1 + floor(DoS / dosPer), capped at rof. */
export function computeHits(attackType, dos, rof) {
  if (attackType.hits?.mode !== "multi" || dos < 1) return 1;
  return Math.min(rof, 1 + Math.floor(dos / attackType.hits.dosPer));
}

/** Locations for `count` hits: first as rolled; subsequent follow the category sequence
 *  (limbs use the first hit's side); the 6th and further hits repeat the 5th. */
export function locationSequence(first, count) {
  const tmpl = MULTI_SEQ[categoryOf(first)];
  const side = sideOf(first);
  return Array.from({ length: count }, (_, i) => resolveLoc(tmpl[Math.min(i, tmpl.length - 1)], side));
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
