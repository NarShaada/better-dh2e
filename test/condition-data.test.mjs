import { describe, it, expect } from "vitest";
import { targetAttackModifiers, CONDITION_ATTACK_MODS } from "../scripts/helpers/condition-data.mjs";

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
