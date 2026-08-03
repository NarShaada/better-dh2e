import { describe, it, expect } from "vitest";
import {
  LOCATION_KEYS,
  newTemplate, validateTemplate, summarizeTemplate, locationBadge,
  coverPrefill, coverContextLabel,
} from "../scripts/helpers/cover-templates.mjs";

describe("newTemplate", () => {
  it("uses the given id and sensible defaults (all locations, AP 4)", () => {
    const t = newTemplate("abc");
    expect(t.id).toBe("abc");
    expect(t.ap).toBe(4);
    expect(t.sides).toBeUndefined();          // the obstacle model has no sides
    expect(t.locations).toEqual(LOCATION_KEYS);
    expect(typeof t.name).toBe("string");
    expect(t.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("applies overrides and filters junk locations", () => {
    const t = newTemplate("x", { name: "Wall", ap: 6, locations: ["rightLeg", "nope"] });
    expect(t.name).toBe("Wall");
    expect(t.ap).toBe(6);
    expect(t.locations).toEqual(["rightLeg"]);
  });
});

describe("validateTemplate", () => {
  it("clamps AP to a non-negative integer and whitelists locations in canonical order", () => {
    const v = validateTemplate({ id: "1", name: "  Sandbags ", ap: -3, color: "#abcdef", locations: ["leftArm", "head", "x"] });
    expect(v.ap).toBe(0);
    expect(v.name).toBe("Sandbags");
    expect(v.locations).toEqual(["head", "leftArm"]);   // canonical LOCATION_KEYS order
    expect(v.color).toBe("#abcdef");
    expect(v.sides).toBeUndefined();
  });
  it("supplies fallbacks for a bad name / colour / non-array fields", () => {
    const v = validateTemplate({ id: "2", name: "   ", ap: "5", color: "red", locations: undefined });
    expect(v.name).toBe("Cover");
    expect(v.ap).toBe(5);
    expect(v.color).toBe("#8a6a3a");
    expect(v.locations).toEqual([]);
  });
  it("drops a legacy sides field rather than carrying it forward", () => {
    const v = validateTemplate({ id: "3", name: "Old", ap: 4, color: "#abcdef", sides: ["n", "w"], locations: ["body"] });
    expect(v.sides).toBeUndefined();
  });
});

describe("summarizeTemplate", () => {
  it("formats AP and locations; 'all' when every location is protected", () => {
    expect(summarizeTemplate({ ap: 4, locations: ["rightLeg", "leftLeg"] }))
      .toBe("AP4 · Right Leg, Left Leg");
    expect(summarizeTemplate({ ap: 6, locations: LOCATION_KEYS })).toBe("AP6 · all");
    expect(summarizeTemplate({ ap: 2, locations: [] })).toBe("AP2 · —");
  });
});

describe("locationBadge", () => {
  it("lights a glyph per covered group", () => {
    expect(locationBadge(["head", "body", "rightArm", "leftLeg"]))
      .toEqual({ h: true, a: true, b: true, l: true });
  });

  it("lights the limb glyph when only one of the pair is covered", () => {
    expect(locationBadge(["rightArm"])).toEqual({ h: false, a: true, b: false, l: false });
    expect(locationBadge(["leftLeg"])).toEqual({ h: false, a: false, b: false, l: true });
  });

  it("is all dark for an empty, missing or unrecognised list", () => {
    const dark = { h: false, a: false, b: false, l: false };
    expect(locationBadge([])).toEqual(dark);
    expect(locationBadge(null)).toEqual(dark);
    expect(locationBadge(undefined)).toEqual(dark);
    expect(locationBadge(["nonsense"])).toEqual(dark);
  });

  it("lights only body for a body-only piece", () => {
    expect(locationBadge(["body"])).toEqual({ h: false, a: false, b: true, l: false });
  });
});

describe("coverContextLabel", () => {
  it("names the approach side and the protected locations", () => {
    expect(coverContextLabel({ ap: 4, locations: ["body", "rightLeg"] }, "n"))
      .toBe("Shot approached from N · protects Body, Right Leg");
  });
  it("copes with no direction and a piece protecting nothing", () => {
    expect(coverContextLabel({ ap: 4, locations: [] }, null))
      .toBe("Shot approached from unknown · protects nothing");
  });
});
