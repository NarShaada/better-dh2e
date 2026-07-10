// scripts/helpers/derived.mjs
// PURE math — do NOT import anything from Foundry here. Keeps this unit-testable.
import { BDH } from "../config.mjs";

/** total = base + advance */
export function characteristicTotal(characteristic) {
  return (characteristic.base ?? 0) + (characteristic.advance ?? 0);
}

/** bonus = tens digit of total, plus any unnatural bonus */
export function characteristicBonus(characteristic) {
  const total = characteristicTotal(characteristic);
  return Math.floor(total / 10) + (characteristic.unnatural ?? 0);
}

/** Unnatural characteristics grant extra Degrees of Success on any SUCCESSFUL test that uses them:
 *  ceil(unnatural / 2), else 0. No effect on failures — DoF is never modified. */
export function unnaturalDoSBonus(unnatural) {
  const u = unnatural ?? 0;
  return u > 0 ? Math.ceil(u / 2) : 0;
}

/** The characteristic a test is governed by: a characteristic key maps to itself; a skill key maps to
 *  its governing characteristic; anything unrecognised → null. Used to find the .unnatural for a test. */
export function governingCharacteristic(key) {
  if (BDH.characteristics?.[key]) return key;
  return BDH.skills?.[key]?.characteristic ?? null;
}

/** skill total = governing characteristic total + flat rank bonus */
export function skillTotal(characteristicTotalValue, rank) {
  const bonus = BDH.skillRanks[rank] ?? BDH.skillRanks.untrained;
  // Floor at 1: a natural 01 always succeeds, so a skill target never drops below 1.
  return Math.max(1, characteristicTotalValue + bonus);
}

/** fatigue threshold = toughness bonus + willpower bonus */
export function fatigueMax(toughnessBonus, willpowerBonus) {
  return toughnessBonus + willpowerBonus;
}

/** To-hit modifier when attacking a target of this size (Table 4-6): (size-4)*10. */
export function sizeToHitModifier(size) { return ((size ?? 4) - 4) * 10; }

/** Modifier to this creature's own Stealth rolls (Table 4-6): -(size-4)*10. */
export function sizeStealthModifier(size) { return (4 - (size ?? 4)) * 10; }

/** movement rates from agility bonus and creature size (default size 4) */
export function movement(agilityBonus, size = 4) {
  const half = Math.max(1, agilityBonus + (size - 4));   // RAW: AgB used for movement can't drop below 1
  return { half, full: half * 2, charge: half * 3, run: half * 6 };
}
