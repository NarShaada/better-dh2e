import { describe, it, expect } from "vitest";
import { carryLimits, CARRY_TABLE } from "../scripts/helpers/encumbrance-data.mjs";

describe("carryLimits (Table 7-26)", () => {
  it("reads the table by SB+TB", () => {
    expect(carryLimits(0)).toEqual({ carry: 0.9, lift: 2.25, push: 4.5 });
    expect(carryLimits(8)).toEqual({ carry: 56, lift: 112, push: 224 });
    expect(carryLimits(13)).toEqual({ carry: 225, lift: 450, push: 900 });
    expect(carryLimits(20)).toEqual({ carry: 2250, lift: 4500, push: 9000 });
  });
  it("clamps out-of-range sums to 0..20", () => {
    expect(carryLimits(25)).toEqual(carryLimits(20));
    expect(carryLimits(-3)).toEqual(carryLimits(0));
  });
  it("floors fractional sums", () => {
    expect(carryLimits(8.9)).toEqual(carryLimits(8));
  });
  it("has 21 rows", () => { expect(CARRY_TABLE.length).toBe(21); });
});
