// scripts/helpers/battlemap-data.mjs — battlemap helpers. rangeBand is PURE; battlemapEnabled reads the setting.

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

/** Whether the user has opted into battlemap integration. */
export function battlemapEnabled() {
  return game.settings.get("better-dh2e", "enableBattlemap");
}
