import { describe, it, expect } from "vitest";
import { gatherStatMods, sumStatMods, applyMovementMods } from "../scripts/helpers/cyber-stats.mjs";
import { classifyMovement } from "../scripts/helpers/battlemap-data.mjs";

const cyber = (installed, statMods, name = "Cyber") => ({ type: "cybernetic", name, system: { installed, statMods } });
const trait = (statMods, name = "Trait") => ({ type: "trait", name, system: { statMods } });

describe("gatherStatMods", () => {
  it("flattens statMods from installed cybernetics AND all traits (traits always active)", () => {
    const items = [
      cyber(true,  [{ stat: "moveAll", amount: 2 }, { stat: "wounds", amount: 3 }]),
      cyber(false, [{ stat: "size", amount: 1 }]),                                  // not installed → skipped
      trait([{ stat: "initiative", amount: 5 }]),                                    // trait → active
      { type: "armour", system: { equipped: true, statMods: [{ stat: "wounds", amount: 5 }] } },  // armour is not a stat-mod source
    ];
    expect(gatherStatMods(items)).toEqual([
      { stat: "moveAll", amount: 2 }, { stat: "wounds", amount: 3 }, { stat: "initiative", amount: 5 }
    ]);
  });
  it("sums Initiative across sources", () => {
    expect(sumStatMods(gatherStatMods([cyber(true, [{ stat: "initiative", amount: 2 }]), trait([{ stat: "initiative", amount: 3 }])])).initiative).toBe(5);
  });
  it("handles missing/empty input", () => {
    expect(gatherStatMods(undefined)).toEqual([]);
    expect(gatherStatMods([cyber(true, undefined)])).toEqual([]);
  });
});

describe("sumStatMods", () => {
  it("sums per stat with all keys defaulting to 0", () => {
    const s = sumStatMods([{ stat: "moveCharge", amount: 3 }, { stat: "moveCharge", amount: 1 }, { stat: "wounds", amount: 2 }]);
    expect(s.moveCharge).toBe(4);
    expect(s.wounds).toBe(2);
    expect(s.size).toBe(0);
    expect(s.moveAll).toBe(0);
  });
});

describe("applyMovementMods", () => {
  const rates = { half: 4, full: 8, charge: 12, run: 24 };
  it("adds moveAll to every band and per-band to its band", () => {
    const sums = sumStatMods([{ stat: "moveAll", amount: 1 }, { stat: "moveCharge", amount: 3 }]);
    expect(applyMovementMods(rates, sums)).toEqual({ half: 5, full: 9, charge: 16, run: 25 });
  });
  it("floors each band at 0", () => {
    const sums = sumStatMods([{ stat: "moveHalf", amount: -10 }]);
    expect(applyMovementMods(rates, sums).half).toBe(0);
  });
});

describe("classifyMovement under overlapping bands (least-action wins)", () => {
  it("returns the cheapest band whose rate covers the distance even if a per-band mod reorders rates", () => {
    // Charge boosted above Run: a 13m move is covered by Charge (cheaper action) — Charge is checked before Run.
    const rates = applyMovementMods({ half: 4, full: 8, charge: 12, run: 14 }, sumStatMods([{ stat: "moveCharge", amount: 8 }]));
    // rates now { half:4, full:8, charge:20, run:14 }
    expect(classifyMovement(13, rates)).toBe("charge");
    expect(classifyMovement(4, rates)).toBe("half");
  });
});
