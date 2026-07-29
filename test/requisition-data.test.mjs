import { describe, it, expect } from "vitest";
import { BDH } from "../scripts/config.mjs";

describe("Availability modifiers — Table 5-1, printed page 141", () => {
  it("covers every availability level with no strays", () => {
    expect(Object.keys(BDH.availabilityModifier).sort())
      .toEqual(Object.keys(BDH.availability).sort());
  });

  it("matches the printed ladder", () => {
    expect(BDH.availabilityModifier).toEqual({
      ubiquitous: null,        // "Automatic" — no test at all
      abundant: 30,            // Easy
      plentiful: 20,           // Routine
      common: 10,              // Ordinary
      average: 0,              // Challenging
      scarce: -10,             // Difficult
      rare: -20,               // Hard
      veryRare: -30,           // Very Hard
      extremelyRare: -40,      // Arduous
      nearUnique: -50,         // Punishing
      unique: -60              // Hellish / GM's discretion
    });
  });

  it("steps by exactly 10 down the ladder once past Ubiquitous", () => {
    const steps = Object.keys(BDH.availability)
      .filter((k) => k !== "ubiquitous")
      .map((k) => BDH.availabilityModifier[k]);
    for (let i = 1; i < steps.length; i++) expect(steps[i - 1] - steps[i]).toBe(10);
  });

  it("keeps BDH.availability a flat key->label map for selectOptions", () => {
    for (const v of Object.values(BDH.availability)) expect(typeof v).toBe("string");
  });
});

describe("Craftsmanship Requisition modifiers — Table 5-2, printed page 141", () => {
  it("matches the printed table, using this system's `normal` for the book's Common", () => {
    expect(BDH.craftsmanshipRequisition).toEqual({ poor: 10, normal: 0, good: -20, best: -30 });
  });

  it("covers every craftsmanship tier", () => {
    expect(Object.keys(BDH.craftsmanshipRequisition).sort())
      .toEqual(Object.keys(BDH.craftsmanship).sort());
  });

  // Better gear is HARDER to obtain — the opposite sign to the melee to-hit bonus Good/Best give.
  it("penalises better craftsmanship", () => {
    expect(BDH.craftsmanshipRequisition.best).toBeLessThan(BDH.craftsmanshipRequisition.good);
    expect(BDH.craftsmanshipRequisition.poor).toBeGreaterThan(BDH.craftsmanshipRequisition.normal);
  });
});
