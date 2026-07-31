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
