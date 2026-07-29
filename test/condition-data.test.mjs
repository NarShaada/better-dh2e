import { describe, it, expect } from "vitest";
import { targetAttackModifiers, CONDITION_ATTACK_MODS, fatigueKnockoutAction } from "../scripts/helpers/condition-data.mjs";
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

import { doubleDamageDice } from "../scripts/helpers/condition-data.mjs";

describe("doubleDamageDice", () => {
  it("doubles every die term, leaves flats", () => {
    expect(doubleDamageDice("1d10+3")).toBe("2d10+3");
    expect(doubleDamageDice("1d10+3+2d10")).toBe("2d10+3+4d10");
    expect(doubleDamageDice("2d5")).toBe("4d5");
    expect(doubleDamageDice("5")).toBe("5");
    expect(doubleDamageDice("1d10+1d5")).toBe("2d10+2d5");
  });
});

describe("Unaware + Pinned", () => {
  it("Unaware target: +30 melee and ranged", () => {
    expect(targetAttackModifiers(new Set(["unaware"]), true)).toEqual([{ id: "unaware", label: "Unaware", mod: 30 }]);
    expect(targetAttackModifiers(new Set(["unaware"]), false)).toEqual([{ id: "unaware", label: "Unaware", mod: 30 }]);
  });
  it("Pinned attacker: -20 ranged only (Ballistic Skill)", () => {
    expect(selfAttackModifiers(new Set(["pinned"]), false)).toEqual([{ id: "pinned", label: "Pinned", mod: -20 }]);
    expect(selfAttackModifiers(new Set(["pinned"]), true)).toEqual([]);
  });
});

describe("fatigueKnockoutAction (page 233 threshold, latched)", () => {
  it("applies once when Fatigue exceeds the threshold", () => {
    expect(fatigueKnockoutAction(5, 4, false)).toBe("apply");
  });

  it("does nothing at or below the threshold — exceeding it is the trigger", () => {
    expect(fatigueKnockoutAction(4, 4, false)).toBe("none");
    expect(fatigueKnockoutAction(0, 4, false)).toBe("none");
  });

  // The whole point of the latch: a GM clearing Unconscious by hand must not have it snap back.
  it("stays quiet while latched, even though Fatigue is still over", () => {
    expect(fatigueKnockoutAction(9, 4, true)).toBe("none");
  });

  it("re-arms once Fatigue drops back to the threshold or below", () => {
    expect(fatigueKnockoutAction(4, 4, true)).toBe("rearm");
    expect(fatigueKnockoutAction(1, 4, true)).toBe("rearm");
  });

  it("re-arming then exceeding again knocks out a second time", () => {
    expect(fatigueKnockoutAction(2, 4, true)).toBe("rearm");
    expect(fatigueKnockoutAction(5, 4, false)).toBe("apply");
  });

  it("ignores missing or non-numeric values rather than firing", () => {
    expect(fatigueKnockoutAction(undefined, 4, false)).toBe("none");
    expect(fatigueKnockoutAction(5, undefined, false)).toBe("none");
    expect(fatigueKnockoutAction(NaN, 4, true)).toBe("none");
  });
});
