// scripts/helpers/craftsmanship-data.mjs — PURE. Craftsmanship combat effects.

const has = (qualities, key) => Array.isArray(qualities) && qualities.some((q) => q.key === key);

/** Effective ranged jam floor from quality + craftsmanship (Infinity = never jams; 0 = jams on every failed roll).
 *  Base floor is fire-mode dependent (RAW): single shots jam on 96+, semi-/full-auto bursts on 94+.
 *  Unreliable jams on 91+ regardless of mode; Reliable only on 100. */
export function effectiveJamFloor(qualities, craftsmanship, { auto = false } = {}) {
  if (craftsmanship === "best") return Infinity;
  const base = auto ? 94 : 96;
  const r = has(qualities, "reliable");
  const u = has(qualities, "unreliable");
  if (craftsmanship === "good") return u ? base : 100;            // U cancels to neither; N/R -> reliable
  if (craftsmanship === "poor") return u ? 0 : (r ? base : 91);   // U -> jam every fail; R cancels to neither; N -> unreliable
  return r ? 100 : (u ? 91 : base);                               // normal
}

/** Melee craftsmanship to-hit modifier. */
export function meleeCraftToHit(craftsmanship) {
  return { poor: -10, good: 5, best: 10 }[craftsmanship] ?? 0;
}

/** Melee craftsmanship flat damage bonus (Best only). */
export function meleeCraftDamageBonus(craftsmanship) {
  return craftsmanship === "best" ? 1 : 0;
}

/** Coerce a possibly-legacy craftsmanship value to a valid tier. Classic Dark Heresy stored
 *  "common" for what this system calls "normal"; blanks and anything unrecognised also fall back
 *  to "normal" so migrated/legacy items self-heal instead of failing the choices-constrained
 *  schema field (which would throw on load and cascade into a broken combat tracker).
 *  Mirrors craft() in tools/migrate-world.mjs. */
export function normalizeCraftsmanship(value) {
  const v = String(value ?? "").toLowerCase();
  return (v === "poor" || v === "good" || v === "best") ? v : "normal";
}
