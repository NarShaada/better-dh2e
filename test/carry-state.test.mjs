import { describe, it, expect } from "vitest";
import { nextCarryState, carriedWeight, applyCarryInvariant } from "../scripts/helpers/carry-state.mjs";

describe("nextCarryState", () => {
  const equippable = { equippable: true };

  it("cycles equippable items unequipped → equipped → stashed → unequipped", () => {
    const a = nextCarryState({ equipped: false, stashed: false }, equippable);
    expect(a).toEqual({ equipped: true, stashed: false });
    const b = nextCarryState(a, equippable);
    expect(b).toEqual({ equipped: false, stashed: true });
    const c = nextCarryState(b, equippable);
    expect(c).toEqual({ equipped: false, stashed: false });
  });

  it("cycles non-equippable items not stashed → stashed → not stashed", () => {
    const a = nextCarryState({ equipped: false, stashed: false }, { equippable: false });
    expect(a).toEqual({ equipped: false, stashed: true });
    expect(nextCarryState(a, { equippable: false })).toEqual({ equipped: false, stashed: false });
  });

  it("never leaves an item both equipped and stashed", () => {
    // An inconsistent document (hand-edited, macro, import) must not propagate the inconsistency.
    const out = nextCarryState({ equipped: true, stashed: true }, equippable);
    expect(out.equipped && out.stashed).toBe(false);
  });

  it("treats a stashed equippable item as stashed regardless of the equipped flag", () => {
    expect(nextCarryState({ equipped: true, stashed: true }, equippable))
      .toEqual({ equipped: false, stashed: false });
  });

  it("tolerates missing fields", () => {
    expect(nextCarryState({}, equippable)).toEqual({ equipped: true, stashed: false });
    expect(nextCarryState(undefined, { equippable: false })).toEqual({ equipped: false, stashed: true });
  });
});

describe("carriedWeight", () => {
  const gear = (weight, quantity, stashed = false) => ({ type: "gear", system: { weight, quantity, stashed } });
  const armour = (weight, stashed = false) => ({ type: "armour", system: { weight, stashed } });
  const field = (weight, stashed = false) => ({ type: "forceField", system: { weight, stashed } });
  const weapon = (weight, mags, stashed = false) =>
    ({ type: "weapon", system: { weight, stashed, ammo: [{ count: mags }] } });

  it("sums gear by quantity", () => {
    expect(carriedWeight([gear(2, 3)])).toBe(6);
  });

  it("sums armour and force fields", () => {
    expect(carriedWeight([armour(8), field(1.5)])).toBe(9.5);
  });

  it("counts a weapon's spare magazines at 10% of the weapon each", () => {
    expect(carriedWeight([weapon(10, 2)])).toBe(12);   // 10 + 2 × 1
  });

  it("excludes stashed items of every weight-bearing type", () => {
    const items = [gear(2, 3, true), armour(8, true), field(1.5, true), weapon(10, 2, true)];
    expect(carriedWeight(items)).toBe(0);
  });

  it("drops a stashed weapon's spare magazines with the weapon", () => {
    expect(carriedWeight([weapon(10, 5, true), weapon(4, 1)])).toBe(4.4);   // only the carried gun + its mag
  });

  it("ignores item types that carry no weight", () => {
    expect(carriedWeight([{ type: "cybernetic", system: { weight: 99 } },
                          { type: "talent", system: {} }])).toBe(0);
  });

  it("tolerates missing weight, quantity and ammo", () => {
    expect(carriedWeight([{ type: "gear", system: {} }, { type: "weapon", system: {} }])).toBe(0);
  });

  it("returns 0 for an empty or missing list", () => {
    expect(carriedWeight([])).toBe(0);
    expect(carriedWeight(undefined)).toBe(0);
  });
});

describe("applyCarryInvariant", () => {
  it("clears equipped on a stashed item", () => {
    expect(applyCarryInvariant({ stashed: true, equipped: true }).equipped).toBe(false);
  });
  it("leaves an equipped, unstashed item alone", () => {
    expect(applyCarryInvariant({ stashed: false, equipped: true }).equipped).toBe(true);
  });
  it("is harmless for types with no equipped field (gear)", () => {
    expect(applyCarryInvariant({ stashed: true })).toEqual({ stashed: true });
  });
  it("is harmless for types with neither field", () => {
    expect(applyCarryInvariant({ installed: true })).toEqual({ installed: true });
  });
  it("mutates in place and returns the same object", () => {
    const sys = { stashed: true, equipped: true };
    expect(applyCarryInvariant(sys)).toBe(sys);
    expect(sys.equipped).toBe(false);
  });
});
