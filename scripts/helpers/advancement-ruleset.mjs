// scripts/helpers/advancement-ruleset.mjs — resolves the Advancement Rules / Sheet Header Style settings.
// makeRuleset is PURE (config import only) and unit-tested; the wrappers below read game.settings.
// This module is the ONLY place the dh2/bc branch lives — buy actions and sheet context consume
// the returned ruleset object and stay ruleset-agnostic.
import { BDH } from "../config.mjs";
import {
  aptitudeMatches, characteristicCost, skillCost, talentCost, psyRatingCost,
  alignmentMatches, characteristicCostBC, skillCostBC, talentCostBC, psyRatingCostBC,
} from "./advancement-costs.mjs";

/** Build the ruleset object for "dh2" or "bc". sys = actor.system; itemSys = a talent item's system. */
export function makeRuleset(key) {
  if (key === "bc") {
    return {
      key: "bc",
      charTiers: BDH.xpCostsBC.characteristic[2].length,   // 4
      noAdvanceChars: [],                                   // Influence (= BC Infamy) is advanceable
      charMatches: (sys, k) => alignmentMatches(sys.alignment, BDH.characteristics[k].alignment),
      skillMatches: (sys, k) => alignmentMatches(sys.alignment, BDH.skills[k].alignment),
      talentMatches: (sys, itemSys) => alignmentMatches(sys.alignment, itemSys.alignment ?? "unaligned"),
      characteristicCost: characteristicCostBC,
      skillCost: skillCostBC,
      talentCost: talentCostBC,
      psyRatingCost: () => psyRatingCostBC(),               // flat 750, level-independent
      talentValid: (itemSys) => itemSys.tier >= 1,
      talentInvalidWarning: "Set a tier on the talent before buying.",
      talentWarnShort: "set tier",
      godOfChar: (k) => BDH.characteristics[k].alignment,
      godOfSkill: (k) => BDH.skills[k].alignment,
      godOfTalent: (itemSys) => itemSys.alignment ?? "unaligned",
      psyRatingGod: "unaligned",
    };
  }
  return {
    key: "dh2",
    charTiers: BDH.xpCosts.characteristic[2].length,        // 5
    noAdvanceChars: ["influence"],
    charMatches: (sys, k) => aptitudeMatches(BDH.characteristics[k].aptitudes, sys.aptitudes ?? []),
    skillMatches: (sys, k) => aptitudeMatches(BDH.skills[k].aptitudes, sys.aptitudes ?? []),
    talentMatches: (sys, itemSys) => aptitudeMatches(itemSys.aptitudes ?? [], sys.aptitudes ?? []),
    characteristicCost,
    skillCost,
    talentCost,
    psyRatingCost: (newLevel) => psyRatingCost(newLevel),
    talentValid: (itemSys) => (itemSys.aptitudes?.length === 2) && itemSys.tier >= 1,
    talentInvalidWarning: "Set a tier and exactly two aptitudes on the talent before buying.",
    talentWarnShort: "set tier + 2 aptitudes",
    godOfChar: () => "",
    godOfSkill: () => "",
    godOfTalent: () => "",
    psyRatingGod: "",
  };
}

/** True when the world runs Black Crusade advancement. */
export function bcAdvancement() {
  return game.settings.get("better-dh2e", "advancementRules") === "bc";
}

/** True when the world uses the Black Crusade sheet header. */
export function bcHeader() {
  return game.settings.get("better-dh2e", "sheetHeaderStyle") === "bc";
}

/** The active advancement ruleset per the world setting. */
export function advancementRuleset() {
  return makeRuleset(bcAdvancement() ? "bc" : "dh2");
}
