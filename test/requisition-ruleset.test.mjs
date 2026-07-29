import { describe, it, expect } from "vitest";
import { makeRequisitionRuleset } from "../scripts/helpers/requisition-ruleset.mjs";
import { BDH } from "../scripts/config.mjs";

const rs = makeRequisitionRuleset("dh2");

describe("makeRequisitionRuleset — dh2", () => {
  it("governs on Influence", () => {
    expect(rs.key).toBe("dh2");
    expect(rs.characteristic).toBe("influence");
  });

  it("returns the printed modifier for every availability level", () => {
    for (const level of Object.keys(BDH.availability)) {
      expect(rs.availabilityModifier(level)).toBe(BDH.availabilityModifier[level]);
    }
  });

  it("returns null for Ubiquitous — no test is required", () => {
    expect(rs.availabilityModifier("ubiquitous")).toBeNull();
  });

  it("returns the printed modifier for every craftsmanship tier", () => {
    for (const craft of Object.keys(BDH.craftsmanship)) {
      expect(rs.craftsmanshipModifier(craft)).toBe(BDH.craftsmanshipRequisition[craft]);
    }
  });

  it("falls back to 0 on unknown keys rather than producing NaN", () => {
    expect(rs.availabilityModifier("nonsense")).toBe(0);
    expect(rs.craftsmanshipModifier("nonsense")).toBe(0);
    expect(rs.availabilityModifier(undefined)).toBe(0);
    expect(rs.craftsmanshipModifier(undefined)).toBe(0);
  });

  it("sums availability and craftsmanship", () => {
    const t = rs.totalModifier({ availability: "rare", craftsmanship: "good" });
    expect(t.automatic).toBe(false);
    expect(t.modifier).toBe(-40);
  });

  it("reports the parts so the dialog can show a breakdown", () => {
    const t = rs.totalModifier({ availability: "scarce", craftsmanship: "poor" });
    expect(t.parts).toEqual([
      { label: "Scarce", value: -10 },
      { label: "Poor", value: 10 }
    ]);
    expect(t.modifier).toBe(0);
  });

  it("flags Ubiquitous as automatic with a zero modifier", () => {
    const t = rs.totalModifier({ availability: "ubiquitous", craftsmanship: "normal" });
    expect(t.automatic).toBe(true);
    expect(t.modifier).toBe(0);
  });

  it("stays automatic even when craftsmanship would modify it", () => {
    const t = rs.totalModifier({ availability: "ubiquitous", craftsmanship: "best" });
    expect(t.automatic).toBe(true);
  });

  it("rejects an unimplemented ruleset key", () => {
    expect(() => makeRequisitionRuleset("bc")).toThrow(/bc/);
  });
});
