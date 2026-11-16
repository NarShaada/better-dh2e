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

// The Damage Mod field on a weapon mod / ammunition is free text. effectiveWeapon appended it to
// the weapon's formula verbatim, so a mod typed as "2" turned "1d10+3" into "1d10+32" — a silent,
// wildly wrong damage roll. And a negative Pen Mod on a low-penetration weapon went below zero,
// which the soak maths reads as EXTRA armour, even on an unarmoured location.
describe("effectiveWeapon — a damage fragment typed without a sign, and penetration below zero", () => {
  const withMod = (damageMod, extra = {}) =>
    effectiveWeapon({ damage: "1d10+3", penetration: 0, mods: [{ name: "Mod", attackMod: 0, damageMod, penMod: 0, ...extra }] });

  it("adds a bare number rather than gluing its digits on", () => {
    expect(withMod("2").damage).toBe("1d10+3+2");
  });
  it("adds bare dice", () => {
    expect(withMod("1d5").damage).toBe("1d10+3+1d5");
  });
  it("leaves a signed fragment exactly as typed", () => {
    expect(withMod("+2").damage).toBe("1d10+3+2");
    expect(withMod("-1").damage).toBe("1d10+3-1");
    expect(withMod(" +1d5 ").damage).toBe("1d10+3+1d5");
  });
  it("leaves anything else alone rather than guessing", () => {
    expect(withMod("*2").damage).toBe("1d10+3*2");
  });
  // Launchers carry NO damage of their own — the loaded round's Damage Mod is the whole formula
  // (a Frag Missile is "2d10+2"). There is nothing to add it to, so it must not gain a leading "+".
  it("uses a fragment as the formula itself when the weapon has no damage of its own", () => {
    expect(effectiveWeapon({ damage: "", loadedAmmo: { name: "Frag Missile", damageMod: "2d10+2" } }).damage).toBe("2d10+2");
    expect(effectiveWeapon({ damage: "  ", mods: [{ damageMod: "6d10" }] }).damage).toBe("6d10");
  });
  it("then adds the next fragment to that", () => {
    expect(effectiveWeapon({ damage: "", mods: [{ damageMod: "1d10" }], loadedAmmo: { damageMod: "5" } }).damage).toBe("1d10+5");
  });
  it("never lets penetration go below zero", () => {
    expect(withMod("", { penMod: -2 }).penetration).toBe(0);
    expect(effectiveWeapon({ damage: "1d10", penetration: 4, mods: [{ penMod: -2 }] }).penetration).toBe(2);
    expect(effectiveWeapon({ damage: "1d10", penetration: 1, mods: [{ penMod: -3 }], loadedAmmo: { penMod: 4 } }).penetration).toBe(2);
  });
});
