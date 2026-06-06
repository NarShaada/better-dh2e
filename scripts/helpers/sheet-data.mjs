// scripts/helpers/sheet-data.mjs
// PURE view-model builders — import only ../config.mjs, nothing from Foundry.
import { BDH } from "../config.mjs";

const TIER_BY_RANK = { untrained: 0, known: 1, trained: 2, experienced: 3, veteran: 4 };

/** Ordered characteristic view-models for the Stats row. */
export function buildCharacteristics(characteristics) {
  return Object.keys(BDH.characteristics).map((key) => {
    const c = characteristics[key] ?? {};
    return {
      key,
      short: BDH.characteristics[key].short,
      label: BDH.characteristics[key].label,
      value: c.total ?? 0,
      bonus: c.bonus ?? 0,
      base: c.base ?? 0,
      unnatural: c.unnatural ?? 0,
      impaired: c.impaired ?? false,
      isInfluence: key === "influence"
    };
  });
}

/** Skill view-models, sorted by label, with a 0..4 tier, a 4-dot array, and a trained flag.
 *  Specialist skills emit { specialist:true, specialties:[...] }.
 *  Standard skills emit { specialist:false, rank, tier, dots, trained, total, favourite }.
 */
export function buildSkills(skills) {
  return Object.keys(BDH.skills)
    .map((key) => {
      const cfg = BDH.skills[key];
      const s = skills[key] ?? {};
      if (cfg.specialist) {
        return {
          key,
          label: cfg.label,
          specialist: true,
          specialties: (s.specialties ?? []).map((sp, index) => {
            const rank = sp.rank ?? "known";
            const tier = TIER_BY_RANK[rank] ?? 0;
            return { index, name: sp.name ?? "", rank, tier, dots: [0, 1, 2, 3].map((i) => i < tier), total: sp.total ?? 0, favourite: sp.favourite ?? false };
          })
        };
      }
      const rank = s.rank ?? "untrained";
      const tier = TIER_BY_RANK[rank] ?? 0;
      return {
        key,
        label: cfg.label,
        specialist: false,
        rank,
        tier,
        dots: [0, 1, 2, 3].map((i) => i < tier),
        trained: rank !== "untrained",
        total: s.total ?? 0,
        favourite: s.favourite ?? false
      };
    })
    .sort((a, b) => (a.specialist === b.specialist ? a.label.localeCompare(b.label) : (a.specialist ? 1 : -1)));
}

/** Fatigue fill percentage (0..100). */
export function fatiguePercent(value, max) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
