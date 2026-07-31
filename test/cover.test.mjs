import { describe, it, expect } from "vitest";
import { coverApFromInput, adjacentCellsOnSide } from "../scripts/helpers/cover.mjs";

describe("coverApFromInput", () => {
  it("parses a plain number", () => {
    expect(coverApFromInput("4")).toBe(4);
  });
  it("strips a leading + and trailing junk", () => {
    expect(coverApFromInput("+4")).toBe(4);
    expect(coverApFromInput("4 AP")).toBe(4);
  });
  it("treats empty / non-numeric / nullish as 0", () => {
    expect(coverApFromInput("")).toBe(0);
    expect(coverApFromInput("abc")).toBe(0);
    expect(coverApFromInput(null)).toBe(0);
    expect(coverApFromInput(undefined)).toBe(0);
  });
  it("clamps negatives to 0", () => {
    expect(coverApFromInput("-3")).toBe(0);
  });
});

describe("adjacentCellsOnSide", () => {
  const one = { x: 5, y: 7, width: 1, height: 1 };

  it("returns the single neighbouring cell for a 1x1 token on each side", () => {
    expect(adjacentCellsOnSide(one, "n")).toEqual([{ x: 5, y: 6 }]);
    expect(adjacentCellsOnSide(one, "s")).toEqual([{ x: 5, y: 8 }]);
    expect(adjacentCellsOnSide(one, "w")).toEqual([{ x: 4, y: 7 }]);
    expect(adjacentCellsOnSide(one, "e")).toEqual([{ x: 6, y: 7 }]);
  });

  it("returns every cell along the edge for a 2x2 token", () => {
    const two = { x: 2, y: 3, width: 2, height: 2 };
    expect(adjacentCellsOnSide(two, "n")).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }]);
    expect(adjacentCellsOnSide(two, "s")).toEqual([{ x: 2, y: 5 }, { x: 3, y: 5 }]);
    expect(adjacentCellsOnSide(two, "w")).toEqual([{ x: 1, y: 3 }, { x: 1, y: 4 }]);
    expect(adjacentCellsOnSide(two, "e")).toEqual([{ x: 4, y: 3 }, { x: 4, y: 4 }]);
  });

  it("handles a non-square footprint", () => {
    expect(adjacentCellsOnSide({ x: 0, y: 0, width: 3, height: 1 }, "n"))
      .toEqual([{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: 2, y: -1 }]);
  });

  it("returns nothing for an unknown or missing side", () => {
    expect(adjacentCellsOnSide(one, "ne")).toEqual([]);
    expect(adjacentCellsOnSide(one, null)).toEqual([]);
    expect(adjacentCellsOnSide(one, undefined)).toEqual([]);
  });

  it("treats a missing or zero size as a single cell", () => {
    expect(adjacentCellsOnSide({ x: 1, y: 1 }, "n")).toEqual([{ x: 1, y: 0 }]);
    expect(adjacentCellsOnSide({ x: 1, y: 1, width: 0, height: 0 }, "e")).toEqual([{ x: 2, y: 1 }]);
  });
});
