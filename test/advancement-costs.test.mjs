import { describe, it, expect } from "vitest";
import { aptitudeMatches, characteristicCost, skillCost, talentCost, RANK_ORDER } from "../scripts/helpers/advancement-costs.mjs";

describe("aptitudeMatches", () => {
  it("counts how many advance aptitudes the character has (0/1/2)", () => {
    expect(aptitudeMatches(["Agility", "Defence"], ["Agility", "Defence", "Toughness"])).toBe(2);
    expect(aptitudeMatches(["Agility", "Defence"], ["Agility"])).toBe(1);
    expect(aptitudeMatches(["Agility", "Defence"], ["Strength"])).toBe(0);
  });
});
describe("characteristicCost", () => {
  it("prices the tier being bought by match count; null when maxed", () => {
    expect(characteristicCost(2, 0)).toBe(100);
    expect(characteristicCost(2, 4)).toBe(1250);
    expect(characteristicCost(0, 0)).toBe(500);
    expect(characteristicCost(2, 5)).toBeNull();
  });
});
describe("skillCost", () => {
  it("prices by current rank (untrained->known=level 0); null at veteran", () => {
    expect(skillCost(2, "untrained")).toBe(100);
    expect(skillCost(2, "known")).toBe(200);
    expect(skillCost(1, "trained")).toBe(600);
    expect(skillCost(2, "veteran")).toBeNull();
  });
});
describe("talentCost", () => {
  it("prices by tier and match count", () => {
    expect(talentCost(2, 1)).toBe(200);
    expect(talentCost(0, 3)).toBe(1200);
  });
});
