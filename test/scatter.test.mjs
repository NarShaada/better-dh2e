import { describe, it, expect } from "vitest";
import { scatterDirection } from "../scripts/helpers/scatter.mjs";

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
