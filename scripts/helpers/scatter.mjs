// scripts/helpers/scatter.mjs — PURE. DH2e Blast scatter diagram (canvas coords: +y is DOWN).
const MAP = {
  1: { dx: -1, dy: -1 }, 2: { dx: 0, dy: -1 }, 3: { dx: 1, dy: -1 },
  4: { dx: -1, dy: 0 },                         5: { dx: 1, dy: 0 },
  6: { dx: -1, dy: 1 }, 7: { dx: -1, dy: 1 }, 8: { dx: 0, dy: 1 },
  9: { dx: 1, dy: 1 }, 10: { dx: 1, dy: 1 },
};
/** 1d10 scatter direction → unit grid offset {dx,dy}. */
export function scatterDirection(d10) { return MAP[d10] ?? { dx: 0, dy: 0 }; }

/** Scatter offset in PIXELS: a `distance`-square scatter in direction `d10` on a `gridSize`-pixel grid.
 *  Canvas coords, so +y is down — the direction map already accounts for that. */
export function scatterOffset(d10, distance, gridSize) {
  const { dx, dy } = scatterDirection(d10);
  const squares = Number(distance) || 0;
  const size = Number(gridSize) || 0;
  return { dx: dx * squares * size + 0, dy: dy * squares * size + 0 };
}
