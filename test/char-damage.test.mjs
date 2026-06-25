import { describe, it, expect } from "vitest";
import { characteristicDamageTotals, applyCharacteristicDamage } from "../scripts/helpers/char-damage.mjs";

const inj = (type, characteristic, amount, description = "") => ({ type, characteristic, amount, description });

describe("characteristicDamageTotals", () => {
  it("sums charDamage entries per characteristic, stacking additively", () => {
    const totals = characteristicDamageTotals([
      inj("charDamage", "agility", 10),
      inj("charDamage", "agility", 5),
      inj("charDamage", "strength", 3),
    ]);
    expect(totals).toEqual({ agility: 15, strength: 3 });
  });
  it("ignores injury-type entries and blank/zero/negative amounts", () => {
    const totals = characteristicDamageTotals([
      inj("injury", "", 0, "Lost arm"),
      inj("charDamage", "", 10),       // no characteristic
      inj("charDamage", "agility", 0), // zero
      inj("charDamage", "agility", -4),// negative
    ]);
    expect(totals).toEqual({});
  });
  it("treats nullish input as empty", () => {
    expect(characteristicDamageTotals(undefined)).toEqual({});
    expect(characteristicDamageTotals(null)).toEqual({});
  });
});

describe("applyCharacteristicDamage", () => {
  const mk = (total, unnatural = 0) => ({ total, bonus: Math.floor(total / 10) + unnatural, unnatural });

  it("reduces total and recomputes bonus, flagging impaired", () => {
    const chars = { agility: mk(40) };
    applyCharacteristicDamage(chars, [inj("charDamage", "agility", 10)]);
    expect(chars.agility.total).toBe(30);
    expect(chars.agility.bonus).toBe(3);
    expect(chars.agility.impaired).toBe(true);
  });
  it("stacks additively across entries", () => {
    const chars = { agility: mk(45) };
    applyCharacteristicDamage(chars, [inj("charDamage", "agility", 10), inj("charDamage", "agility", 8)]);
    expect(chars.agility.total).toBe(27);
    expect(chars.agility.bonus).toBe(2);
  });
  it("floors total at 0 (over-damage cannot go negative)", () => {
    const chars = { strength: mk(20) };
    applyCharacteristicDamage(chars, [inj("charDamage", "strength", 35)]);
    expect(chars.strength.total).toBe(0);
    expect(chars.strength.bonus).toBe(0);
  });
  it("preserves unnatural bonus on top of the recomputed bonus", () => {
    const chars = { toughness: mk(40, 2) }; // bonus 4 + 2 unnatural = 6
    applyCharacteristicDamage(chars, [inj("charDamage", "toughness", 10)]);
    expect(chars.toughness.total).toBe(30);
    expect(chars.toughness.bonus).toBe(5); // floor(30/10)=3 + 2
  });
  it("does not touch undamaged characteristics", () => {
    const chars = { agility: mk(40), strength: mk(30) };
    applyCharacteristicDamage(chars, [inj("charDamage", "agility", 10)]);
    expect(chars.strength).toEqual(mk(30));
    expect(chars.strength.impaired).toBeUndefined();
  });
  it("ordering: char damage then fatigue-style halving uses the reduced total", () => {
    // char damage 10 on Agility 40 -> 30 (bonus 3); a later ceil(/2) halving -> 15 (bonus 1)
    const chars = { agility: mk(40) };
    applyCharacteristicDamage(chars, [inj("charDamage", "agility", 10)]);
    const halved = Math.ceil(chars.agility.total / 2);
    expect(halved).toBe(15);
  });
});
