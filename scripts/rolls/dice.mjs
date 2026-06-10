// scripts/rolls/dice.mjs — guard for evaluating free-text dice formulas.
// Weapon/power damage + penetration and the typed damage-modifier are free strings, so a malformed
// value ("1d10+", "2d", "abc") would otherwise throw an unhandled rejection inside a click handler.

/**
 * Evaluate a Roll, returning the evaluated Roll — or null (with a user-facing error) if the formula
 * is malformed. Callers should bail (or fall back) when null is returned.
 * @param {string} formula
 * @param {string} [label]  what the formula is, for the error message
 * @returns {Promise<Roll|null>}
 */
export async function safeRoll(formula, label = "formula") {
  try {
    return await new Roll(String(formula)).evaluate();
  } catch (err) {
    ui.notifications?.error?.(`Better DH2e: invalid ${label} — "${formula}". Check the item's formula.`);
    console.warn("Better DH2e | invalid roll formula:", formula, err);
    return null;
  }
}
