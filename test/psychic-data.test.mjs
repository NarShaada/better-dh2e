import { describe, it, expect } from "vitest";
import { isPsychicAttack, PSYCHIC_ATTACK_TYPES } from "../scripts/helpers/psychic-data.mjs";
import { BDH } from "../scripts/config.mjs";

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
