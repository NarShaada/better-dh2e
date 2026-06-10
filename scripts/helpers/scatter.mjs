// scripts/helpers/scatter.mjs — PURE. DH2e Blast scatter diagram (canvas coords: +y is DOWN).
const MAP = {
  1: { dx: -1, dy: -1 }, 2: { dx: 0, dy: -1 }, 3: { dx: 1, dy: -1 },
  4: { dx: -1, dy: 0 },                         5: { dx: 1, dy: 0 },
  6: { dx: -1, dy: 1 }, 7: { dx: -1, dy: 1 }, 8: { dx: 0, dy: 1 },
  9: { dx: 1, dy: 1 }, 10: { dx: 1, dy: 1 },
};
/** 1d10 scatter direction → unit grid offset {dx,dy}. */
export function scatterDirection(d10) { return MAP[d10] ?? { dx: 0, dy: 0 }; }
