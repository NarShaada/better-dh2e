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

/** movement rates from agility bonus and creature size (default size 4) */
export function movement(agilityBonus, size = 4) {
  const half = Math.max(0, agilityBonus + (size - 4));
  return { half, full: half * 2, charge: half * 3, run: half * 6 };
}
