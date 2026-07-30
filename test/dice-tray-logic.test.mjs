// test/dice-tray-logic.test.mjs
import { describe, it, expect } from "vitest";
import { trayFormula, parseModifier, MODIFIER_LIMIT } from "../scripts/rolls/dice-tray-logic.mjs";

describe("parseModifier", () => {
  it("parses a signed or unsigned integer", () => {
    expect(parseModifier("+3")).toBe(3);
    expect(parseModifier("3")).toBe(3);
    expect(parseModifier("-2")).toBe(-2);
  });

  it("ignores surrounding whitespace", () => {
    expect(parseModifier("  +3  ")).toBe(3);
  });

  it("treats anything unparseable as no modifier (it feeds a formula on every click)", () => {
    for (const raw of ["", "   ", "abc", "+", "-", "3.5", "1d10", "+-3", null, undefined]) {
      expect(parseModifier(raw), JSON.stringify(raw)).toBe(0);
    }
  });

  it("clamps to the limit in both directions", () => {
    expect(parseModifier("5000")).toBe(MODIFIER_LIMIT);
    expect(parseModifier("-5000")).toBe(-MODIFIER_LIMIT);
    expect(MODIFIER_LIMIT).toBe(999);
  });
});

describe("trayFormula", () => {
  it("builds a single die of each supported size", () => {
    expect(trayFormula(100, 1, 0)).toBe("1d100");
    expect(trayFormula(10, 1, 0)).toBe("1d10");
    expect(trayFormula(5, 1, 0)).toBe("1d5");
  });

  it("builds multiple dice", () => {
    expect(trayFormula(10, 3, 0)).toBe("3d10");
  });

  it("appends a positive modifier", () => {
    expect(trayFormula(10, 2, 3)).toBe("2d10+3");
  });

  it("appends a negative modifier", () => {
    expect(trayFormula(5, 1, -2)).toBe("1d5-2");
  });

  it("omits a zero modifier rather than emitting +0", () => {
    expect(trayFormula(100, 1, 0)).toBe("1d100");
  });

  it("floors a fractional count and treats anything below 1 as a single die", () => {
    expect(trayFormula(10, 2.7, 0)).toBe("2d10");
    expect(trayFormula(10, 0, 0)).toBe("1d10");
    expect(trayFormula(10, -3, 0)).toBe("1d10");
    expect(trayFormula(10, NaN, 0)).toBe("1d10");
  });
});
