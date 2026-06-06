// scripts/helpers/quality-modules.mjs — PURE. Weapon-quality effect modules (registry of keyed behaviours).

const has = (qualities, key) => Array.isArray(qualities) && qualities.some((q) => q.key === key);

/** Tearing: add one die to the first dice term and keep the highest (drop the lowest). */
export function tearingFormula(formula) {
  return formula.replace(/(\d+)d(\d+)/, (m, n, faces) => `${Number(n) + 1}d${faces}kh${n}`);
}

/** To-hit modifier from qualities (Accurate: +10 when aiming). */
export function qualityToHitMod(qualities, { aiming }) {
  return aiming && has(qualities, "accurate") ? 10 : 0;
}

/** Jam floor (Reliable 100, Unreliable 91, else the base floor). */
export function qualityJamFloor(qualities, base = 94) {
  if (has(qualities, "reliable")) return 100;
  if (has(qualities, "unreliable")) return 91;
  return base;
}

/** Accurate bonus damage dice (+1d10 per 2 DoS, capped +2d10; ranged & aiming only). Formula string or null. */
export function accurateBonusDice(qualities, { isRanged, aiming, dos }) {
  if (!isRanged || !aiming || !has(qualities, "accurate")) return null;
  const n = Math.min(2, Math.floor(dos / 2));
  return n > 0 ? `${n}d10` : null;
}

/** Weapon damage formula with Tearing applied if present (weapon dice only). */
export function weaponDamageFormula(qualities, baseFormula) {
  return has(qualities, "tearing") ? tearingFormula(baseFormula) : baseFormula;
}

/** Best parry modifier across the defender's equipped melee weapons (Balanced +10 / Unbalanced -10). */
export function parryModifier(meleeWeaponQualityLists) {
  const mods = meleeWeaponQualityLists.map((qs) => (has(qs, "balanced") ? 10 : 0) + (has(qs, "unbalanced") ? -10 : 0));
  return mods.length ? Math.max(...mods) : 0;
}

/** Whether a weapon has Shocking. */
export function hasShocking(qualities) {
  return has(qualities, "shocking");
}
