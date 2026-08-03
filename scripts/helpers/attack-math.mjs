// scripts/helpers/attack-math.mjs — PURE (no Foundry). Combat resolution math.

const HIT_BANDS = [
  { max: 10, key: "head" }, { max: 20, key: "rightArm" }, { max: 30, key: "leftArm" },
  { max: 70, key: "body" }, { max: 85, key: "rightLeg" }, { max: 100, key: "leftLeg" }
];
// The multiple-hit location sequence (p. 223), keyed by the FIRST hit's category. These entries
// cover the second hit onwards; the first hit is the rolled location, not a lookup. Generic limbs
// are resolved to the first hit's side. Note the second entry always repeats the first.
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

/** Total hits: single = 1; multi = 1 + floor((DoS - 1) / dosPer), capped at rof.
 *  DH2e degrees start at 1 for any success (p. 24), so the extra hits come from the degrees BEYOND
 *  the first. Full Auto and Lightning score one hit per degree, so dosPer 1 gives hits = DoS;
 *  Semi-Auto and Swift score one extra per two ADDITIONAL degrees, hence dosPer 2.
 *  Dividing raw DoS is the DH1 formula, where degrees started at 0 — it over-counted by one on
 *  every burst for seven releases before this was corrected in v0.4.2. */
export function computeHits(attackType, dos, rof) {
  if (attackType.hits?.mode !== "multi" || dos < 1) return 1;
  return Math.min(rof, 1 + Math.floor((dos - 1) / attackType.hits.dosPer));
}

/** Locations for `count` hits: the first is the rolled location; hit i (1-based) then reads
 *  MULTI_SEQ[i - 2] (limbs use the first hit's side). The 6th and further hits repeat the last
 *  entry. Indexing MULTI_SEQ from the first hit instead looks right only because the second
 *  entry repeats the first — which is why an off-by-one here survived until v0.4.2. */
export function locationSequence(first, count) {
  const tmpl = MULTI_SEQ[categoryOf(first)];
  const side = sideOf(first);
  return Array.from({ length: count }, (_, i) =>
    i === 0 ? first : resolveLoc(tmpl[Math.min(i - 1, tmpl.length - 1)], side));
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

/** Ranged jam: a failed attack rolling at/above the jam floor (see effectiveJamFloor —
 *  96 single shot / 94 semi- & full-auto; Reliable 100; Unreliable 91). */
export function checkJam(roll, isSuccess, isRanged, jamFloor = 96) {
  return isRanged && !isSuccess && roll >= jamFloor;
}

/** Righteous Fury: a damage die at/above the threshold (natural 10, or Vengeful X). */
export function isRighteousFury(dieValue, threshold = 10) {
  return dieValue >= threshold;
}
