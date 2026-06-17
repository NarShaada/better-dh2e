import { describe, it, expect } from "vitest";
import {
  SIDE_KEYS, LOCATION_KEYS,
  newTemplate, validateTemplate, summarizeTemplate, highestCoverAp, coverAutoDecision,
} from "../scripts/helpers/cover-templates.mjs";

describe("newTemplate", () => {
  it("uses the given id and sensible defaults (all sides, all locations, AP 4)", () => {
    const t = newTemplate("abc");
    expect(t.id).toBe("abc");
    expect(t.ap).toBe(4);
    expect(t.sides).toEqual(SIDE_KEYS);
    expect(t.locations).toEqual(LOCATION_KEYS);
    expect(typeof t.name).toBe("string");
    expect(t.color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("applies overrides and filters junk sides/locations", () => {
    const t = newTemplate("x", { name: "Wall", ap: 6, sides: ["s", "e", "zzz"], locations: ["rightLeg", "nope"] });
    expect(t.name).toBe("Wall");
    expect(t.ap).toBe(6);
    expect(t.sides).toEqual(["s", "e"]);
    expect(t.locations).toEqual(["rightLeg"]);
  });
});

describe("validateTemplate", () => {
  it("clamps AP to a non-negative integer and whitelists sides/locations in canonical order", () => {
    const v = validateTemplate({ id: "1", name: "  Sandbags ", ap: -3, color: "#abcdef", sides: ["w", "n", "bad"], locations: ["leftArm", "head", "x"] });
    expect(v.ap).toBe(0);
    expect(v.name).toBe("Sandbags");
    expect(v.sides).toEqual(["n", "w"]);            // canonical SIDE_KEYS order
    expect(v.locations).toEqual(["head", "leftArm"]); // canonical LOCATION_KEYS order
    expect(v.color).toBe("#abcdef");
  });
  it("supplies fallbacks for a bad name / colour / non-array fields", () => {
    const v = validateTemplate({ id: "2", name: "   ", ap: "5", color: "red", sides: null, locations: undefined });
    expect(v.name).toBe("Cover");
    expect(v.ap).toBe(5);
    expect(v.color).toBe("#8a6a3a");
    expect(v.sides).toEqual([]);
    expect(v.locations).toEqual([]);
  });
});

describe("summarizeTemplate", () => {
  it("formats AP, sides and locations; 'all' when every location is protected", () => {
    expect(summarizeTemplate({ ap: 4, sides: ["s", "e"], locations: ["rightLeg", "leftLeg"] }))
      .toBe("AP4 · S,E · Right Leg, Left Leg");
    expect(summarizeTemplate({ ap: 6, sides: [], locations: LOCATION_KEYS }))
      .toBe("AP6 · — · all");
  });
});

describe("highestCoverAp", () => {
  it("returns the max AP among cover payloads, 0 when none", () => {
    expect(highestCoverAp([{ ap: 2 }, { ap: 6 }, { ap: 4 }])).toBe(6);
    expect(highestCoverAp([])).toBe(0);
    expect(highestCoverAp(null)).toBe(0);
  });
});

describe("coverAutoDecision", () => {
  it("applies when newly in cover, removes only auto-applied, never touches manual", () => {
    expect(coverAutoDecision({ inCover: true, hasCondition: false, wasAuto: false })).toBe("apply");
    expect(coverAutoDecision({ inCover: false, hasCondition: true, wasAuto: true })).toBe("remove");
    expect(coverAutoDecision({ inCover: false, hasCondition: true, wasAuto: false })).toBe("none"); // manual survives
    expect(coverAutoDecision({ inCover: true, hasCondition: true, wasAuto: true })).toBe("none");
    expect(coverAutoDecision({ inCover: false, hasCondition: false, wasAuto: false })).toBe("none");
  });
});
