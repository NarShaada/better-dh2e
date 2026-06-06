import { describe, it, expect } from "vitest";
import { tearingFormula, qualityToHitMod, qualityJamFloor, accurateBonusDice, weaponDamageFormula, parryModifier, hasShocking } from "../scripts/helpers/quality-modules.mjs";

const Q = (...keys) => keys.map((key) => ({ key, value: "" }));

describe("tearingFormula", () => {
  it("adds a die and keeps highest of the first dice term", () => {
    expect(tearingFormula("1d10+3")).toBe("2d10kh1+3");
    expect(tearingFormula("2d10")).toBe("3d10kh2");
  });
});
describe("qualityToHitMod", () => {
  it("Accurate gives +10 only when aiming", () => {
    expect(qualityToHitMod(Q("accurate"), { aiming: true })).toBe(10);
    expect(qualityToHitMod(Q("accurate"), { aiming: false })).toBe(0);
    expect(qualityToHitMod(Q(), { aiming: true })).toBe(0);
  });
});
describe("qualityJamFloor", () => {
  it("Reliable 100, Unreliable 91, else base 94", () => {
    expect(qualityJamFloor(Q("reliable"))).toBe(100);
    expect(qualityJamFloor(Q("unreliable"))).toBe(91);
    expect(qualityJamFloor(Q())).toBe(94);
  });
});
describe("accurateBonusDice", () => {
  it("+1d10 per 2 DoS, capped 2, ranged+aiming only", () => {
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 4 })).toBe("2d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 2 })).toBe("1d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 6 })).toBe("2d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 1 })).toBeNull();
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: false, dos: 4 })).toBeNull();
    expect(accurateBonusDice(Q("accurate"), { isRanged: false, aiming: true, dos: 4 })).toBeNull();
    expect(accurateBonusDice(Q(), { isRanged: true, aiming: true, dos: 4 })).toBeNull();
  });
});
describe("weaponDamageFormula", () => {
  it("applies Tearing only when present", () => {
    expect(weaponDamageFormula(Q("tearing"), "1d10+3")).toBe("2d10kh1+3");
    expect(weaponDamageFormula(Q(), "1d10+3")).toBe("1d10+3");
  });
});
describe("parryModifier", () => {
  it("best of the defender's melee weapons (Balanced +10 / Unbalanced -10)", () => {
    expect(parryModifier([Q("balanced")])).toBe(10);
    expect(parryModifier([Q("unbalanced")])).toBe(-10);
    expect(parryModifier([Q("balanced"), Q("unbalanced")])).toBe(10);
    expect(parryModifier([])).toBe(0);
  });
});
describe("hasShocking", () => {
  it("detects Shocking", () => {
    expect(hasShocking(Q("shocking"))).toBe(true);
    expect(hasShocking(Q())).toBe(false);
  });
});
