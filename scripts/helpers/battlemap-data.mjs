// scripts/helpers/battlemap-data.mjs — battlemap helpers. All PURE except battlemapEnabled, which reads the setting.

/** DH2e range band for a measured distance (m) vs the weapon's range (m). Point-Blank (≤2m) takes priority. */
export function rangeBand(distance, weaponRange) {
  const r = weaponRange;
  if (distance <= 2) return "pointBlank";
  if (distance <= r / 2) return "short";
  if (distance <= r) return "normal";
  if (distance <= 2 * r) return "long";
  return "extreme";   // ≤3× and beyond → Extreme (out of normal range; GM adjudicates if it can fire)
}

/** Classify a moved distance (m) against the actor's move rates {half, full, charge, run}. */
export function classifyMovement(distance, rates) {
  if (distance <= (rates?.half ?? 0)) return "half";
  if (distance <= rates.full) return "full";
  if (distance <= rates.charge) return "charge";
  if (distance <= rates.run) return "run";
  return "tooFar";
}

/** Metres a token has covered THIS TURN, including the leg it has just moved, read from Foundry's
 *  movement record (`TokenDocument#movement`; the `moveToken` hook's second argument).
 *
 *  The record keeps the turn in separate parts: `history` is what was recorded BEFORE this movement
 *  (core clears it when the combatant's turn starts) and `passed` is the leg this update has just
 *  covered. `history.distance` on its own is therefore always one move behind — a single 18 m drag
 *  reads 0 — so the two are summed. (`pending` is deliberately left out: those legs have not been
 *  moved yet, and each fires its own hook when it is.)
 *
 *  Returns null when the record says nothing usable about this turn:
 *   - the movement is not being recorded — core records only for a token whose combatant is in a
 *     STARTED combat, so outside one there is no "this turn" to total;
 *   - an undo (also unrecorded) — its history still contains the leg being taken back.
 *  `inStartedCombat` is only consulted if the record carries no `recorded` flag at all, and applies
 *  the same rule core uses to set that flag. */
export function movedThisTurn(movement, { inStartedCombat = false } = {}) {
  if (!movement) return null;
  if (!(movement.recorded ?? inStartedCombat)) return null;
  return (Number(movement.history?.distance) || 0) + (Number(movement.passed?.distance) || 0);
}

/** Whether the user has opted into battlemap integration. */
export function battlemapEnabled() {
  return game.settings.get("better-dh2e", "enableBattlemap");
}
