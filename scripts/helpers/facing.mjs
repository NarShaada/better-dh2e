// scripts/helpers/facing.mjs — pure approach/facing geometry shared by cover (absolute compass side)
// and the future vehicle framework (run in the vehicle's local frame). Screen-space deltas: +y is down,
// so "north"/up is a negative dy.

/**
 * The single grid face an attacker at delta (dx,dy) from the target crosses, per the rulebook armour-facing
 * table: compare |dy| vs |dx|; vertical wins ties, so the N/S (Front/Rear) zones are the larger ones.
 * @param {number} dx attacker.x − target.x  (scene pixels; equivalently columns on a square grid)
 * @param {number} dy attacker.y − target.y  (scene pixels; +y is down)
 * @returns {"n"|"e"|"s"|"w"|null} null when dx and dy are both 0 (same cell → no direction)
 */
export function facingFromDelta(dx, dy) {
  if (!dx && !dy) return null;
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "n" : "s";
  return dx > 0 ? "e" : "w";
}
