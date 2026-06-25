import { describe, it, expect } from "vitest";
import {
  gatherActiveBonusEntries, persistentCharacteristicBonuses, applyPersistentBonuses, rollBonusesFor, effectiveStrengthBonus
} from "../scripts/helpers/item-bonuses.mjs";

const bonus = (o) => ({ kind: "skill", key: "", amount: 0, situational: false, ...o });
const item = (type, system, name = "Src") => ({ type, name, system });

describe("gatherActiveBonusEntries", () => {
  it("includes installed cybernetics, equipped armour, and all gear; excludes inactive", () => {
    const items = [
      item("cybernetic", { installed: true,  bonuses: [bonus({ key: "strength", kind: "characteristic", amount: 5 })] }, "Implant"),
      item("cybernetic", { installed: false, bonuses: [bonus({ key: "agility", kind: "characteristic", amount: 5 })] }),
      item("armour",     { equipped: true,   bonuses: [bonus({ key: "awareness", amount: 10, situational: true })] }, "Helm"),
      item("armour",     { equipped: false,  bonuses: [bonus({ key: "stealth", amount: 10 })] }),
      item("gear",       { bonuses: [bonus({ key: "intimidate", amount: 10 })] }, "Skull"),
      item("weapon",     { bonuses: [bonus({ key: "parry", amount: 10 })] }),
    ];
    const out = gatherActiveBonusEntries(items);
    expect(out.map((e) => e.key)).toEqual(["strength", "awareness", "intimidate"]);
    expect(out[0]).toMatchObject({ sourceType: "cybernetic", sourceName: "Implant", situational: false });
    expect("persistent" in out[0]).toBe(false);
  });
  it("coerces gear entries to situational", () => {
    const out = gatherActiveBonusEntries([
      item("gear", { bonuses: [bonus({ key: "fellowship", kind: "characteristic", amount: 5, situational: false })] }, "Trophy"),
    ]);
    expect(out[0]).toMatchObject({ situational: true });
  });
  it("handles missing/empty input", () => {
    expect(gatherActiveBonusEntries(undefined)).toEqual([]);
    expect(gatherActiveBonusEntries([item("gear", {})])).toEqual([]);
  });
});

describe("persistentCharacteristicBonuses", () => {
  it("sums UNCHECKED characteristic bonuses from cybernetic/armour sources, stacking", () => {
    const entries = [
      { kind: "characteristic", key: "strength", amount: 5, situational: false, sourceType: "cybernetic" },
      { kind: "characteristic", key: "strength", amount: 3, situational: false, sourceType: "armour" },
      { kind: "characteristic", key: "agility", amount: 10, situational: true, sourceType: "cybernetic" },   // situational → excluded
      { kind: "skill", key: "athletics", amount: 10, situational: false, sourceType: "cybernetic" },          // skill → excluded
      { kind: "characteristic", key: "fellowship", amount: 5, situational: false, sourceType: "gear" },        // gear source → excluded
    ];
    expect(persistentCharacteristicBonuses(entries)).toEqual({ strength: 8 });
  });
});

describe("applyPersistentBonuses", () => {
  const mk = (total, unnatural = 0) => ({ total, bonus: Math.floor(total / 10) + unnatural, unnatural });
  it("raises total, recomputes bonus, flags boosted on a positive increase", () => {
    const chars = { strength: mk(38) };
    applyPersistentBonuses(chars, [{ kind: "characteristic", key: "strength", amount: 5, situational: false, sourceType: "cybernetic" }]);
    expect(chars.strength.total).toBe(43);
    expect(chars.strength.bonus).toBe(4);
    expect(chars.strength.boosted).toBe(true);
  });
  it("preserves unnatural and ignores situational/skill entries", () => {
    const chars = { toughness: mk(40, 2) };
    applyPersistentBonuses(chars, [{ kind: "characteristic", key: "toughness", amount: 10, situational: false, sourceType: "armour" }]);
    expect(chars.toughness.bonus).toBe(7); // floor(50/10)=5 + 2
  });
});

describe("rollBonusesFor", () => {
  const entries = [
    { kind: "skill", key: "awareness", amount: 10, situational: false, sourceName: "Auspex" },     // unchecked skill → auto
    { kind: "skill", key: "awareness", amount: 5, situational: true, sourceName: "Bionic Eye" },    // checked skill → situational
    { kind: "characteristic", key: "strength", amount: 5, situational: false, sourceName: "Arm" },  // unchecked char → persistent (excluded from rolls)
    { kind: "characteristic", key: "strength", amount: 10, situational: true, sourceName: "Arm2" }, // checked char → situational
  ];
  it("auto = unchecked SKILLS only; situational = checked of either kind", () => {
    expect(rollBonusesFor(entries, "skill", "awareness")).toEqual({ auto: 10, situational: [{ id: "b1", label: "Bionic Eye +5", amount: 5 }] });
  });
  it("an unchecked characteristic is persistent — neither auto nor situational", () => {
    const r = rollBonusesFor(entries, "characteristic", "strength");
    expect(r.auto).toBe(0);
    expect(r.situational).toEqual([{ id: "b3", label: "Arm2 +10", amount: 10 }]);
  });
  it("empty for non-matching target", () => {
    expect(rollBonusesFor(entries, "skill", "dodge")).toEqual({ auto: 0, situational: [] });
  });
});

describe("effectiveStrengthBonus", () => {
  it("recomputes SB with a Strength-point delta", () => {
    expect(effectiveStrengthBonus(40, 0, 0)).toBe(4);    // == base bonus
    expect(effectiveStrengthBonus(40, 0, 10)).toBe(5);   // +10 → +1 SB
    expect(effectiveStrengthBonus(35, 0, 5)).toBe(4);    // crosses 40
    expect(effectiveStrengthBonus(34, 0, 5)).toBe(3);    // 39, no cross
    expect(effectiveStrengthBonus(40, 2, 10)).toBe(7);   // +unnatural
    expect(effectiveStrengthBonus(40, 0, -10)).toBe(3);  // negative delta lowers SB
  });
});
