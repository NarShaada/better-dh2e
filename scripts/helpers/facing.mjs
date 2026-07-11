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

/** Snap a heading in degrees to the nearest 45° step, normalised to [0, 360). */
export function snapFacing(deg) {
  return (((Math.round((deg ?? 0) / 45) * 45) % 360) + 360) % 360;
}

/** Turn a heading by `delta` degrees, snapped to 45° and normalised (vehicles turn in 45° steps). */
export function turnFacing(deg, delta) {
  return snapFacing((deg ?? 0) + (delta ?? 0));
}

/** Screen-space unit vector for a heading (deg clockwise from north/up; +y is down).
 *  0→up (0,−1), 90→right (1,0), 180→down (0,1), 270→left (−1,0). */
export function facingVector(deg) {
  const r = ((deg ?? 0) * Math.PI) / 180;
  return { x: Math.sin(r), y: -Math.cos(r) };
}

/** Which armour facing an attacker at world delta (dx,dy) from a vehicle strikes, given the vehicle's
 *  facing (deg clockwise from north). The delta is rotated into the vehicle's LOCAL frame (front = local
 *  north), then classified with facingFromDelta — so orthogonal facings give the cover-style zones and
 *  45° facings give the diagonal quadrants. Returns "front"|"left"|"right"|"rear" (null if dx=dy=0). */
export function armourSideFromAttack(dx, dy, facingDeg) {
  const r = ((facingDeg ?? 0) * Math.PI) / 180;
  const lx = dx * Math.cos(r) + dy * Math.sin(r);
  const ly = -dx * Math.sin(r) + dy * Math.cos(r);
  return { n: "front", e: "right", s: "rear", w: "left" }[facingFromDelta(lx, ly)] ?? null;
}
