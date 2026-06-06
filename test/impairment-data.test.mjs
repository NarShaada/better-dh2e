import { describe, it, expect } from "vitest";
import { craftAgilityAdj, effectiveAgilityCap, applyImpairments } from "../scripts/helpers/impairment-data.mjs";

describe("craftAgilityAdj", () => {
  it("poor -10, good/best +10, normal 0", () => {
    expect(craftAgilityAdj("poor")).toBe(-10);
    expect(craftAgilityAdj("good")).toBe(10);
    expect(craftAgilityAdj("best")).toBe(10);
    expect(craftAgilityAdj("normal")).toBe(0);
  });
});
describe("effectiveAgilityCap", () => {
  it("maxAgility + craft adj; ignores maxAgility 0; most restrictive wins; null if none", () => {
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "normal" }])).toBe(30);
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "poor" }])).toBe(20);
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "good" }])).toBe(40);
    expect(effectiveAgilityCap([{ maxAgility: 0, craftsmanship: "poor" }])).toBeNull();
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "normal" }, { maxAgility: 20, craftsmanship: "normal" }])).toBe(20);
    expect(effectiveAgilityCap([])).toBeNull();
  });
});
describe("applyImpairments", () => {
  it("caps Agility to the armour cap and flags it", () => {
    const chars = { agility: { total: 50, bonus: 5, unnatural: 0 } };
    applyImpairments(chars, 0, 30);
    expect(chars.agility.total).toBe(30);
    expect(chars.agility.bonus).toBe(3);
    expect(chars.agility.impaired).toBe(true);
  });
  it("no cap leaves Agility alone", () => {
    const chars = { agility: { total: 50, bonus: 5, unnatural: 0 } };
    applyImpairments(chars, 0, null);
    expect(chars.agility.total).toBe(50);
    expect(chars.agility.impaired).toBeFalsy();
  });
  it("halves a characteristic whose bonus < fatigue (round up), unnatural stays on top", () => {
    const chars = { strength: { total: 35, bonus: 6, unnatural: 3 } };
    applyImpairments(chars, 7, null);
    expect(chars.strength.total).toBe(18);
    expect(chars.strength.bonus).toBe(4);
    expect(chars.strength.impaired).toBe(true);
  });
  it("does not halve when bonus >= fatigue", () => {
    const chars = { strength: { total: 35, bonus: 6, unnatural: 3 } };
    applyImpairments(chars, 6, null);
    expect(chars.strength.total).toBe(35);
    expect(chars.strength.impaired).toBeFalsy();
  });
});
