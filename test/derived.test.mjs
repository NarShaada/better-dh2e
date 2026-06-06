// test/derived.test.mjs
import { describe, it, expect } from "vitest";
import {
  characteristicTotal,
  characteristicBonus,
  skillTotal,
  fatigueMax,
  movement
} from "../scripts/helpers/derived.mjs";

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
  it("never goes below a half move of 0", () => {
    expect(movement(0, 1).half).toBe(0); // 0 + (1-4) = -3 -> clamped to 0
  });
});
