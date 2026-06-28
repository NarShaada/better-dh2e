import { describe, it, expect } from "vitest";
import { woundsShown, woundsStored } from "../scripts/helpers/wounds-display.mjs";

describe("woundsShown", () => {
  it("returns stored value when not reversed", () => {
    expect(woundsShown(0, 9, false)).toBe(0);
    expect(woundsShown(5, 9, false)).toBe(5);
  });
  it("returns remaining (max - value) when reversed", () => {
    expect(woundsShown(0, 9, true)).toBe(9);   // full reads 9/9
    expect(woundsShown(5, 9, true)).toBe(4);
    expect(woundsShown(9, 9, true)).toBe(0);
  });
  it("floors remaining at 0 and tolerates nullish", () => {
    expect(woundsShown(12, 9, true)).toBe(0);
    expect(woundsShown(undefined, undefined, true)).toBe(0);
  });
});

describe("woundsStored", () => {
  it("clamps the typed value 0..max when not reversed", () => {
    expect(woundsStored(5, 9, false)).toBe(5);
    expect(woundsStored(-3, 9, false)).toBe(0);
    expect(woundsStored(20, 9, false)).toBe(9);
  });
  it("converts typed-remaining back to stored when reversed", () => {
    expect(woundsStored(9, 9, true)).toBe(0);   // typed full → 0 damage
    expect(woundsStored(4, 9, true)).toBe(5);
    expect(woundsStored(0, 9, true)).toBe(9);
  });
  it("round-trips shown→stored→shown in both modes", () => {
    for (const rev of [false, true]) {
      for (const v of [0, 3, 9]) {
        expect(woundsStored(woundsShown(v, 9, rev), 9, rev)).toBe(v);
      }
    }
  });
});
