import { describe, it, expect } from "vitest";
import { coverApFromInput } from "../scripts/helpers/cover.mjs";

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
