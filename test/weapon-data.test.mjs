// test/weapon-data.test.mjs
import { describe, it, expect } from "vitest";
import { weaponClassFlags } from "../scripts/helpers/weapon-data.mjs";

describe("weaponClassFlags", () => {
  it("melee: no range, no ammo", () => {
    expect(weaponClassFlags("melee")).toEqual({ usesRange: false, usesAmmo: false });
  });
  it("thrown: range yes, no ammo", () => {
    expect(weaponClassFlags("thrown")).toEqual({ usesRange: true, usesAmmo: false });
  });
  it("ranged classes: range + ammo", () => {
    for (const c of ["pistol", "basic", "heavy"]) {
      expect(weaponClassFlags(c)).toEqual({ usesRange: true, usesAmmo: true });
    }
  });
  it("unknown class defaults to ranged", () => {
    expect(weaponClassFlags("???")).toEqual({ usesRange: true, usesAmmo: true });
  });
});
