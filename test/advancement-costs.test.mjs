import { describe, it, expect } from "vitest";
import { aptitudeMatches, characteristicCost, skillCost, talentCost, psyRatingCost, RANK_ORDER, purchasedOnAcquire, alignmentMatches, characteristicCostBC, skillCostBC, talentCostBC, psyRatingCostBC } from "../scripts/helpers/advancement-costs.mjs";

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

describe("alignmentMatches", () => {
  it("True (2): same god", () => {
    for (const g of ["khorne", "nurgle", "slaanesh", "tzeentch"]) expect(alignmentMatches(g, g)).toBe(2);
  });
  it("Allied (1): Khorne↔Nurgle and Tzeentch↔Slaanesh", () => {
    expect(alignmentMatches("khorne", "nurgle")).toBe(1);
    expect(alignmentMatches("nurgle", "khorne")).toBe(1);
    expect(alignmentMatches("tzeentch", "slaanesh")).toBe(1);
    expect(alignmentMatches("slaanesh", "tzeentch")).toBe(1);
  });
  it("Allied (1): unaligned on either side, including unaligned-on-unaligned", () => {
    expect(alignmentMatches("unaligned", "khorne")).toBe(1);
    expect(alignmentMatches("tzeentch", "unaligned")).toBe(1);
    expect(alignmentMatches("unaligned", "unaligned")).toBe(1);
  });
  it("Opposed (0): the remaining god pairs", () => {
    expect(alignmentMatches("khorne", "tzeentch")).toBe(0);
    expect(alignmentMatches("khorne", "slaanesh")).toBe(0);
    expect(alignmentMatches("nurgle", "tzeentch")).toBe(0);
    expect(alignmentMatches("nurgle", "slaanesh")).toBe(0);
  });
});

describe("BC cost tables", () => {
  it("characteristic: 4 tiers; Opposed Expert = 2500; null past the 4th", () => {
    expect(characteristicCostBC(2, 0)).toBe(100);
    expect(characteristicCostBC(1, 3)).toBe(1000);
    expect(characteristicCostBC(0, 3)).toBe(2500);
    expect(characteristicCostBC(2, 4)).toBeNull();     // a 5th advance (DH2-era) shows "max" under BC
  });
  it("skill: prices the NEXT rank from the current one; null at veteran", () => {
    expect(skillCostBC(2, "untrained")).toBe(100);     // buying Known, True
    expect(skillCostBC(1, "known")).toBe(350);         // buying Trained, Allied
    expect(skillCostBC(2, "trained")).toBe(400);       // buying Experienced, True
    expect(skillCostBC(0, "experienced")).toBe(1000);  // buying Veteran, Opposed
    expect(skillCostBC(2, "veteran")).toBeNull();
  });
  it("talent by tier", () => {
    expect(talentCostBC(2, 1)).toBe(200);
    expect(talentCostBC(1, 2)).toBe(500);
    expect(talentCostBC(0, 3)).toBe(1000);
    expect(talentCostBC(1, 0)).toBeNull();
  });
  it("psy rating: flat 750 (tier-3 Unaligned talent = Allied for everyone)", () => {
    expect(psyRatingCostBC()).toBe(750);
  });
});
