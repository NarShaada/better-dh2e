// scripts/helpers/vehicle-data.mjs — PURE vehicle combat helpers (hit-location table, integrity apply).

/** Vehicle hit-location table (roll-under d100, same reversed-first-hit convention as acolytes):
 *  01–20 Motive Systems, 21–60 Hull, 61–80 Weapon, 81–100 Turret. */
export function vehicleHitLocation(d100) {
  const r = d100 ?? 0;
  if (r <= 20) return "motive";
  if (r <= 60) return "hull";
  if (r <= 80) return "weapon";
  return "turret";
}

/** Display labels for the vehicle hit locations. */
export const VEHICLE_LOCATION_LABELS = {
  motive: "Motive Systems",
  hull: "Hull",
  weapon: "Weapon",
  turret: "Turret",
};

/** Integrity after a hit: accumulates like wounds (capped at max); no critical track (Conditions are manual). */
export function applyIntegrity(value, max, effective) {
  return Math.min(max ?? 0, (value ?? 0) + Math.max(0, effective ?? 0));
}
