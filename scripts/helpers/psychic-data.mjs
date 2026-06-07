// scripts/helpers/psychic-data.mjs — PURE. Psychic power helpers.

/** Resolution types that route through the attack pipeline. */
export const PSYCHIC_ATTACK_TYPES = new Set(["bolt", "barrage", "storm", "blast"]);

/** Whether a power's resolution type is an attack (deals damage via the attack pipeline). */
export function isPsychicAttack(type) {
  return PSYCHIC_ATTACK_TYPES.has(type);
}
