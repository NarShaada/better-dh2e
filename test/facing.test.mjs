import { describe, it, expect } from "vitest";
import { facingFromDelta, snapFacing, turnFacing, facingVector, armourSideFromAttack } from "../scripts/helpers/facing.mjs";

describe("armourSideFromAttack (attacker delta + vehicle facing → struck side)", () => {
  it("facing 0 (north): cover-style zones", () => {
    expect(armourSideFromAttack(0, -1, 0)).toBe("front");
    expect(armourSideFromAttack(0, 1, 0)).toBe("rear");
    expect(armourSideFromAttack(1, 0, 0)).toBe("right");
    expect(armourSideFromAttack(-1, 0, 0)).toBe("left");
  });
  it("facing 90 (east): rotates the zones a quarter turn", () => {
    expect(armourSideFromAttack(1, 0, 90)).toBe("front");   // attacker east of an east-facing vehicle
    expect(armourSideFromAttack(0, -1, 90)).toBe("left");   // north is to its left
    expect(armourSideFromAttack(-1, 0, 90)).toBe("rear");
    expect(armourSideFromAttack(0, 1, 90)).toBe("right");
  });
  it("facing 45 (NE): the diagonal quadrants from the image", () => {
    expect(armourSideFromAttack(1, -1, 45)).toBe("front");   // NE
    expect(armourSideFromAttack(-1, -1, 45)).toBe("left");   // NW
    expect(armourSideFromAttack(-1, 1, 45)).toBe("rear");    // SW
    expect(armourSideFromAttack(1, 1, 45)).toBe("right");    // SE
  });
  it("returns null when attacker shares the vehicle's cell", () => {
    expect(armourSideFromAttack(0, 0, 45)).toBe(null);
  });
});

describe("snapFacing / turnFacing (45° steps, normalised)", () => {
  it("snaps to the nearest 45° and wraps into [0,360)", () => {
    expect(snapFacing(0)).toBe(0);
    expect(snapFacing(40)).toBe(45);
    expect(snapFacing(360)).toBe(0);
    expect(snapFacing(-45)).toBe(315);
  });
  it("turns clockwise/counter-clockwise in 45° steps, wrapping", () => {
    expect(turnFacing(0, 45)).toBe(45);
    expect(turnFacing(315, 45)).toBe(0);
    expect(turnFacing(0, -45)).toBe(315);
    expect(turnFacing(90, -45)).toBe(45);
  });
});

describe("facingVector (screen space, +y down)", () => {
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  it("points up at 0, right at 90, down at 180, left at 270", () => {
    expect(near(facingVector(0).x, 0) && near(facingVector(0).y, -1)).toBe(true);
    expect(near(facingVector(90).x, 1) && near(facingVector(90).y, 0)).toBe(true);
    expect(near(facingVector(180).x, 0) && near(facingVector(180).y, 1)).toBe(true);
    expect(near(facingVector(270).x, -1) && near(facingVector(270).y, 0)).toBe(true);
  });
});

describe("facingFromDelta", () => {
  it("maps the four cardinals (screen space: +y is down, so up = north)", () => {
    expect(facingFromDelta(0, -10)).toBe("n");
    expect(facingFromDelta(0, 10)).toBe("s");
    expect(facingFromDelta(10, 0)).toBe("e");
    expect(facingFromDelta(-10, 0)).toBe("w");
  });
  it("breaks diagonal ties toward N/S (the larger zones)", () => {
    expect(facingFromDelta(10, -10)).toBe("n");   // NE corner → N
    expect(facingFromDelta(-10, 10)).toBe("s");   // SW corner → S
  });
  it("uses the dominant axis off the diagonal", () => {
    expect(facingFromDelta(10, -5)).toBe("e");    // |dx| > |dy| → E
    expect(facingFromDelta(5, -10)).toBe("n");    // |dy| > |dx| → N
  });
  it("returns null at the origin (same cell)", () => {
    expect(facingFromDelta(0, 0)).toBe(null);
  });
});
