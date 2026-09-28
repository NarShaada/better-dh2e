import { describe, it, expect } from "vitest";
import { scatterDirection, scatterOffset } from "../scripts/helpers/scatter.mjs";

describe("scatterDirection (1d10 → unit offset, canvas coords: +y = down)", () => {
  it("maps the scatter diagram", () => {
    expect(scatterDirection(1)).toEqual({ dx: -1, dy: -1 }); // top-left
    expect(scatterDirection(2)).toEqual({ dx: 0, dy: -1 });  // top
    expect(scatterDirection(3)).toEqual({ dx: 1, dy: -1 });  // top-right
    expect(scatterDirection(4)).toEqual({ dx: -1, dy: 0 });  // left
    expect(scatterDirection(5)).toEqual({ dx: 1, dy: 0 });   // right
    expect(scatterDirection(6)).toEqual({ dx: -1, dy: 1 });  // bottom-left
    expect(scatterDirection(7)).toEqual({ dx: -1, dy: 1 });  // bottom-left
    expect(scatterDirection(8)).toEqual({ dx: 0, dy: 1 });   // bottom
    expect(scatterDirection(9)).toEqual({ dx: 1, dy: 1 });   // bottom-right
    expect(scatterDirection(10)).toEqual({ dx: 1, dy: 1 });  // bottom-right
  });
});

describe("scatterOffset (direction + distance + grid size → pixel offset)", () => {
  it("scales a diagonal direction by distance and grid size", () => {
    // direction 1 is {dx:-1, dy:-1}; 3 squares on a 100px grid
    expect(scatterOffset(1, 3, 100)).toEqual({ dx: -300, dy: -300 });
  });
  it("scales an orthogonal direction", () => {
    expect(scatterOffset(8, 2, 50)).toEqual({ dx: 0, dy: 100 });   // direction 8 is {dx:0, dy:1}
  });
  it("returns a zero offset for a zero distance", () => {
    expect(scatterOffset(5, 0, 100)).toEqual({ dx: 0, dy: 0 });
  });
  it("returns a zero offset for an out-of-range direction, matching scatterDirection", () => {
    expect(scatterOffset(99, 3, 100)).toEqual({ dx: 0, dy: 0 });
  });
  it("coerces missing or non-numeric arguments to 0 rather than producing NaN", () => {
    expect(scatterOffset(1, undefined, 100)).toEqual({ dx: 0, dy: 0 });
    expect(scatterOffset(1, 2, undefined)).toEqual({ dx: 0, dy: 0 });
    expect(scatterOffset(undefined, undefined, undefined)).toEqual({ dx: 0, dy: 0 });
  });
});
