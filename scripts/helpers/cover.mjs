// scripts/helpers/cover.mjs — pure cover helpers (no Foundry, no DOM).

// Parse a cover-AP text input into a non-negative integer (junk / empty / negative → 0).
export function coverApFromInput(str) {
  const n = parseInt(String(str ?? "").replace(/[^-\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The grid cells immediately adjacent to a token footprint on one compass side.
 * Coordinates are grid cells (columns/rows), not pixels — the caller converts.
 * Reach is deliberately one cell: anything further back is the manual In Cover status's job.
 * @param {{x: number, y: number, width?: number, height?: number}} footprint
 * @param {"n"|"e"|"s"|"w"} side
 * @returns {Array<{x: number, y: number}>} empty for an unknown or missing side
 */
export function adjacentCellsOnSide(footprint, side) {
  const x = Math.round(footprint?.x ?? 0);
  const y = Math.round(footprint?.y ?? 0);
  const w = Math.max(1, Math.round(footprint?.width || 1));
  const h = Math.max(1, Math.round(footprint?.height || 1));
  const cells = [];
  if (side === "n") for (let i = 0; i < w; i++) cells.push({ x: x + i, y: y - 1 });
  else if (side === "s") for (let i = 0; i < w; i++) cells.push({ x: x + i, y: y + h });
  else if (side === "w") for (let j = 0; j < h; j++) cells.push({ x: x - 1, y: y + j });
  else if (side === "e") for (let j = 0; j < h; j++) cells.push({ x: x + w, y: y + j });
  return cells;
}

/**
 * Was this cover payload written by the phase-2 "protected spot" model?
 * Detected by the obsolete `sides` key, which obstacle-model pieces never carry — so the check is
 * self-healing: once a scene is cleared nothing matches, and no migration flag is needed.
 * @param {object|null} cover
 */
export function isLegacyCoverFlag(cover) {
  return !!cover && Object.hasOwn(cover, "sides");
}

/**
 * The per-hit cover sequence for one damage application.
 *
 * Two numbers, deliberately not conflated: the PIECE's AP is the real cover value and the only
 * thing that degrades or destroys, while the GM's CONFIRMED number is a per-attack modifier
 * (talents and the like). The confirmed number is held as an offset from the piece's AP so that an
 * override tracks the piece as it wears down instead of going stale.
 *
 * A hit degrades the piece when cover actually helped against it (`applied > 0`) and the round beat
 * the piece's current AP (strictly greater — pre-mitigation damage, before Toughness and armour).
 * Degradation lands AFTER the hit resolves, so the first hit always meets the undamaged piece.
 *
 * @param {{pieceAp: number, confirmedAp: number, hits?: Array<number>}} o
 *   `hits` is pre-mitigation damage totals in resolution order.
 * @returns {{applied: number[], finalAp: number, destroyed: boolean, degraded: number}}
 *   `applied[i]` is the cover AP hit i soaks. `destroyed` means this application took it to 0.
 */
export function coverDegradationPlan({ pieceAp, confirmedAp, hits } = {}) {
  const start = Math.max(0, Math.floor(Number(pieceAp) || 0));
  const confirmed = Math.max(0, Math.floor(Number(confirmedAp) || 0));
  const offset = confirmed - start;
  let ap = start;
  let degraded = 0;
  const applied = [];
  for (const raw of hits ?? []) {
    const a = Math.max(0, ap + offset);
    applied.push(a);
    // `ap > 0` is what keeps an AP-0 piece from going negative when the offset is positive.
    if (a > 0 && ap > 0 && (Number(raw) || 0) > ap) {
      ap -= 1;
      degraded += 1;
    }
  }
  return { applied, finalAp: ap, destroyed: degraded > 0 && ap === 0, degraded };
}
