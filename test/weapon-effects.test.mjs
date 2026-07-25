// test/weapon-effects.test.mjs
import { describe, it, expect } from "vitest";
import { effectiveWeapon, totalMagazines, magazineWeight } from "../scripts/helpers/weapon-effects.mjs";

/** A weapon with nothing installed and nothing loaded. */
const base = () => ({
  damage: "1d10+3", penetration: 4, damageType: "impact",
  qualities: [{ key: "tearing", value: null }],
  mods: [], loadedAmmo: null
});

describe("effectiveWeapon", () => {
  it("passes a bare weapon through unchanged", () => {
    const r = effectiveWeapon(base());
    expect(r.attackMod).toBe(0);
    expect(r.damage).toBe("1d10+3");
    expect(r.penetration).toBe(4);
    expect(r.damageType).toBe("impact");
    expect(r.qualities).toEqual([{ key: "tearing", value: null }]);
  });

  it("tolerates a missing/empty system object", () => {
    expect(effectiveWeapon({}).damage).toBe("");
    expect(effectiveWeapon({}).qualities).toEqual([]);
    expect(effectiveWeapon(undefined).attackMod).toBe(0);
  });

  it("sums numeric mods and appends their damage fragments in order", () => {
    const s = base();
    s.mods = [
      { name: "Red-Dot", attackMod: 10, damageMod: "", penMod: 0, special: "" },
      { name: "Fire Sel", attackMod: 5, damageMod: "+2", penMod: 1, special: "" }
    ];
    const r = effectiveWeapon(s);
    expect(r.attackMod).toBe(15);
    expect(r.penetration).toBe(5);
    expect(r.damage).toBe("1d10+3+2");
  });

  it("applies loaded ammo on top of mods", () => {
    const s = base();
    s.mods = [{ name: "Fire Sel", attackMod: 5, damageMod: "+2", penMod: 1, special: "" }];
    s.loadedAmmo = { name: "Man-Stopper", attackMod: -5, damageMod: "+1d5", penMod: 3,
                     special: "", damageType: "", qualities: [] };
    const r = effectiveWeapon(s);
    expect(r.attackMod).toBe(0);
    expect(r.penetration).toBe(8);
    expect(r.damage).toBe("1d10+3+2+1d5");
  });

  it("overrides damageType only when the ammo sets one", () => {
    const s = base();
    s.loadedAmmo = { name: "Inferno", attackMod: 0, damageMod: "", penMod: 0,
                     special: "", damageType: "energy", qualities: [] };
    expect(effectiveWeapon(s).damageType).toBe("energy");

    const s2 = base();
    s2.loadedAmmo = { name: "Bolt", attackMod: 0, damageMod: "", penMod: 0,
                      special: "", damageType: "", qualities: [] };
    expect(effectiveWeapon(s2).damageType).toBe("impact");
  });

  it("adds an ammo quality while keeping the weapon's own", () => {
    const s = base();
    s.loadedAmmo = { name: "Inferno", attackMod: 0, damageMod: "", penMod: 0, special: "",
                     damageType: "", qualities: [{ key: "flame", value: null }] };
    const keys = effectiveWeapon(s).qualities.map((q) => q.key).sort();
    expect(keys).toEqual(["flame", "tearing"]);
  });

  it("replaces a same-key quality, value and all, without touching the others", () => {
    const s = base();
    s.qualities = [{ key: "tearing", value: null }, { key: "blast", value: 2 }];
    s.loadedAmmo = { name: "Frag", attackMod: 0, damageMod: "", penMod: 0, special: "",
                     damageType: "", qualities: [{ key: "blast", value: 3 }] };
    const r = effectiveWeapon(s);
    expect(r.qualities.find((q) => q.key === "blast").value).toBe(3);
    expect(r.qualities.filter((q) => q.key === "blast")).toHaveLength(1);
    expect(r.qualities.find((q) => q.key === "tearing")).toBeTruthy();
  });

  it("never mutates the system object it was given", () => {
    const s = base();
    s.loadedAmmo = { name: "X", attackMod: 1, damageMod: "+1", penMod: 1, special: "",
                     damageType: "energy", qualities: [{ key: "blast", value: 1 }] };
    const snapshot = JSON.stringify(s);
    effectiveWeapon(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it("lists what contributed, for the chat card", () => {
    const s = base();
    s.mods = [{ name: "Fire Sel", attackMod: 5, damageMod: "", penMod: 0, special: "" }];
    s.loadedAmmo = { name: "Inferno", attackMod: 0, damageMod: "", penMod: 0, special: "",
                     damageType: "", qualities: [] };
    expect(effectiveWeapon(s).sources.map((x) => x.label)).toEqual(["Fire Sel", "Inferno"]);
  });
});

describe("magazine stock", () => {
  it("counts nothing when the weapon stocks no ammo", () => {
    expect(totalMagazines({ weight: 7, ammo: [] })).toBe(0);
    expect(magazineWeight({ weight: 7, ammo: [] })).toBe(0);
    expect(magazineWeight({})).toBe(0);
  });

  it("sums counts across types", () => {
    const s = { weight: 7, ammo: [{ count: 4 }, { count: 1 }, { count: 0 }] };
    expect(totalMagazines(s)).toBe(5);
  });

  it("charges 10% of the weapon per spare magazine", () => {
    expect(magazineWeight({ weight: 7, ammo: [{ count: 4 }, { count: 1 }] })).toBeCloseTo(3.5);
  });
});
