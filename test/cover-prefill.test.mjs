import { describe, it, expect } from "vitest";
import { coverPrefill } from "../scripts/helpers/cover-templates.mjs";

describe("coverPrefill", () => {
  const piece = { ap: 4, locations: ["body", "rightLeg"] };

  it("returns the piece's AP when a hit struck a protected location", () => {
    expect(coverPrefill(piece, ["body"])).toBe(4);
    expect(coverPrefill(piece, ["head", "rightLeg"])).toBe(4);
  });

  it("returns 0 when no hit struck a protected location", () => {
    expect(coverPrefill(piece, ["head"])).toBe(0);
    expect(coverPrefill(piece, [])).toBe(0);
  });

  it("returns 0 without a piece — a manual In Cover target pre-fills empty", () => {
    expect(coverPrefill(null, ["body"])).toBe(0);
    expect(coverPrefill(undefined, ["body"])).toBe(0);
  });

  it("returns 0 for a zero-AP or location-less piece", () => {
    expect(coverPrefill({ ap: 0, locations: ["body"] }, ["body"])).toBe(0);
    expect(coverPrefill({ ap: 4, locations: [] }, ["body"])).toBe(0);
  });

  it("tolerates a missing hit list", () => {
    expect(coverPrefill(piece, null)).toBe(0);
    expect(coverPrefill(piece, undefined)).toBe(0);
  });
});
