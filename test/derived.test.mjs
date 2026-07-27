// test/derived.test.mjs
import { describe, it, expect, vi } from "vitest";
import {
  characteristicTotal,
  characteristicBonus,
  skillTotal,
  fatigueMax,
  movement,
  sizeToHitModifier,
  sizeStealthModifier,
  unnaturalDoSBonus,
  governingCharacteristic,
  movementBaseValue,
  initiativeBase,
  initiativeDice,
  initiativeFormula
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

describe("movementBaseValue", () => {
  const dflt = { kind: "characteristic", characteristic: "agility", flat: 0, multiplier: 1, modifier: 0 };

  it("with defaults returns the characteristic bonus unchanged (today's behaviour)", () => {
    expect(movementBaseValue(dflt, 3)).toBe(3);
    expect(movementBaseValue(dflt, 0)).toBe(0);
  });

  it("ignores the characteristic bonus when kind is flat", () => {
    expect(movementBaseValue({ ...dflt, kind: "flat", flat: 6 }, 3)).toBe(6);
  });

  it("scales by the multiplier", () => {
    expect(movementBaseValue({ ...dflt, multiplier: 2 }, 3)).toBe(6);
    expect(movementBaseValue({ ...dflt, multiplier: 0.5 }, 4)).toBe(2);
    expect(movementBaseValue({ ...dflt, multiplier: 0 }, 5)).toBe(0);
  });

  it("adds the modifier AFTER the multiplier", () => {
    expect(movementBaseValue({ ...dflt, multiplier: 2, modifier: 1 }, 3)).toBe(7);   // (3*2)+1, not (3+1)*2
  });

  it("tolerates a missing config or missing fields", () => {
    expect(movementBaseValue(undefined, 3)).toBe(3);
    expect(movementBaseValue({}, 3)).toBe(3);
  });

  it("rounds the result so a fractional multiplier can't leak fractional metres", () => {
    // 0.5 * 3 = 1.5 -> rounds to 2 (banker's-free Math.round, i.e. round-half-up)
    expect(movementBaseValue({ ...dflt, multiplier: 0.5 }, 3)).toBe(2);
    expect(Number.isInteger(movementBaseValue({ ...dflt, multiplier: 0.5 }, 3))).toBe(true);
  });
});

describe("movement base feeds movement() — ordering", () => {
  const dflt = { kind: "characteristic", characteristic: "agility", flat: 0, multiplier: 1, modifier: 0 };

  it("applies the multiplier BEFORE the size adjustment", () => {
    // Agility bonus 3, Size 5, x2  =>  (3*2) + (5-4) = 7, NOT (3+1)*2 = 8
    const base = movementBaseValue({ ...dflt, multiplier: 2 }, 3);
    expect(movement(base, 5).half).toBe(7);
  });

  it("keeps the bands at x2/x3/x6 of half after a multiplier", () => {
    const base = movementBaseValue({ ...dflt, multiplier: 2 }, 3);
    const r = movement(base, 4);
    expect(r).toEqual({ half: 6, full: 12, charge: 18, run: 36 });
  });

  it("default config reproduces the old movement(agilityBonus, size) exactly", () => {
    for (const [ab, size] of [[3, 4], [0, 4], [5, 6], [2, 3]]) {
      expect(movement(movementBaseValue(dflt, ab), size)).toEqual(movement(ab, size));
    }
  });
});

describe("initiativeBase", () => {
  const dflt = { characteristic: "agility", dice: "1d10", baseKind: "characteristic", flat: 0, modifier: 0 };

  it("with defaults returns the characteristic bonus (today's behaviour)", () => {
    expect(initiativeBase(dflt, 4)).toBe(4);
  });

  it("uses the flat value when baseKind is flat", () => {
    expect(initiativeBase({ ...dflt, baseKind: "flat", flat: 7 }, 4)).toBe(7);
  });

  it("adds the modifier to either kind", () => {
    expect(initiativeBase({ ...dflt, modifier: 2 }, 4)).toBe(6);
    expect(initiativeBase({ ...dflt, baseKind: "flat", flat: 7, modifier: -1 }, 4)).toBe(6);
  });

  it("tolerates a missing config", () => {
    expect(initiativeBase(undefined, 4)).toBe(4);
  });
});

describe("initiativeDice", () => {
  it("passes a valid expression through, trimmed", () => {
    expect(initiativeDice("1d10")).toBe("1d10");
    expect(initiativeDice("  2d10  ")).toBe("2d10");
  });

  it("returns empty for a deliberately blank dice", () => {
    expect(initiativeDice("")).toBe("");
    expect(initiativeDice("   ")).toBe("");
  });

  it("falls back to 1d10 on garbage", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(initiativeDice("banana")).toBe("1d10");
    expect(initiativeDice(undefined)).toBe("1d10");
    vi.restoreAllMocks();
  });

  it("warns by default on garbage but stays silent with { warn: false } (sheet display path)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(initiativeDice("banana")).toBe("1d10");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockClear();
    expect(initiativeDice("banana", { warn: false })).toBe("1d10");
    expect(warn).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("initiativeFormula", () => {
  it("builds the system default", () => {
    expect(initiativeFormula("1d10")).toBe("1d10 + @initiativeBonus");
  });

  it("accepts other dice", () => {
    expect(initiativeFormula("2d10")).toBe("2d10 + @initiativeBonus");
    expect(initiativeFormula("1d5")).toBe("1d5 + @initiativeBonus");
  });

  it("omits the dice term when dice is blank", () => {
    expect(initiativeFormula("")).toBe("@initiativeBonus");
    expect(initiativeFormula("   ")).toBe("@initiativeBonus");
  });

  it("falls back to 1d10 on an invalid expression rather than propagating it", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(initiativeFormula("1d")).toBe("1d10 + @initiativeBonus");
    expect(initiativeFormula("d10; drop table")).toBe("1d10 + @initiativeBonus");
    expect(initiativeFormula("banana")).toBe("1d10 + @initiativeBonus");
    expect(initiativeFormula(undefined)).toBe("1d10 + @initiativeBonus");
    vi.restoreAllMocks();
  });

  it("honours a custom bonus reference", () => {
    expect(initiativeFormula("1d10", "@foo")).toBe("1d10 + @foo");
  });
});
