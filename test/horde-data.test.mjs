import { describe, it, expect } from "vitest";
import { hordeSize, hordeMagnitudeLoss, hordeMagnitudeLossTotal, hordeExtraHits, hordeDamageBonusDice, hordeSprayHits } from "../scripts/helpers/horde-data.mjs";

describe("hordeSize", () => {
  it("starts at 6 below 30 magnitude", () => {
    expect(hordeSize(0)).toBe(6);
    expect(hordeSize(29)).toBe(6);
  });
  it("steps +1 per 30 magnitude", () => {
    expect(hordeSize(30)).toBe(7);
    expect(hordeSize(60)).toBe(8);
    expect(hordeSize(90)).toBe(9);
    expect(hordeSize(119)).toBe(9);
  });
  it("caps at 10", () => {
    expect(hordeSize(120)).toBe(10);
    expect(hordeSize(999)).toBe(10);
  });
  it("tolerates nullish magnitude", () => {
    expect(hordeSize(undefined)).toBe(6);
    expect(hordeSize(null)).toBe(6);
  });
});

describe("hordeMagnitudeLoss", () => {
  it("is 1 at exactly 15 and above, 0 below", () => {
    expect(hordeMagnitudeLoss(14)).toBe(0);
    expect(hordeMagnitudeLoss(15)).toBe(1);
    expect(hordeMagnitudeLoss(50)).toBe(1);
    expect(hordeMagnitudeLoss(undefined)).toBe(0);
  });
});

describe("hordeMagnitudeLossTotal", () => {
  it("counts one per hit dealing >=15, NOT one per 15 damage", () => {
    // Regression: a burst dealing 14 / 25 / 35 after mitigation loses 2 Magnitude (the 25 and the 35),
    // never 3 (which a per-15 reading of the 35 would give).
    expect(hordeMagnitudeLossTotal([14, 25, 35])).toBe(2);
    expect(hordeMagnitudeLossTotal([50])).toBe(1);
    expect(hordeMagnitudeLossTotal([14])).toBe(0);
  });
  it("adds Devastating X for every hit, on top of the 15+ rule", () => {
    // Devastating 2, two hits of 12 and 16 after mitigation:
    // 2 (Dev) + 2 (Dev) + 1 (the 16 is >=15) = 5.
    expect(hordeMagnitudeLossTotal([12, 16], 2)).toBe(5);
    // Devastating applies even to hits that don't reach 15.
    expect(hordeMagnitudeLossTotal([10, 10], 1)).toBe(2);
  });
  it("tolerates nullish / blank Devastating and empty hit lists", () => {
    expect(hordeMagnitudeLossTotal([20, 20], undefined)).toBe(2);
    expect(hordeMagnitudeLossTotal([], 3)).toBe(0);
    expect(hordeMagnitudeLossTotal(null, 3)).toBe(0);
  });
});

describe("hordeExtraHits", () => {
  it("adds +1 for explosive damage type", () => {
    expect(hordeExtraHits("explosive", [])).toBe(1);
    expect(hordeExtraHits("impact", [])).toBe(0);
  });
  it("adds +1 for the powerField quality", () => {
    expect(hordeExtraHits("impact", [{ key: "powerField" }])).toBe(1);
  });
  it("stacks both", () => {
    expect(hordeExtraHits("explosive", [{ key: "powerField" }])).toBe(2);
  });
  it("tolerates nullish qualities", () => {
    expect(hordeExtraHits("impact", null)).toBe(0);
  });
});

describe("hordeDamageBonusDice", () => {
  it("is +1d10 per 10 magnitude, capped at 2", () => {
    expect(hordeDamageBonusDice(9)).toBe(0);
    expect(hordeDamageBonusDice(10)).toBe(1);
    expect(hordeDamageBonusDice(25)).toBe(2);
    expect(hordeDamageBonusDice(100)).toBe(2);
    expect(hordeDamageBonusDice(undefined)).toBe(0);
  });
});

describe("hordeSprayHits", () => {
  it("is ceil(range/4) + the rolled d5, floored at 1 base hit", () => {
    expect(hordeSprayHits(24, 3)).toBe(9);   // ceil(24/4)=6 + 3
    expect(hordeSprayHits(10, 1)).toBe(4);   // ceil(10/4)=3 + 1
    expect(hordeSprayHits(0, 2)).toBe(3);    // max(1,0)=1 + 2
    expect(hordeSprayHits(undefined, 0)).toBe(1);
  });
});
