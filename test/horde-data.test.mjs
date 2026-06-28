import { describe, it, expect } from "vitest";
import { hordeSize } from "../scripts/helpers/horde-data.mjs";

describe("hordeSize", () => {
  it("starts at 6 below 30 magnitude", () => {
    expect(hordeSize(0)).toBe(6);
    expect(hordeSize(29)).toBe(6);
  });
  it("steps +1 per 30 magnitude", () => {
    expect(hordeSize(30)).toBe(7);
    expect(hordeSize(60)).toBe(8);
    expect(hordeSize(90)).toBe(9);
    expect(hordeSize(119)).toBe(9);
  });
  it("caps at 10", () => {
    expect(hordeSize(120)).toBe(10);
    expect(hordeSize(999)).toBe(10);
  });
  it("tolerates nullish magnitude", () => {
    expect(hordeSize(undefined)).toBe(6);
    expect(hordeSize(null)).toBe(6);
  });
});
