import { describe, it, expect } from "vitest";
import { rangeBand } from "../scripts/helpers/battlemap-data.mjs";

describe("rangeBand (DH2e bands)", () => {
  it("Point-Blank at ≤ 2 m regardless of range", () => {
    expect(rangeBand(1, 30)).toBe("pointBlank");
    expect(rangeBand(2, 30)).toBe("pointBlank");
    expect(rangeBand(2, 4)).toBe("pointBlank");
  });
  it("Short ≤ ½ range, Normal ≤ range", () => {
    expect(rangeBand(10, 30)).toBe("short");
    expect(rangeBand(15, 30)).toBe("short");
    expect(rangeBand(16, 30)).toBe("normal");
    expect(rangeBand(30, 30)).toBe("normal");
  });
  it("Long ≤ 2× range, Extreme ≤ 3× range, beyond → extreme", () => {
    expect(rangeBand(45, 30)).toBe("long");
    expect(rangeBand(60, 30)).toBe("long");
    expect(rangeBand(80, 30)).toBe("extreme");
    expect(rangeBand(90, 30)).toBe("extreme");
    expect(rangeBand(300, 30)).toBe("extreme");
  });
});
