// test/test-logic.test.mjs
import { describe, it, expect } from "vitest";
import { parseModifier, clampModifier, evaluateTest } from "../scripts/rolls/test-logic.mjs";

describe("parseModifier", () => {
  it("parses signed and unsigned integers", () => {
    expect(parseModifier("+10")).toBe(10);
    expect(parseModifier("10")).toBe(10);
    expect(parseModifier("-20")).toBe(-20);
    expect(parseModifier(" +5 ")).toBe(5);
  });
  it("returns 0 for empty or non-numeric input", () => {
    expect(parseModifier("")).toBe(0);
    expect(parseModifier("abc")).toBe(0);
    expect(parseModifier(undefined)).toBe(0);
  });
  it("passes through a number", () => {
    expect(parseModifier(7)).toBe(7);
  });
});

describe("clampModifier", () => {
  it("caps at +/-60", () => {
    expect(clampModifier(80)).toBe(60);
    expect(clampModifier(-80)).toBe(-60);
    expect(clampModifier(30)).toBe(30);
  });
});

describe("evaluateTest", () => {
  it("counts DoS with the tens-digit formula", () => {
    // target 43, roll 06 -> 1 + 4 - 0 = 5 DoS
    const r = evaluateTest({ base: 43, modifier: 0, roll: 6 });
    expect(r.target).toBe(43);
    expect(r.success).toBe(true);
    expect(r.degrees).toBe(5);
  });
  it("counts DoF on failure", () => {
    // target 40, roll 55 -> fail, 1 + 5 - 4 = 2 DoF
    const r = evaluateTest({ base: 30, modifier: 10, roll: 55 });
    expect(r.success).toBe(false);
    expect(r.degrees).toBe(2);
  });
  it("applies the modifier to the target and caps it at +/-60", () => {
    const r = evaluateTest({ base: 50, modifier: 80, roll: 90 });
    expect(r.modifier).toBe(60);
    expect(r.target).toBe(110);
    expect(r.success).toBe(true); // 90 <= 110
  });
  it("treats a natural 01 as success and 100 as failure regardless of target", () => {
    expect(evaluateTest({ base: 5, modifier: 0, roll: 1 }).success).toBe(true);
    expect(evaluateTest({ base: 99, modifier: 0, roll: 100 }).success).toBe(false);
  });
  it("never reports fewer than 1 degree", () => {
    const r = evaluateTest({ base: 5, modifier: 0, roll: 1 });
    expect(r.degrees).toBeGreaterThanOrEqual(1);
  });
});
