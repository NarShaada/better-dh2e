import { describe, it, expect } from "vitest";
import { rangeBand, classifyMovement, movedThisTurn } from "../scripts/helpers/battlemap-data.mjs";

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

// Foundry's movement record (TokenDocument#movement / the moveToken hook's 2nd argument) splits a
// turn's movement: `history` is what was recorded BEFORE this movement, `passed` is the leg this
// update has just covered. Reading `history.distance` alone therefore lags one move behind — a
// single 18 m drag reads 0 — which is the bug movedThisTurn() exists to prevent.
describe("movedThisTurn", () => {
  const record = ({ history = 0, passed = 0, ...rest } = {}) => ({
    recorded: true, method: "dragging",
    history: { distance: history }, passed: { distance: passed }, pending: { distance: 0 },
    ...rest,
  });

  it("counts the leg just moved on the first move of a turn", () => {
    expect(movedThisTurn(record({ history: 0, passed: 18 }))).toBe(18);
  });
  it("adds the leg just moved to what was already recorded this turn", () => {
    expect(movedThisTurn(record({ history: 10, passed: 8 }))).toBe(18);
  });
  it("is null when the movement is not being recorded (token not in a started combat)", () => {
    expect(movedThisTurn(record({ passed: 18, recorded: false }))).toBeNull();
  });
  it("is null for an undo — its history still holds the leg being taken back", () => {
    expect(movedThisTurn(record({ history: 18, passed: 18, recorded: false, method: "undo" }))).toBeNull();
  });
  it("falls back to the caller's combat check when the record carries no `recorded` flag", () => {
    const noFlag = record({ passed: 12 });
    delete noFlag.recorded;
    expect(movedThisTurn(noFlag, { inStartedCombat: true })).toBe(12);
    expect(movedThisTurn(noFlag, { inStartedCombat: false })).toBeNull();
    expect(movedThisTurn(noFlag)).toBeNull();
  });
  it("is null with no record, and treats missing distances as 0", () => {
    expect(movedThisTurn(null)).toBeNull();
    expect(movedThisTurn(undefined)).toBeNull();
    expect(movedThisTurn({ recorded: true })).toBe(0);
  });
});
