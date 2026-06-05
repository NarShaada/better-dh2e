// test/sheet-data.test.mjs
import { describe, it, expect } from "vitest";
import { buildCharacteristics, buildSkills, fatiguePercent } from "../scripts/helpers/sheet-data.mjs";
import { BDH } from "../scripts/config.mjs";

function charStub() {
  const o = {};
  for (const k of Object.keys(BDH.characteristics)) o[k] = { total: 25, bonus: 2 };
  o.toughness = { total: 42, bonus: 4 };
  o.influence = { total: 37, bonus: 3 };
  return o;
}

function skillStub() {
  const o = {};
  for (const k of Object.keys(BDH.skills)) o[k] = { rank: "untrained", total: 5 };
  o.dodge = { rank: "trained", total: 45 };
  o.awareness = { rank: "known", total: 28 };
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
  it("sorts entries by label", () => {
    const labels = buildSkills(skillStub()).map((s) => s.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
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
