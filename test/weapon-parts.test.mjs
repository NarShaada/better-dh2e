// test/weapon-parts.test.mjs
import { describe, it, expect } from "vitest";
import { refreshPartsFromSource, clearPartLinks } from "../scripts/helpers/weapon-parts.mjs";

const AMMO_SRC = {
  uuid: "Item.aaa", name: "Inferno Shells", type: "ammunition",
  system: { attackMod: 0, damageMod: "+2", penMod: 1, special: "burns",
            damageType: "energy", qualities: [{ key: "flame", value: null }] }
};
const MOD_SRC = {
  uuid: "Item.bbb", name: "Red-Dot Laser", type: "weaponMod",
  system: { attackMod: 10, damageMod: "", penMod: 0, special: "" }
};

const weapon = () => ({
  ammo: [
    { uuid: "Item.aaa", name: "Old Name", count: 4, attackMod: 0, damageMod: "", penMod: 0,
      special: "", damageType: "", qualities: [] },
    { uuid: "", name: "Hand-made", count: 2, attackMod: 0, damageMod: "+1", penMod: 0,
      special: "", damageType: "", qualities: [] }
  ],
  mods: [{ uuid: "Item.bbb", name: "Old Mod", attackMod: 0, damageMod: "", penMod: 0, special: "" }],
  loadedAmmo: { name: "Inferno Shells", attackMod: 0, damageMod: "", penMod: 0, special: "",
                damageType: "", qualities: [] }
});

describe("refreshPartsFromSource", () => {
  it("refreshes the matching ammo entry's name and effects", () => {
    const { ammo, changed } = refreshPartsFromSource(weapon(), AMMO_SRC);
    expect(changed).toBe(true);
    expect(ammo[0]).toMatchObject({
      uuid: "Item.aaa", name: "Inferno Shells", damageMod: "+2", penMod: 1,
      special: "burns", damageType: "energy"
    });
    expect(ammo[0].qualities).toEqual([{ key: "flame", value: null }]);
  });

  it("preserves the count — stock is not part of the source", () => {
    expect(refreshPartsFromSource(weapon(), AMMO_SRC).ammo[0].count).toBe(4);
  });

  it("leaves unlinked entries completely alone", () => {
    const { ammo } = refreshPartsFromSource(weapon(), AMMO_SRC);
    expect(ammo[1]).toEqual(weapon().ammo[1]);
  });

  it("refreshes a linked mod", () => {
    const { mods, changed } = refreshPartsFromSource(weapon(), MOD_SRC);
    expect(changed).toBe(true);
    expect(mods[0]).toMatchObject({ uuid: "Item.bbb", name: "Red-Dot Laser", attackMod: 10 });
  });

  it("NEVER touches loadedAmmo — the rounds in the gun are a snapshot", () => {
    const w = weapon();
    const out = refreshPartsFromSource(w, AMMO_SRC);
    expect(out.loadedAmmo).toBeUndefined();
    expect(w.loadedAmmo.damageMod).toBe("");
  });

  it("reports changed:false when nothing references the source", () => {
    const out = refreshPartsFromSource(weapon(), { ...AMMO_SRC, uuid: "Item.zzz" });
    expect(out.changed).toBe(false);
  });

  it("does not mutate the weapon it was given", () => {
    const w = weapon();
    const snap = JSON.stringify(w);
    refreshPartsFromSource(w, AMMO_SRC);
    expect(JSON.stringify(w)).toBe(snap);
  });

  it("tolerates a weapon with neither array", () => {
    const out = refreshPartsFromSource({}, AMMO_SRC);
    expect(out.changed).toBe(false);
    expect(out.ammo).toEqual([]);
    expect(out.mods).toEqual([]);
  });
});

describe("clearPartLinks", () => {
  it("drops the uuid but keeps the entry, its effects and its count", () => {
    const { ammo, changed } = clearPartLinks(weapon(), "Item.aaa");
    expect(changed).toBe(true);
    expect(ammo).toHaveLength(2);
    expect(ammo[0].uuid).toBe("");
    expect(ammo[0].count).toBe(4);
    expect(ammo[0].name).toBe("Old Name");
  });

  it("clears a mod link too", () => {
    expect(clearPartLinks(weapon(), "Item.bbb").mods[0].uuid).toBe("");
  });

  it("reports changed:false for an unreferenced uuid", () => {
    expect(clearPartLinks(weapon(), "Item.zzz").changed).toBe(false);
  });
});
