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

/** Magnitude lost from one hit: 1 if effective damage ≥ 15, else 0. */
export function hordeMagnitudeLoss(eff) {
  return (eff ?? 0) >= 15 ? 1 : 0;
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
