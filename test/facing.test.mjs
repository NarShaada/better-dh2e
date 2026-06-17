import { describe, it, expect } from "vitest";
import { facingFromDelta } from "../scripts/helpers/facing.mjs";

describe("facingFromDelta", () => {
  it("maps the four cardinals (screen space: +y is down, so up = north)", () => {
    expect(facingFromDelta(0, -10)).toBe("n");
    expect(facingFromDelta(0, 10)).toBe("s");
    expect(facingFromDelta(10, 0)).toBe("e");
    expect(facingFromDelta(-10, 0)).toBe("w");
  });
  it("breaks diagonal ties toward N/S (the larger zones)", () => {
    expect(facingFromDelta(10, -10)).toBe("n");   // NE corner → N
    expect(facingFromDelta(-10, 10)).toBe("s");   // SW corner → S
  });
  it("uses the dominant axis off the diagonal", () => {
    expect(facingFromDelta(10, -5)).toBe("e");    // |dx| > |dy| → E
    expect(facingFromDelta(5, -10)).toBe("n");    // |dy| > |dx| → N
  });
  it("returns null at the origin (same cell)", () => {
    expect(facingFromDelta(0, 0)).toBe(null);
  });
});
