import { describe, it, expect } from "vitest";
import { rangeBand, classifyMovement } from "../scripts/helpers/battlemap-data.mjs";

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

describe("classifyMovement", () => {
  const r = { half: 4, full: 8, charge: 12, run: 24 };
  it("bands a move distance against the actor's rates", () => {
    expect(classifyMovement(1, r)).toBe("half");
    expect(classifyMovement(4, r)).toBe("half");
    expect(classifyMovement(5, r)).toBe("full");
    expect(classifyMovement(8, r)).toBe("full");
    expect(classifyMovement(10, r)).toBe("charge");
    expect(classifyMovement(12, r)).toBe("charge");
    expect(classifyMovement(20, r)).toBe("run");
    expect(classifyMovement(24, r)).toBe("run");
    expect(classifyMovement(25, r)).toBe("tooFar");
  });
});
