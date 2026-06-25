import { describe, it, expect } from "vitest";
import {
  gatherActiveBonusEntries, persistentCharacteristicBonuses, applyPersistentBonuses, rollBonusesFor
} from "../scripts/helpers/item-bonuses.mjs";

const bonus = (o) => ({ kind: "skill", key: "", amount: 0, situational: false, persistent: false, ...o });
const item = (type, system, name = "Src") => ({ type, name, system });

describe("gatherActiveBonusEntries", () => {
  it("includes installed cybernetics, equipped armour, and all gear; excludes inactive", () => {
    const items = [
      item("cybernetic", { installed: true,  bonuses: [bonus({ key: "strength", kind: "characteristic", amount: 5, persistent: true })] }, "Implant"),
      item("cybernetic", { installed: false, bonuses: [bonus({ key: "agility", kind: "characteristic", amount: 5, persistent: true })] }),
      item("armour",     { equipped: true,   bonuses: [bonus({ key: "awareness", amount: 10, situational: true })] }, "Helm"),
      item("armour",     { equipped: false,  bonuses: [bonus({ key: "stealth", amount: 10 })] }),
      item("gear",       { bonuses: [bonus({ key: "intimidate", amount: 10 })] }, "Skull"),
      item("weapon",     { bonuses: [bonus({ key: "parry", amount: 10 })] }),
    ];
    const out = gatherActiveBonusEntries(items);
    expect(out.map((e) => e.key)).toEqual(["strength", "awareness", "intimidate"]);
    expect(out[0]).toMatchObject({ sourceType: "cybernetic", sourceName: "Implant", persistent: true });
  });
  it("coerces gear entries to situational and never persistent", () => {
    const out = gatherActiveBonusEntries([
      item("gear", { bonuses: [bonus({ key: "fellowship", kind: "characteristic", amount: 5, situational: false, persistent: true })] }, "Trophy"),
    ]);
    expect(out[0]).toMatchObject({ situational: true, persistent: false });
  });
  it("handles missing/empty input", () => {
    expect(gatherActiveBonusEntries(undefined)).toEqual([]);
    expect(gatherActiveBonusEntries([item("gear", {})])).toEqual([]);
  });
});

describe("persistentCharacteristicBonuses", () => {
  it("sums persistent characteristic increases from cybernetic/armour sources, stacking", () => {
    const entries = [
      { kind: "characteristic", key: "strength", amount: 5, persistent: true, sourceType: "cybernetic" },
      { kind: "characteristic", key: "strength", amount: 3, persistent: true, sourceType: "armour" },
      { kind: "characteristic", key: "agility", amount: 10, persistent: false, sourceType: "cybernetic" },
      { kind: "skill", key: "athletics", amount: 10, persistent: true, sourceType: "cybernetic" },
      { kind: "characteristic", key: "fellowship", amount: 5, persistent: true, sourceType: "gear" },
    ];
    expect(persistentCharacteristicBonuses(entries)).toEqual({ strength: 8 });
  });
});

describe("applyPersistentBonuses", () => {
  const mk = (total, unnatural = 0) => ({ total, bonus: Math.floor(total / 10) + unnatural, unnatural });
  it("raises total, recomputes bonus, flags boosted on a positive increase", () => {
    const chars = { strength: mk(38) };
    applyPersistentBonuses(chars, [{ kind: "characteristic", key: "strength", amount: 5, persistent: true, sourceType: "cybernetic" }]);
    expect(chars.strength.total).toBe(43);
    expect(chars.strength.bonus).toBe(4);
    expect(chars.strength.boosted).toBe(true);
  });
  it("preserves unnatural and ignores non-persistent/skill entries", () => {
    const chars = { toughness: mk(40, 2) };
    applyPersistentBonuses(chars, [{ kind: "characteristic", key: "toughness", amount: 10, persistent: true, sourceType: "armour" }]);
    expect(chars.toughness.bonus).toBe(7); // floor(50/10)=5 + 2
  });
  it("composes with a later char-damage subtraction (ordering)", () => {
    const chars = { strength: mk(40) };
    applyPersistentBonuses(chars, [{ kind: "characteristic", key: "strength", amount: 10, persistent: true, sourceType: "cybernetic" }]);
    chars.strength.total -= 5; // simulate applyCharacteristicDamage running next
    expect(chars.strength.total).toBe(45);
  });
});

describe("rollBonusesFor", () => {
  const entries = [
    { kind: "skill", key: "awareness", amount: 10, situational: false, persistent: false, sourceName: "Auspex" },
    { kind: "skill", key: "awareness", amount: 5, situational: true, persistent: false, sourceName: "Bionic Eye" },
    { kind: "skill", key: "stealth", amount: 20, situational: true, persistent: false, sourceName: "Cloak" },
    { kind: "characteristic", key: "strength", amount: 5, situational: false, persistent: true, sourceType: "cybernetic" },
  ];
  it("splits matching non-persistent bonuses into auto and situational", () => {
    const r = rollBonusesFor(entries, "skill", "awareness");
    expect(r.auto).toBe(10);
    expect(r.situational).toEqual([{ id: "b1", label: "Bionic Eye +5", amount: 5 }]);
  });
  it("excludes persistent entries and non-matching targets", () => {
    expect(rollBonusesFor(entries, "characteristic", "strength")).toEqual({ auto: 0, situational: [] });
    expect(rollBonusesFor(entries, "skill", "dodge")).toEqual({ auto: 0, situational: [] });
  });
});
