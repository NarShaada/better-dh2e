import { describe, it, expect } from "vitest";
import { isPsychicAttack, PSYCHIC_ATTACK_TYPES } from "../scripts/helpers/psychic-data.mjs";

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
