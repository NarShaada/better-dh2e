import { describe, it, expect } from "vitest";
import {
  maxPush, manifestState, fetterPushModifier, isDoubles,
  phenomenaTriggers, phenomenaModifier, substitutePR, resolveFocusTarget,
} from "../scripts/helpers/psychic-manifest.mjs";

describe("maxPush", () => {
  it("by class", () => {
    expect(maxPush("bound")).toBe(2);
    expect(maxPush("daemonic")).toBe(3);
    expect(maxPush("unbound")).toBe(4);
    expect(maxPush("???")).toBe(0);
  });
});

describe("manifestState + fetterPushModifier", () => {
  it("classifies and modifies", () => {
    expect(manifestState(2, 3)).toBe("fettered");
    expect(manifestState(3, 3)).toBe("normal");
    expect(manifestState(5, 3)).toBe("pushed");
    expect(fetterPushModifier(1, 3)).toBe(20);
    expect(fetterPushModifier(3, 3)).toBe(0);
    expect(fetterPushModifier(5, 3)).toBe(-20);
  });
});

describe("isDoubles", () => {
  it("matches repeated digits incl. 100→00", () => {
    expect(isDoubles(11)).toBe(true);
    expect(isDoubles(55)).toBe(true);
    expect(isDoubles(100)).toBe(true);
    expect(isDoubles(5)).toBe(false);
    expect(isDoubles(23)).toBe(false);
  });
});

describe("phenomenaTriggers", () => {
  it("normal/fettered: doubles for all classes", () => {
    for (const c of ["bound", "unbound", "daemonic"]) {
      expect(phenomenaTriggers(c, "normal", true)).toBe(true);
      expect(phenomenaTriggers(c, "fettered", false)).toBe(false);
    }
  });
  it("push: bound on non-doubles, others always", () => {
    expect(phenomenaTriggers("bound", "pushed", true)).toBe(false);
    expect(phenomenaTriggers("bound", "pushed", false)).toBe(true);
    expect(phenomenaTriggers("unbound", "pushed", true)).toBe(true);
    expect(phenomenaTriggers("daemonic", "pushed", true)).toBe(true);
  });
});

describe("phenomenaModifier", () => {
  it("standing +10 for unbound/daemonic on normal/fettered; 0 for bound", () => {
    expect(phenomenaModifier("bound", "normal", 0)).toBe(0);
    expect(phenomenaModifier("unbound", "fettered", 0)).toBe(10);
    expect(phenomenaModifier("daemonic", "normal", 0)).toBe(10);
  });
  it("push scaling capped", () => {
    expect(phenomenaModifier("bound", "pushed", 2)).toBe(0);
    expect(phenomenaModifier("unbound", "pushed", 3)).toBe(15);
    expect(phenomenaModifier("unbound", "pushed", 4)).toBe(20);
    expect(phenomenaModifier("daemonic", "pushed", 2)).toBe(20);
    expect(phenomenaModifier("daemonic", "pushed", 3)).toBe(30);
  });
});

describe("substitutePR", () => {
  it("replaces the PR token (incl. multiplication)", () => {
    expect(substitutePR("1d10+PR", 3)).toBe("1d10+3");
    expect(substitutePR("1d10+2+2*PR", 3)).toBe("1d10+2+2*3");
    expect(substitutePR("PR", 5)).toBe("5");
    expect(substitutePR("1d10", 3)).toBe("1d10");
  });
});

describe("resolveFocusTarget", () => {
  const system = {
    characteristics: { willpower: { total: 45 }, perception: { total: 40 } },
    skills: { psyniscience: { total: 50 } },
  };
  it("resolves a characteristic", () => {
    expect(resolveFocusTarget(system, "willpower")).toEqual({ kind: "characteristic", key: "willpower", total: 45 });
  });
  it("resolves a skill", () => {
    expect(resolveFocusTarget(system, "psyniscience")).toEqual({ kind: "skill", key: "psyniscience", total: 50 });
  });
  it("falls back to willpower for an unknown key", () => {
    expect(resolveFocusTarget(system, "nope")).toEqual({ kind: "characteristic", key: "willpower", total: 45 });
  });
});
