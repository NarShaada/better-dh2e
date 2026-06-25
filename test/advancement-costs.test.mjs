import { describe, it, expect } from "vitest";
import { aptitudeMatches, characteristicCost, skillCost, talentCost, psyRatingCost, RANK_ORDER, purchasedOnAcquire } from "../scripts/helpers/advancement-costs.mjs";

describe("purchasedOnAcquire", () => {
  it("talents/psychic powers are purchased only when acquired in Custom mode", () => {
    expect(purchasedOnAcquire("talent", "custom")).toBe(true);
    expect(purchasedOnAcquire("psychicPower", "custom")).toBe(true);
    expect(purchasedOnAcquire("talent", "simple")).toBe(false);
    expect(purchasedOnAcquire("psychicPower", "simple")).toBe(false);
    expect(purchasedOnAcquire("talent", "none")).toBe(false);
    expect(purchasedOnAcquire("psychicPower", "none")).toBe(false);
  });
  it("returns null for types that carry no purchased flag", () => {
    expect(purchasedOnAcquire("weapon", "custom")).toBe(null);
    expect(purchasedOnAcquire("gear", "simple")).toBe(null);
    expect(purchasedOnAcquire("trait", "custom")).toBe(null);
  });
});

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
describe("psyRatingCost", () => {
  it("is 200 × the new level", () => {
    expect(psyRatingCost(1)).toBe(200);
    expect(psyRatingCost(2)).toBe(400);
    expect(psyRatingCost(3)).toBe(600);
    expect(psyRatingCost(5)).toBe(1000);
  });
});
