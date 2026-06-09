import { describe, it, expect } from "vitest";
import { targetAttackModifiers, CONDITION_ATTACK_MODS } from "../scripts/helpers/condition-data.mjs";
import { selfAttackModifiers, evadeConditionModifier } from "../scripts/helpers/condition-data.mjs";

describe("targetAttackModifiers", () => {
  it("Run: melee +20, ranged -20", () => {
    expect(targetAttackModifiers(new Set(["run"]), true)).toEqual([{ id: "run", label: "Run", mod: 20 }]);
    expect(targetAttackModifiers(new Set(["run"]), false)).toEqual([{ id: "run", label: "Run", mod: -20 }]);
  });
  it("ignores conditions with no attack effect, and empty sets", () => {
    expect(targetAttackModifiers(new Set(), true)).toEqual([]);
    expect(targetAttackModifiers(new Set(["run", "somethingElse"]), true)).toEqual([{ id: "run", label: "Run", mod: 20 }]);
  });
  it("accepts an array too", () => {
    expect(targetAttackModifiers(["run"], false)).toEqual([{ id: "run", label: "Run", mod: -20 }]);
  });
});

describe("targetAttackModifiers (Stunned + Prone, range-aware)", () => {
  it("Stunned: +20 melee and ranged", () => {
    expect(targetAttackModifiers(new Set(["stunned"]), true)).toEqual([{ id: "stunned", label: "Stunned", mod: 20 }]);
    expect(targetAttackModifiers(new Set(["stunned"]), false)).toEqual([{ id: "stunned", label: "Stunned", mod: 20 }]);
  });
  it("Prone: melee +10, ranged -10 except at Point-Blank", () => {
    expect(targetAttackModifiers(new Set(["prone"]), true)).toEqual([{ id: "prone", label: "Prone", mod: 10 }]);
    expect(targetAttackModifiers(new Set(["prone"]), false, "normal")).toEqual([{ id: "prone", label: "Prone", mod: -10 }]);
    expect(targetAttackModifiers(new Set(["prone"]), false, "pointBlank")).toEqual([]);
  });
});

describe("selfAttackModifiers", () => {
  it("Prone attacker: -10 melee, none ranged", () => {
    expect(selfAttackModifiers(new Set(["prone"]), true)).toEqual([{ id: "prone", label: "Prone", mod: -10 }]);
    expect(selfAttackModifiers(new Set(["prone"]), false)).toEqual([]);
  });
});

describe("evadeConditionModifier", () => {
  it("Prone evader: -20", () => {
    expect(evadeConditionModifier(new Set(["prone"]))).toBe(-20);
    expect(evadeConditionModifier(new Set())).toBe(0);
  });
});

import { pickToxic } from "../scripts/helpers/condition-data.mjs";

describe("pickToxic (most-potent wins)", () => {
  it("takes the higher potency and carries its damage type", () => {
    expect(pickToxic(null, { potency: 2, damageType: "Impact" })).toEqual({ potency: 2, damageType: "Impact" });
    expect(pickToxic({ potency: 2, damageType: "Impact" }, { potency: 3, damageType: "Energy" }))
      .toEqual({ potency: 3, damageType: "Energy" });
    expect(pickToxic({ potency: 3, damageType: "Energy" }, { potency: 2, damageType: "Impact" }))
      .toEqual({ potency: 3, damageType: "Energy" });
  });
  it("keeps the existing on a tie", () => {
    expect(pickToxic({ potency: 3, damageType: "Energy" }, { potency: 3, damageType: "Impact" }))
      .toEqual({ potency: 3, damageType: "Energy" });
  });
});
