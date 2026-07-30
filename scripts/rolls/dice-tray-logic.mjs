// scripts/rolls/dice-tray-logic.mjs
// Pure helpers for the chat dice tray. No Foundry globals, so this stays unit-testable —
// same shape as test-logic.mjs and attack-math.mjs.

/** Largest absolute modifier the tray accepts, so a fat-fingered field cannot build an absurd formula. */
export const MODIFIER_LIMIT = 999;

/**
 * Parse the modifier field's raw value into an integer.
 * Anything unparseable yields 0 rather than throwing: this feeds a formula on every die click,
 * and a half-typed "+" must not break the button.
 * @param {string} raw
 * @returns {number} integer clamped to [-MODIFIER_LIMIT, MODIFIER_LIMIT]
 */
export function parseModifier(raw) {
  const match = /^\s*([+-]?)\s*(\d+)\s*$/.exec(String(raw ?? ""));
  if (!match) return 0;
  const magnitude = Number(match[2]);
  const signed = match[1] === "-" ? -magnitude : magnitude;
  return Math.max(-MODIFIER_LIMIT, Math.min(MODIFIER_LIMIT, signed));
}

/**
 * Build a roll formula for the tray.
 * @param {number} faces     100, 10 or 5
 * @param {number} count     how many dice; anything below 1 (or not a number) becomes 1
 * @param {number} modifier  integer; omitted from the formula entirely when 0
 * @returns {string} e.g. "1d100", "2d10+3", "1d5-2"
 */
export function trayFormula(faces, count, modifier) {
  const dice = Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
  const mod = Number.isFinite(modifier) ? Math.trunc(modifier) : 0;
  const base = `${dice}d${faces}`;
  if (mod === 0) return base;
  return `${base}${mod > 0 ? "+" : "-"}${Math.abs(mod)}`;
}
