import { describe, it, expect } from "vitest";
import { isApproachDefended, coverPrefill, coverContextLabel } from "../scripts/helpers/cover-templates.mjs";

const piece = { ap: 4, sides: ["s", "e"], locations: ["rightLeg", "leftLeg"] };

describe("isApproachDefended", () => {
  it("is true only when the piece exists and the approach side is defended", () => {
    expect(isApproachDefended(piece, "e")).toBe(true);
    expect(isApproachDefended(piece, "n")).toBe(false);
    expect(isApproachDefended(piece, null)).toBe(false);
    expect(isApproachDefended(null, "e")).toBe(false);
  });
});

describe("coverPrefill", () => {
  it("suggests the AP when the side is defended AND a hit struck a protected location", () => {
    expect(coverPrefill(piece, "e", ["rightLeg"])).toBe(4);
    expect(coverPrefill(piece, "e", ["head", "leftLeg"])).toBe(4);
  });
  it("suggests 0 when the side is undefended, no protected hit, or there is no piece", () => {
    expect(coverPrefill(piece, "n", ["rightLeg"])).toBe(0);   // wrong side
    expect(coverPrefill(piece, "e", ["head"])).toBe(0);        // protected nothing struck
    expect(coverPrefill(piece, "e", [])).toBe(0);
    expect(coverPrefill(null, "e", ["rightLeg"])).toBe(0);     // manual / no piece
  });
});

describe("coverContextLabel", () => {
  it("describes approach side, defended state, and protected locations", () => {
    expect(coverContextLabel(piece, "e")).toBe("Shot approached from E (defended) · protects Right Leg, Left Leg");
    expect(coverContextLabel(piece, "n")).toBe("Shot approached from N (undefended) · protects Right Leg, Left Leg");
    expect(coverContextLabel(piece, null)).toBe("Shot approached from unknown (no direction) · protects Right Leg, Left Leg");
  });
});
