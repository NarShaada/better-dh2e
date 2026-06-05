// test/combat-data.test.mjs
import { describe, it, expect } from "vitest";
import { computeArmour } from "../scripts/helpers/combat-data.mjs";

const loc = (o) => ({ head: 0, body: 0, rightArm: 0, leftArm: 0, rightLeg: 0, leftLeg: 0, ...o });

describe("computeArmour", () => {
  it("no armour: every location equals the Toughness Bonus", () => {
    expect(computeArmour([], 4)).toEqual(loc({ head: 4, body: 4, rightArm: 4, leftArm: 4, rightLeg: 4, leftLeg: 4 }));
  });
  it("single non-additive piece adds its AP plus TB", () => {
    const r = computeArmour([{ additive: false, locations: loc({ body: 6 }) }], 4);
    expect(r.body).toBe(10);
    expect(r.head).toBe(4);
  });
  it("two non-additive pieces take the higher per location (not the sum)", () => {
    const r = computeArmour([
      { additive: false, locations: loc({ body: 6 }) },
      { additive: false, locations: loc({ body: 4 }) }
    ], 0);
    expect(r.body).toBe(6);
  });
  it("additive pieces stack on top of the best non-additive piece", () => {
    const r = computeArmour([
      { additive: false, locations: loc({ body: 6 }) },
      { additive: true, locations: loc({ body: 1, head: 1 }) }
    ], 4);
    expect(r.body).toBe(11); // 6 + 1 + 4
    expect(r.head).toBe(5);  // 0 + 1 + 4
  });
});
