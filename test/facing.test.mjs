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

// An attacker exactly on a diagonal of the vehicle's local frame is a TIE between two facings, and
// the documented rule is that the vertical axis (Front / Rear) wins. The rotation into the local
// frame used cos/sin of 45° multiples, which are not exact, so the tie was decided by floating-
// point noise: the same relative geometry gave "front" for a north-facing vehicle and "right" for
// every other heading.
describe("armourSideFromAttack — the same relative attack gives the same facing at every heading", () => {
  // Unit steps for a bearing (degrees clockwise from north; +y is down).
  const STEP = { 0: [0, -1], 45: [1, -1], 90: [1, 0], 135: [1, 1], 180: [0, 1], 225: [-1, 1], 270: [-1, 0], 315: [-1, -1] };
  const HEADINGS = [0, 45, 90, 135, 180, 225, 270, 315];
  /** The facing struck by an attacker `relative` degrees clockwise of the vehicle's nose. */
  const struck = (heading, relative, scale = 100) => {
    const [dx, dy] = STEP[(heading + relative) % 360];
    return armourSideFromAttack(dx * scale, dy * scale, heading);
  };

  for (const [relative, expected] of [[45, "front"], [135, "rear"], [225, "rear"], [315, "front"]]) {
    it(`${relative}° off the nose is ${expected} — the vertical axis wins the tie — whatever the heading`, () => {
      expect(HEADINGS.map((h) => struck(h, relative))).toEqual(HEADINGS.map(() => expected));
    });
  }

  it("the four clean facings are unaffected", () => {
    for (const h of HEADINGS) {
      expect([0, 90, 180, 270].map((rel) => struck(h, rel))).toEqual(["front", "right", "rear", "left"]);
    }
  });

  it("a real off-diagonal attack is still classified by its larger component", () => {
    expect(armourSideFromAttack(300, -100, 0)).toBe("right");
    expect(armourSideFromAttack(100, -300, 0)).toBe("front");
  });
});
