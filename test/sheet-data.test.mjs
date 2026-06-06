// test/sheet-data.test.mjs
import { describe, it, expect } from "vitest";
import { buildCharacteristics, buildSkills, fatiguePercent } from "../scripts/helpers/sheet-data.mjs";
import { BDH } from "../scripts/config.mjs";

function charStub() {
  const o = {};
  for (const k of Object.keys(BDH.characteristics)) o[k] = { base: 25, advance: 0, unnatural: 0, total: 25, bonus: 2 };
  o.toughness = { base: 42, advance: 0, unnatural: 0, total: 42, bonus: 4 };
  o.influence = { base: 25, advance: 0, unnatural: 0, total: 37, bonus: 3 };
  return o;
}

function skillStub() {
  const o = {};
  for (const k of Object.keys(BDH.skills)) o[k] = { rank: "untrained", total: 5 };
  o.dodge = { rank: "trained", total: 45 };
  o.awareness = { rank: "known", total: 28 };
  o.parry = { rank: "trained", total: 60, favourite: true };
  o.commonLore = { specialties: [{ name: "Imperium", rank: "trained", total: 55, favourite: true }] };
  return o;
}

describe("buildCharacteristics", () => {
  it("returns all ten in config order with short names", () => {
    const rows = buildCharacteristics(charStub());
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ key: "weaponSkill", short: "WS" });
    expect(rows[9].key).toBe("influence");
  });
  it("carries total as value and bonus, and flags influence", () => {
    const rows = buildCharacteristics(charStub());
    const t = rows.find((r) => r.key === "toughness");
    expect(t.value).toBe(42);
    expect(t.bonus).toBe(4);
    expect(t.isInfluence).toBe(false);
    expect(rows.find((r) => r.key === "influence").isInfluence).toBe(true);
  });
  it("carries base and unnatural for Custom editing", () => {
    const rows = buildCharacteristics(charStub());
    const t = rows.find((r) => r.key === "toughness");
    expect(t.base).toBe(42);
    expect(t.unnatural).toBe(0);
  });
});

describe("buildSkills", () => {
  it("maps rank to tier, dots and trained flag", () => {
    const list = buildSkills(skillStub());
    const dodge = list.find((s) => s.key === "dodge");
    expect(dodge.tier).toBe(2);
    expect(dodge.trained).toBe(true);
    expect(dodge.dots).toEqual([true, true, false, false]);
    const acro = list.find((s) => s.key === "acrobatics");
    expect(acro.tier).toBe(0);
    expect(acro.trained).toBe(false);
    expect(acro.dots).toEqual([false, false, false, false]);
  });
  it("sorts standard skills first then specialist, each alphabetical by label", () => {
    const list = buildSkills(skillStub());
    const lastStandard = list.map((s) => s.specialist).lastIndexOf(false);
    const firstSpecialist = list.findIndex((s) => s.specialist);
    expect(firstSpecialist).toBeGreaterThan(lastStandard);
    const standard = list.filter((s) => !s.specialist).map((s) => s.label);
    const specialist = list.filter((s) => s.specialist).map((s) => s.label);
    expect(standard).toEqual([...standard].sort((a, b) => a.localeCompare(b)));
    expect(specialist).toEqual([...specialist].sort((a, b) => a.localeCompare(b)));
  });
  it("carries the favourite flag", () => {
    const list = buildSkills(skillStub());
    expect(list.find((s) => s.key === "parry").favourite).toBe(true);
    expect(list.find((s) => s.key === "dodge").favourite).toBe(false);
  });
  it("emits a specialist group with specialty rows", () => {
    const list = buildSkills(skillStub());
    const cl = list.find((s) => s.key === "commonLore");
    expect(cl.specialist).toBe(true);
    expect(cl.specialties[0]).toMatchObject({ index: 0, name: "Imperium", rank: "trained", total: 55, favourite: true });
  });
  it("keeps standard skills flat with specialist=false", () => {
    const list = buildSkills(skillStub());
    expect(list.find((s) => s.key === "dodge").specialist).toBe(false);
  });
});

describe("fatiguePercent", () => {
  it("computes a clamped, rounded percentage", () => {
    expect(fatiguePercent(1, 8)).toBe(13);
    expect(fatiguePercent(0, 8)).toBe(0);
    expect(fatiguePercent(10, 8)).toBe(100);
  });
  it("returns 0 when max is 0 or missing", () => {
    expect(fatiguePercent(3, 0)).toBe(0);
    expect(fatiguePercent(3, undefined)).toBe(0);
  });
});
