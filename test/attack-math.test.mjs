import { describe, it, expect } from "vitest";
import { hitLocation, computeHits, locationSequence, soak, applyWounds, checkJam, isRighteousFury, penetrationWithBonus } from "../scripts/helpers/attack-math.mjs";

describe("hitLocation (reversed digits)", () => {
  it("reverses the d100 digits onto the bands", () => {
    expect(hitLocation(7)).toBe("body");       // 07 -> 70 (Body band 31-70)
    expect(hitLocation(10)).toBe("head");      // 10 -> 01
    expect(hitLocation(47)).toBe("rightLeg");  // 47 -> 74
    expect(hitLocation(55)).toBe("body");      // 55 -> 55
    expect(hitLocation(100)).toBe("leftLeg");  // 00 -> 100
  });
});
describe("computeHits", () => {
  const semi = { hits: { mode: "multi", dosPer: 2 } };
  const full = { hits: { mode: "multi", dosPer: 1 } };
  it("single is always 1", () => { expect(computeHits({ hits: { mode: "single" } }, 5, 99)).toBe(1); });
  it("semi/swift: one extra hit per two ADDITIONAL degrees (p. 223)", () => {
    expect(computeHits(semi, 1, 99)).toBe(1);   // a bare success is one hit
    expect(computeHits(semi, 2, 99)).toBe(1);   // 1 additional degree is not yet two
    expect(computeHits(semi, 3, 99)).toBe(2);   // 1 + floor(2/2)
    expect(computeHits(semi, 5, 99)).toBe(3);   // 1 + floor(4/2)
    expect(computeHits(semi, 5, 2)).toBe(2);    // capped at rof
  });
  it("full-auto/lightning: one hit per degree of success (p. 221)", () => {
    expect(computeHits(full, 1, 99)).toBe(1);   // a bare success is ONE hit, not two
    expect(computeHits(full, 3, 99)).toBe(3);
    expect(computeHits(full, 5, 3)).toBe(3);    // capped at rof
  });
});
describe("locationSequence (multi-hit table, side tracks first hit)", () => {
  // The multiple-hit location sequence, p. 223. Its second entry repeats the first, so the second hit
  // always lands in the same area as the first.
  it("Body-first: Body, Body, Arm, Head, Arm", () => {
    expect(locationSequence("body", 5)).toEqual(["body", "body", "rightArm", "head", "rightArm"]);
  });
  it("Left-Arm-first: Arm, Arm, Body, Head, Body — tracking the left side", () => {
    expect(locationSequence("leftArm", 5)).toEqual(["leftArm", "leftArm", "body", "head", "body"]);
  });
  it("Right-Leg-first: Leg, Leg, Body, Arm, Head", () => {
    expect(locationSequence("rightLeg", 5)).toEqual(["rightLeg", "rightLeg", "body", "rightArm", "head"]);
  });
  it("Head-first: Head, Head, Arm, Body, Arm; 6th+ takes EACH ADDITIONAL", () => {
    expect(locationSequence("head", 7)).toEqual(["head", "head", "rightArm", "body", "rightArm", "body", "body"]);
  });
  it("single hit is just the rolled location", () => {
    expect(locationSequence("leftLeg", 1)).toEqual(["leftLeg"]);
  });
});
describe("soak", () => {
  it("damage minus (armour-pen) floored minus TB", () => {
    expect(soak(12, 6, 2, 3)).toBe(5);  // 12 - max(0,6-2) - 3 = 5
    expect(soak(3, 6, 0, 3)).toBe(0);   // fully soaked -> 0
  });
});
describe("applyWounds", () => {
  it("accumulates to max, overflow is critical", () => {
    expect(applyWounds(5, 10, 3)).toEqual({ wounds: 8, critical: 0 });
    expect(applyWounds(8, 10, 5)).toEqual({ wounds: 10, critical: 3 });
    expect(applyWounds(10, 10, 4)).toEqual({ wounds: 10, critical: 4 });
  });
});
describe("checkJam", () => {
  it("ranged failed roll at/above the floor jams", () => {
    expect(checkJam(96, false, true)).toBe(true);
    expect(checkJam(96, true, true)).toBe(false);
    expect(checkJam(96, false, false)).toBe(false);
    expect(checkJam(100, false, true, 100)).toBe(true);
    expect(checkJam(94, false, true, 100)).toBe(false);
  });
});
describe("isRighteousFury", () => {
  it("natural 10 (or >= threshold)", () => {
    expect(isRighteousFury(10)).toBe(true);
    expect(isRighteousFury(9)).toBe(false);
    expect(isRighteousFury(9, 9)).toBe(true);
  });
});
describe("penetrationWithBonus", () => {
  it("adds a positive bonus to the base", () => {
    expect(penetrationWithBonus(4, 2)).toBe(6);
  });
  it("returns the base unchanged for a zero bonus", () => {
    expect(penetrationWithBonus(4, 0)).toBe(4);
  });
  it("reduces the base for a negative bonus", () => {
    expect(penetrationWithBonus(4, -1)).toBe(3);
  });
  it("clamps at 0 when the penalty exceeds the base", () => {
    // soak() reads a negative penetration as extra armour, so this must never go below 0.
    expect(penetrationWithBonus(1, -3)).toBe(0);
  });
  it("returns the bonus when the base is 0", () => {
    expect(penetrationWithBonus(0, 3)).toBe(3);
  });
  it("coerces missing or non-numeric arguments to 0 rather than producing NaN", () => {
    expect(penetrationWithBonus(undefined, undefined)).toBe(0);
    expect(penetrationWithBonus(null, 2)).toBe(2);
    expect(penetrationWithBonus(5, "junk")).toBe(5);
  });
});
