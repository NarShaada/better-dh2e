// scripts/helpers/horde-data.mjs — Horde helpers (Black Crusade homerule). hordeSize is PURE;
// hordesEnabled reads the world setting only when called (import stays Foundry-free for tests).

/** Horde Size from Magnitude: starts at 6, +1 per 30 Magnitude, capped at 10. */
export function hordeSize(magnitude) {
  return Math.min(10, 6 + Math.floor((magnitude ?? 0) / 30));
}

/** Whether the Enable Hordes homerule is on. */
export function hordesEnabled() {
  return game.settings.get("better-dh2e", "enableHordes") === true;
}

/** Magnitude lost from one hit: 1 if ANY damage got through the horde's soak, else 0.
 *  One per hit, never scaled by how much the hit dealt — a 35-damage hit still costs exactly 1.
 *  There is deliberately no damage threshold: an earlier flat-15 reading made a flamer (1d10+4,
 *  max 14 raw) incapable of reducing Magnitude against any horde, even one with no armour and
 *  Toughness Bonus 0, which is the opposite of how flame weapons are meant to work on a mob. */
export function hordeMagnitudeLoss(eff) {
  return (eff ?? 0) > 0 ? 1 : 0;
}

/** Total Magnitude lost across an array of per-hit effective-damage values against a horde:
 *  X (Devastating) for every hit, plus 1 for each hit that dealt any damage after mitigation. */
export function hordeMagnitudeLossTotal(effs, devastatingX = 0) {
  const x = Number(devastatingX) || 0;
  return (Array.isArray(effs) ? effs : []).reduce((sum, e) => sum + x + hordeMagnitudeLoss(e), 0);
}

/** Additive extra hits vs a horde: +1 Explosive (damage type), +1 Power Field (quality). */
export function hordeExtraHits(damageType, qualities) {
  const powerField = Array.isArray(qualities) && qualities.some((q) => q.key === "powerField");
  return (damageType === "explosive" ? 1 : 0) + (powerField ? 1 : 0);
}

/** Horde-Equipped damage bonus dice: +1d10 per 10 Magnitude, capped at +2d10. */
export function hordeDamageBonusDice(magnitude) {
  return Math.min(2, Math.floor((magnitude ?? 0) / 10));
}

/** Spray hits vs a horde: ceil(range/4) (min 1) + the rolled 1d5 (passed in). */
export function hordeSprayHits(range, d5roll) {
  return Math.max(1, Math.ceil((range ?? 0) / 4)) + (d5roll ?? 0);
}
