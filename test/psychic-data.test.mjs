import { describe, it, expect, beforeAll } from "vitest";
import { isPsychicAttack, PSYCHIC_ATTACK_TYPES } from "../scripts/helpers/psychic-data.mjs";
import { BDH } from "../scripts/config.mjs";
import { maleficCorruptionGain } from "../scripts/helpers/psychic-manifest.mjs";

describe("isPsychicAttack", () => {
  it("bolt/barrage/storm/blast are attacks; effect is not", () => {
    expect(isPsychicAttack("bolt")).toBe(true);
    expect(isPsychicAttack("barrage")).toBe(true);
    expect(isPsychicAttack("storm")).toBe(true);
    expect(isPsychicAttack("blast")).toBe(true);
    expect(isPsychicAttack("effect")).toBe(false);
    expect(isPsychicAttack(undefined)).toBe(false);
  });
  it("exposes the set", () => {
    expect(PSYCHIC_ATTACK_TYPES.has("storm")).toBe(true);
  });
});

describe("BDH.disciplines", () => {
  it("registers the five core disciplines, the two Daemonology ones, and the minor catch-all", () => {
    expect(Object.keys(BDH.disciplines)).toEqual([
      "biomancy", "divination", "pyromancy", "telekinesis", "telepathy",
      "sanctic", "malefic", "minor"
    ]);
  });

  it("labels the Daemonology disciplines as the book prints them", () => {
    expect(BDH.disciplines.sanctic).toBe("Sanctic Daemonology");
    expect(BDH.disciplines.malefic).toBe("Malefic Daemonology");
  });
});

describe("PsychicPowerModel.migrateData — blastRadius", () => {
  // psychic-power-model.mjs imports base-item-model.mjs, which reads `foundry.data.fields` at
  // MODULE SCOPE (`const fields = foundry.data.fields;`) and extends `foundry.abstract.TypeDataModel`
  // in its class declaration — both evaluated at import time. A static top-level import would throw
  // before any test runs, so — matching the pattern in test/actor-model-defaults.test.mjs — stub the
  // minimum `foundry` global and import dynamically. migrateData is a plain static method that never
  // touches fields/schema, so the stub doesn't need working Field classes, just to not throw.
  let PsychicPowerModel;
  beforeAll(async () => {
    globalThis.foundry = {
      data: {},
      abstract: { TypeDataModel: class { static migrateData(source) { return source; } } },
    };
    ({ PsychicPowerModel } = await import("../scripts/data/item/psychic-power-model.mjs"));
  });

  it("coerces the two numeric values in the shipped corpus to strings", () => {
    expect(PsychicPowerModel.migrateData({ blastRadius: 0 }).blastRadius).toBe("0");
    expect(PsychicPowerModel.migrateData({ blastRadius: 2 }).blastRadius).toBe("2");
  });

  it("leaves a PR-bearing string untouched — Holocaust, Enemies Beyond p. 56", () => {
    expect(PsychicPowerModel.migrateData({ blastRadius: "PR" }).blastRadius).toBe("PR");
  });

  it("leaves a record without the field alone", () => {
    expect(PsychicPowerModel.migrateData({ name: "x" }).blastRadius).toBeUndefined();
  });

  it("still migrates sustained, which shares this hook", () => {
    expect(PsychicPowerModel.migrateData({ sustained: true }).sustained).toBe("half");
  });
});

describe("maleficCorruptionGain — Enemies Beyond p. 54", () => {
  it("grants Corruption equal to the psy rating used, on a successful Malefic manifest", () => {
    expect(maleficCorruptionGain("malefic", true, 4)).toBe(4);
  });

  it("grants nothing when the manifest failed", () => {
    expect(maleficCorruptionGain("malefic", false, 4)).toBe(0);
  });

  it("grants nothing for any other discipline", () => {
    expect(maleficCorruptionGain("sanctic", true, 4)).toBe(0);
    expect(maleficCorruptionGain("biomancy", true, 4)).toBe(0);
    expect(maleficCorruptionGain("minor", true, 4)).toBe(0);
  });

  it("uses the effective psy rating it is given, pushed or fettered", () => {
    expect(maleficCorruptionGain("malefic", true, 7)).toBe(7);
    expect(maleficCorruptionGain("malefic", true, 1)).toBe(1);
  });

  it("never returns a negative or non-numeric gain", () => {
    expect(maleficCorruptionGain("malefic", true, 0)).toBe(0);
    expect(maleficCorruptionGain("malefic", true, undefined)).toBe(0);
  });
});
