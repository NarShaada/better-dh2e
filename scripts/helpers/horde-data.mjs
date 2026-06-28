// scripts/helpers/horde-data.mjs — Horde helpers (Black Crusade homerule). hordeSize is PURE;
// hordesEnabled reads the world setting only when called (import stays Foundry-free for tests).

/** Horde Size from Magnitude: starts at 6, +1 per 30 Magnitude, capped at 10. */
export function hordeSize(magnitude) {
  return Math.min(10, 6 + Math.floor((magnitude ?? 0) / 30));
}

/** Whether the Enable Hordes homerule is on. */
export function hordesEnabled() {
  return game.settings.get("better-dh2e", "enableHordes") === true;
}
