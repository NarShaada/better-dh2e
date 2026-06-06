import { describe, it, expect } from "vitest";
import { hitLocation, computeHits, locationSequence, soak, applyWounds, checkJam, isRighteousFury } from "../scripts/helpers/attack-math.mjs";

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
  it("semi: +1 per 2 DoS, capped", () => {
    expect(computeHits(semi, 4, 99)).toBe(3);   // 1 + floor(4/2)
    expect(computeHits(semi, 4, 2)).toBe(2);    // capped at rof
  });
  it("full: +1 per DoS, capped", () => {
    expect(computeHits(full, 3, 99)).toBe(4);   // 1 + 3
  });
});
describe("locationSequence (multi-hit table, side tracks first hit)", () => {
  it("Body-first: Body, R Arm, Head, R Arm, Body", () => {
    expect(locationSequence("body", 5)).toEqual(["body", "rightArm", "head", "rightArm", "body"]);
  });
  it("Left-Arm-first tracks the left side", () => {
    expect(locationSequence("leftArm", 5)).toEqual(["leftArm", "body", "head", "body", "leftArm"]);
  });
  it("Right-Leg-first", () => {
    expect(locationSequence("rightLeg", 5)).toEqual(["rightLeg", "body", "rightArm", "head", "body"]);
  });
  it("Head-first; 6th+ repeats the 5th", () => {
    expect(locationSequence("head", 6)).toEqual(["head", "rightArm", "body", "rightArm", "body", "body"]);
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
