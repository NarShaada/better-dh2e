import { describe, it, expect } from "vitest";
import { buildSourceIndex, ACQUIRABLE_TYPES, ADDABLE_TYPES, isAddable, isPartOnly } from "../scripts/helpers/requisition-sources.mjs";

const e = (name, type, extra = {}) => ({ name, type, uuid: `uuid:${name}:${type}`, ...extra });

describe("ACQUIRABLE_TYPES", () => {
  it("covers the gear-like item types and excludes the rest", () => {
    expect(ACQUIRABLE_TYPES).toEqual(
      ["weapon", "weaponMod", "ammunition", "armour", "armourMod", "forceField", "gear", "cybernetic"]
    );
    for (const t of ["talent", "trait", "psychicPower"]) expect(ACQUIRABLE_TYPES).not.toContain(t);
  });
});

describe("buildSourceIndex", () => {
  it("drops types you cannot requisition", () => {
    const out = buildSourceIndex([e("Lasgun", "weapon"), e("Ambidextrous", "talent"), e("Fear", "trait")]);
    expect(out.map((x) => x.label)).toEqual(["Lasgun"]);
  });

  it("sorts by label", () => {
    const out = buildSourceIndex([e("Sword", "weapon"), e("Autogun", "weapon"), e("Medikit", "gear")]);
    expect(out.map((x) => x.label)).toEqual(["Autogun", "Medikit", "Sword"]);
  });

  it("keeps a unique name bare", () => {
    const out = buildSourceIndex([e("Lasgun", "weapon", { source: "DH2e Weapons" })]);
    expect(out[0].label).toBe("Lasgun");
  });

  it("disambiguates a name that appears in two sources", () => {
    const out = buildSourceIndex([
      e("Lasgun", "weapon", { source: "DH2e Weapons" }),
      e("Lasgun", "weapon", { source: "World" })
    ]);
    expect(out.map((x) => x.label).sort()).toEqual(["Lasgun (DH2e Weapons)", "Lasgun (World)"]);
  });

  it("leaves a collision bare when there is no source to name", () => {
    const out = buildSourceIndex([e("Lasgun", "weapon"), e("Lasgun", "weapon")]);
    expect(out.map((x) => x.label)).toEqual(["Lasgun", "Lasgun"]);
  });

  it("carries uuid, type and availability through", () => {
    const out = buildSourceIndex([e("Bolt Pistol", "weapon", { availability: "veryRare" })]);
    expect(out[0]).toEqual({
      label: "Bolt Pistol", uuid: "uuid:Bolt Pistol:weapon", type: "weapon", availability: "veryRare"
    });
  });

  it("defaults a missing availability to null rather than undefined", () => {
    const out = buildSourceIndex([e("Improvised", "weapon")]);
    expect(out[0].availability).toBeNull();
  });

  it("returns an empty array for no sources", () => {
    expect(buildSourceIndex([])).toEqual([]);
    expect(buildSourceIndex(undefined)).toEqual([]);
  });

  it("does not throw on an entry with no name", () => {
    expect(() => buildSourceIndex([{ type: "weapon" }])).not.toThrow();
    expect(buildSourceIndex([{ type: "weapon" }])).toEqual([]);
  });

  it("does not throw on two entries with no name", () => {
    expect(() => buildSourceIndex([{ type: "weapon" }, { type: "gear" }])).not.toThrow();
    expect(buildSourceIndex([{ type: "weapon" }, { type: "gear" }])).toEqual([]);
  });

  it("drops nameless entries but keeps named ones in a mixed list", () => {
    const out = buildSourceIndex([e("Lasgun", "weapon"), { type: "weapon" }, e("Autogun", "weapon")]);
    expect(out.map((x) => x.label)).toEqual(["Autogun", "Lasgun"]);
  });

  it("disambiguates three-plus entries sharing a name, mixing sourced and unsourced", () => {
    const out = buildSourceIndex([
      e("Lasgun", "weapon", { source: "A" }),
      e("Lasgun", "weapon", { source: "B" }),
      e("Lasgun", "weapon")
    ]);
    expect(out.map((x) => x.label).sort()).toEqual(["Lasgun", "Lasgun (A)", "Lasgun (B)"]);
  });
});

describe("ADDABLE_TYPES / isAddable", () => {
  it("covers exactly the types the actor sheet renders", () => {
    expect(ADDABLE_TYPES).toEqual(["weapon", "armour", "forceField", "gear", "cybernetic"]);
  });

  it("is a subset of what you can requisition", () => {
    for (const t of ADDABLE_TYPES) expect(ACQUIRABLE_TYPES).toContain(t);
  });

  it("refuses the part types — the sheet has nowhere to show them", () => {
    expect(isAddable("weaponMod")).toBe(false);
    expect(isAddable("ammunition")).toBe(false);
    expect(isAddable("armourMod")).toBe(false);
  });

  it("allows the types that have a home", () => {
    expect(isAddable("weapon")).toBe(true);
    expect(isAddable("armour")).toBe(true);
    expect(isAddable("gear")).toBe(true);
  });

  it("defaults to false for unknown or absent types, so a new type never creates an orphan", () => {
    expect(isAddable("psychicPower")).toBe(false);
    expect(isAddable(undefined)).toBe(false);
    expect(isAddable(null)).toBe(false);
    expect(isAddable("")).toBe(false);
  });
});

describe("isPartOnly", () => {
  it("is true for exactly the acquirable types the sheet cannot render", () => {
    expect(isPartOnly("weaponMod")).toBe(true);
    expect(isPartOnly("ammunition")).toBe(true);
    expect(isPartOnly("armourMod")).toBe(true);
  });

  it("is false for every addable type", () => {
    for (const t of ADDABLE_TYPES) expect(isPartOnly(t)).toBe(false);
  });

  // The distinction that keeps the drop guard and canGrant from over-refusing: talents, traits and
  // psychic powers are not addable (they are not acquired with Influence at all) but the sheet DOES
  // render them, so they must stay droppable and grantable. `!isAddable(t)` would refuse them.
  it("is false for renderable non-acquirable types, unlike !isAddable", () => {
    for (const t of ["talent", "trait", "psychicPower"]) {
      expect(isAddable(t)).toBe(false);
      expect(isPartOnly(t)).toBe(false);
    }
  });

  it("is false for unknown or absent types", () => {
    expect(isPartOnly("nonsense")).toBe(false);
    expect(isPartOnly(undefined)).toBe(false);
    expect(isPartOnly(null)).toBe(false);
    expect(isPartOnly("")).toBe(false);
  });

  it("partitions ACQUIRABLE_TYPES with isAddable — every acquirable type is one or the other", () => {
    for (const t of ACQUIRABLE_TYPES) expect(isAddable(t)).toBe(!isPartOnly(t));
  });
});

describe("ACQUIRABLE_TYPES — armourMod", () => {
  it("includes armourMod so its Availability feeds the test", () => {
    expect(ACQUIRABLE_TYPES).toContain("armourMod");
  });
});
