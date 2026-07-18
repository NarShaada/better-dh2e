import { describe, it, expect } from "vitest";
import { makeRuleset } from "../scripts/helpers/advancement-ruleset.mjs";

describe("makeRuleset('bc')", () => {
  const rs = makeRuleset("bc");
  const khorneChar = { alignment: "khorne", aptitudes: [] };
  it("matches by the alignment chart", () => {
    expect(rs.charMatches(khorneChar, "strength")).toBe(2);   // Khorne char for a Khorne character — True
    expect(rs.charMatches(khorneChar, "toughness")).toBe(1);  // Nurgle — Allied
    expect(rs.charMatches(khorneChar, "willpower")).toBe(0);  // Tzeentch — Opposed
    expect(rs.charMatches(khorneChar, "influence")).toBe(1);  // Unaligned — Allied
    expect(rs.skillMatches(khorneChar, "athletics")).toBe(2);
    expect(rs.skillMatches(khorneChar, "medicae")).toBe(1);
    expect(rs.talentMatches(khorneChar, { alignment: "slaanesh" })).toBe(0);
    expect(rs.talentMatches(khorneChar, {})).toBe(1);         // missing alignment → unaligned → Allied
  });
  it("4 characteristic tiers; Influence advanceable; talent needs only a tier; PR flat 750", () => {
    expect(rs.charTiers).toBe(4);
    expect(rs.noAdvanceChars).toEqual([]);
    expect(rs.talentValid({ tier: 1 })).toBe(true);
    expect(rs.talentValid({ tier: 0 })).toBe(false);
    expect(rs.psyRatingCost(5)).toBe(750);
  });
  it("god stamps come from the chart / item / unaligned-for-PR", () => {
    expect(rs.godOfChar("fellowship")).toBe("slaanesh");
    expect(rs.godOfSkill("survival")).toBe("nurgle");
    expect(rs.godOfTalent({ alignment: "tzeentch" })).toBe("tzeentch");
    expect(rs.psyRatingGod).toBe("unaligned");
  });
});

describe("makeRuleset('dh2')", () => {
  const rs = makeRuleset("dh2");
  const sys = { alignment: "unaligned", aptitudes: ["Strength", "Offence"] };
  it("matches by aptitudes; 5 tiers; Influence blocked; DH2 PR curve; empty god stamps", () => {
    expect(rs.charMatches(sys, "strength")).toBe(2);
    expect(rs.charTiers).toBe(5);
    expect(rs.noAdvanceChars).toEqual(["influence"]);
    expect(rs.talentValid({ tier: 1, aptitudes: ["Strength"] })).toBe(false);   // needs exactly 2
    expect(rs.talentValid({ tier: 1, aptitudes: ["Strength", "Offence"] })).toBe(true);
    expect(rs.psyRatingCost(3)).toBe(600);
    expect(rs.godOfChar("strength")).toBe("");
    expect(rs.godOfSkill("athletics")).toBe("");
    expect(rs.godOfTalent({ alignment: "khorne" })).toBe("");
    expect(rs.psyRatingGod).toBe("");
  });
});
