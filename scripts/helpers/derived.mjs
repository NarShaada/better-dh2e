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

/** Movement base BEFORE size and stat-mods: (characteristic bonus | flat) × multiplier + modifier.
 *  Defaults (kind "characteristic", multiplier 1, modifier 0) return charBonus unchanged. Rounded so
 *  a fractional multiplier (e.g. 0.5, allowed by the sheet's step="0.5") can't leak fractional metres
 *  into the half/full/charge/run bands. */
export function movementBaseValue(cfg, charBonus) {
  const c = cfg ?? {};
  const raw = c.kind === "flat" ? (Number(c.flat) || 0) : (Number(charBonus) || 0);
  const mult = c.multiplier === undefined || c.multiplier === null ? 1 : Number(c.multiplier);
  return Math.round(raw * (Number.isFinite(mult) ? mult : 1) + (Number(c.modifier) || 0));
}

/** Initiative's numeric part BEFORE stat-mods: (characteristic bonus | flat) + modifier. */
export function initiativeBase(cfg, charBonus) {
  const c = cfg ?? {};
  const raw = c.baseKind === "flat" ? (Number(c.flat) || 0) : (Number(charBonus) || 0);
  return raw + (Number(c.modifier) || 0);
}

/** A dice term: blank (no dice) or NdM. Deliberately a shape check, not a Foundry roll parse,
 *  so this helper stays pure and synchronous. */
const DICE_RE = /^\s*\d+\s*d\s*\d+\s*$/i;

/** The sanitized dice term: "" when deliberately blank, the trimmed expression when valid, and
 *  "1d10" (with a warning) when malformed. Initiative fires automatically for every combatant at the
 *  start of a fight, so a typo on one sheet must not break rolling for the whole table.
 *  `warn` defaults to true for the roll path; pass `{ warn: false }` for a display-only read (e.g. a
 *  sheet's _prepareContext, which re-runs on every render and would otherwise spam console.warn on
 *  each keystroke against a stored invalid value). */
export function initiativeDice(dice, { warn = true } = {}) {
  const raw = dice === undefined || dice === null ? "1d10" : String(dice);
  if (raw.trim() === "") return "";                             // deliberately no dice
  if (DICE_RE.test(raw)) return raw.trim();
  if (warn) console.warn(`better-dh2e | invalid initiative dice "${raw}" — falling back to 1d10.`);
  return "1d10";
}

/** Assemble a per-actor initiative formula from the sanitized dice term. */
export function initiativeFormula(dice, bonusRef = "@initiativeBonus") {
  const term = initiativeDice(dice);
  return term ? `${term} + ${bonusRef}` : bonusRef;
}
