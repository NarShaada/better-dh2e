import { describe, it, expect } from "vitest";
import { effectiveJamFloor, meleeCraftToHit, meleeCraftDamageBonus, normalizeCraftsmanship } from "../scripts/helpers/craftsmanship-data.mjs";

const Q = (...keys) => keys.map((key) => ({ key, value: "" }));

describe("effectiveJamFloor (quality × craftsmanship)", () => {
  it("best never jams", () => {
    expect(effectiveJamFloor(Q(), "best")).toBe(Infinity);
    expect(effectiveJamFloor(Q("unreliable"), "best")).toBe(Infinity);
  });
  it("good: unreliable cancels to neither, else reliable", () => {
    expect(effectiveJamFloor(Q("unreliable"), "good")).toBe(94);
    expect(effectiveJamFloor(Q(), "good")).toBe(100);
    expect(effectiveJamFloor(Q("reliable"), "good")).toBe(100);
  });
  it("poor: unreliable -> jam on every fail (0); reliable cancels to neither; else unreliable", () => {
    expect(effectiveJamFloor(Q("unreliable"), "poor")).toBe(0);
    expect(effectiveJamFloor(Q("reliable"), "poor")).toBe(94);
    expect(effectiveJamFloor(Q(), "poor")).toBe(91);
  });
  it("normal: reliable 100, unreliable 91, neither 94", () => {
    expect(effectiveJamFloor(Q("reliable"), "normal")).toBe(100);
    expect(effectiveJamFloor(Q("unreliable"), "normal")).toBe(91);
    expect(effectiveJamFloor(Q(), "normal")).toBe(94);
  });
});
describe("meleeCraftToHit", () => {
  it("poor -10, good +5, best +10, normal 0", () => {
    expect(meleeCraftToHit("poor")).toBe(-10);
    expect(meleeCraftToHit("good")).toBe(5);
    expect(meleeCraftToHit("best")).toBe(10);
    expect(meleeCraftToHit("normal")).toBe(0);
  });
});
describe("meleeCraftDamageBonus", () => {
  it("best +1, else 0", () => {
    expect(meleeCraftDamageBonus("best")).toBe(1);
    expect(meleeCraftDamageBonus("good")).toBe(0);
    expect(meleeCraftDamageBonus("normal")).toBe(0);
  });
});
describe("normalizeCraftsmanship", () => {
  it("maps legacy classic-DH 'common' (and blanks/unknowns) to 'normal'", () => {
    // The bug: migrated items carry craftsmanship "common", which is not a valid choice and
    // throws during actor init — cascading into the broken combat tracker.
    expect(normalizeCraftsmanship("common")).toBe("normal");
    expect(normalizeCraftsmanship("")).toBe("normal");
    expect(normalizeCraftsmanship(null)).toBe("normal");
    expect(normalizeCraftsmanship(undefined)).toBe("normal");
    expect(normalizeCraftsmanship("bespoke")).toBe("normal");
  });
  it("keeps the valid tiers, case-insensitively", () => {
    expect(normalizeCraftsmanship("poor")).toBe("poor");
    expect(normalizeCraftsmanship("good")).toBe("good");
    expect(normalizeCraftsmanship("best")).toBe("best");
    expect(normalizeCraftsmanship("normal")).toBe("normal");
    expect(normalizeCraftsmanship("Poor")).toBe("poor");
    expect(normalizeCraftsmanship("BEST")).toBe("best");
  });
});
