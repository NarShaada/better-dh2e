// scripts/helpers/quality-modules.mjs — PURE. Weapon-quality effect modules (registry of keyed behaviours).
import { meleeCraftToHit } from "./craftsmanship-data.mjs";

const has = (qualities, key) => Array.isArray(qualities) && qualities.some((q) => q.key === key);

/** Tearing: add one die to the first dice term and keep the highest (drop the lowest). */
export function tearingFormula(formula) {
  return formula.replace(/(\d+)d(\d+)/, (m, n, faces) => `${Number(n) + 1}d${faces}kh${n}`);
}

/** To-hit modifier from qualities (Accurate: +10 when aiming; Defensive: -10 always). */
export function qualityToHitMod(qualities, { aiming }) {
  let mod = 0;
  if (aiming && has(qualities, "accurate")) mod += 10;
  if (has(qualities, "defensive")) mod -= 10;
  return mod;
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

/** Best parry modifier across the defender's equipped melee weapons.
 *  Each weapon `{qualities, craftsmanship}` contributes the SUM of its own parry qualities
 *  (Balanced +10 / Defensive +15 / Unbalanced -10) plus its melee craftsmanship WS bonus
 *  (Poor -10 / Good +5 / Best +10 — craftsmanship applies to all WS tests, parry included);
 *  the best single weapon wins (no stacking across weapons). */
export function parryModifier(meleeWeapons) {
  const mods = meleeWeapons.map((w) =>
    (has(w.qualities, "balanced") ? 10 : 0) + (has(w.qualities, "unbalanced") ? -10 : 0)
    + (has(w.qualities, "defensive") ? 15 : 0) + meleeCraftToHit(w.craftsmanship)
  );
  return mods.length ? Math.max(...mods) : 0;
}

/** Whether a weapon has Shocking. */
export function hasShocking(qualities) {
  return has(qualities, "shocking");
}

/** The numeric value of a weapon quality by key (0 if absent or blank). */
function qualityValue(qualities, key) {
  const q = Array.isArray(qualities) ? qualities.find((x) => x.key === key) : null;
  return q ? (Number(q.value) || 0) : 0;
}
export function concussiveValue(qualities) { return qualityValue(qualities, "concussive"); }
export function fellingValue(qualities) { return qualityValue(qualities, "felling"); }
export function hallucinogenicValue(qualities) { return qualityValue(qualities, "hallucinogenic"); }
export function primitiveValue(qualities) { return qualityValue(qualities, "primitive"); }
export function provenValue(qualities) { return qualityValue(qualities, "proven"); }

/** Primitive caps a damage die at X; Proven floors it at X (exclusive; Primitive wins if both somehow set). */
export function transformDamageDie(result, { primitiveX = 0, provenX = 0 } = {}) {
  if (primitiveX > 0) return Math.min(result, primitiveX);
  if (provenX > 0) return Math.max(result, provenX);
  return result;
}

/** Felling: ignore X points of the target's UNNATURAL Toughness (natural bonus untouched). */
export function felledToughnessBonus(toughnessBonus, unnatural, fellingX) {
  return toughnessBonus - Math.min(unnatural ?? 0, fellingX);
}

export function hasFlame(qualities) { return has(qualities, "flame"); }
export function hasFlexible(qualities) { return has(qualities, "flexible"); }
export function hasGraviton(qualities) { return has(qualities, "graviton"); }

export function hasInaccurate(qualities) { return has(qualities, "inaccurate"); }
export function hasOverheats(qualities) { return has(qualities, "overheats"); }
export function hasMaximal(qualities) { return has(qualities, "maximal"); }

/** Penetration after Lance (×DoS on a hit), Razor Sharp (×2 at 3+ DoS on a hit), and Melta (×2 at Point-Blank/Short range). */
export function effectivePenetration(basePen, { qualities, dos, success, closeRange }) {
  let pen = basePen;
  if (success && has(qualities, "lance")) pen *= dos;
  if (success && has(qualities, "razorSharp") && dos >= 3) pen *= 2;
  if (closeRange && has(qualities, "melta")) pen *= 2;
  return pen;
}
