// test/derived.test.mjs
import { describe, it, expect } from "vitest";
import {
  characteristicTotal,
  characteristicBonus,
  skillTotal,
  fatigueMax,
  movement,
  sizeToHitModifier,
  sizeStealthModifier,
  unnaturalDoSBonus,
  governingCharacteristic
} from "../scripts/helpers/derived.mjs";

describe("unnaturalDoSBonus", () => {
  it("is ceil(unnatural/2) when the unnatural bonus is positive", () => {
    // The rulebook example: Unnatural +3 → +2 DoS on a successful test using that characteristic.
    expect(unnaturalDoSBonus(3)).toBe(2);
    expect(unnaturalDoSBonus(1)).toBe(1);
    expect(unnaturalDoSBonus(2)).toBe(1);
    expect(unnaturalDoSBonus(4)).toBe(2);
    expect(unnaturalDoSBonus(6)).toBe(3);
  });
  it("is 0 when there is no unnatural bonus", () => {
    expect(unnaturalDoSBonus(0)).toBe(0);
    expect(unnaturalDoSBonus(undefined)).toBe(0);
    expect(unnaturalDoSBonus(null)).toBe(0);
  });
});
describe("governingCharacteristic", () => {
  it("maps a characteristic key to itself", () => {
    expect(governingCharacteristic("strength")).toBe("strength");
    expect(governingCharacteristic("willpower")).toBe("willpower");
  });
  it("maps a skill key to its governing characteristic", () => {
    // athletics is Strength-based, dodge is Agility-based (per BDH.skills config).
    expect(governingCharacteristic("athletics")).toBe("strength");
    expect(governingCharacteristic("dodge")).toBe("agility");
  });
  it("returns null for an unknown key", () => {
    expect(governingCharacteristic("nonsense")).toBe(null);
  });
});
describe("characteristicTotal", () => {
  it("sums base and advance", () => {
    expect(characteristicTotal({ base: 30, advance: 5 })).toBe(35);
  });
  it("treats missing advance as 0", () => {
    expect(characteristicTotal({ base: 42 })).toBe(42);
  });
});

describe("characteristicBonus", () => {
  it("is the tens digit of the total", () => {
    expect(characteristicBonus({ base: 42, advance: 0 })).toBe(4);
    expect(characteristicBonus({ base: 30, advance: 5 })).toBe(3); // 35 -> 3
  });
  it("adds unnatural to the bonus", () => {
    expect(characteristicBonus({ base: 40, advance: 0, unnatural: 2 })).toBe(6);
  });
});

describe("skillTotal", () => {
  it("adds the rank bonus to the characteristic total", () => {
    // characteristic total 40, rank 'trained' (+10) -> 50
    expect(skillTotal(40, "trained")).toBe(50);
  });
  it("applies the -20 untrained penalty", () => {
    expect(skillTotal(40, "untrained")).toBe(20);
  });
  it("defaults unknown ranks to untrained", () => {
    expect(skillTotal(40, "nonsense")).toBe(20);
  });
  it("floors at 1 (a natural 01 always succeeds)", () => {
    expect(skillTotal(10, "untrained")).toBe(1);   // 10 - 20 = -10 -> 1
    expect(skillTotal(20, "untrained")).toBe(1);   // 20 - 20 = 0 -> 1
  });
});

describe("fatigueMax", () => {
  it("is toughness bonus + willpower bonus", () => {
    expect(fatigueMax(4, 3)).toBe(7);
  });
});

describe("movement", () => {
  it("derives half/full/charge/run from agility bonus and size", () => {
    // AgB 3, size 4 (default): half = 3 + (4-4) = 3
    expect(movement(3, 4)).toEqual({ half: 3, full: 6, charge: 9, run: 18 });
  });
  it("applies the size modifier", () => {
    // AgB 3, size 6: half = 3 + (6-4) = 5
    expect(movement(3, 6)).toEqual({ half: 5, full: 10, charge: 15, run: 30 });
  });
  it("never goes below a half move of 1 (RAW: AgB used for movement floors at 1)", () => {
    expect(movement(0, 1).half).toBe(1); // 0 + (1-4) = -3 -> clamped to 1 (was 0 before Table 4-6 fix)
  });
});

describe("size modifiers", () => {
  it("to-hit vs target = (size-4)*10", () => {
    expect(sizeToHitModifier(4)).toBe(0);
    expect(sizeToHitModifier(1)).toBe(-30);
    expect(sizeToHitModifier(5)).toBe(10);
    expect(sizeToHitModifier(10)).toBe(60);
  });
  it("stealth (own) = -(size-4)*10", () => {
    expect(sizeStealthModifier(4)).toBe(0);
    expect(sizeStealthModifier(1)).toBe(30);
    expect(sizeStealthModifier(7)).toBe(-30);
  });
});

describe("movement floors the size-adjusted AgB at 1", () => {
  it("a tiny / low-AgB creature still gets at least 1 m half-move", () => {
    expect(movement(2, 1).half).toBe(1);   // AgB 2, Miniscule -> max(1, 2-3) = 1
    expect(movement(0, 4).half).toBe(1);   // AgB 0, Average   -> max(1, 0)   = 1
    expect(movement(3, 4).half).toBe(3);   // unchanged normal
    expect(movement(3, 6).half).toBe(5);   // AgB 3, Enormous  -> 3+2 = 5
  });
});
