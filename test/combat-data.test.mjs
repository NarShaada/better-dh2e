// test/combat-data.test.mjs
import { describe, it, expect } from "vitest";
import { computeArmour, corrodeArmour } from "../scripts/helpers/combat-data.mjs";

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
  it("Best-craftsmanship armour adds +1 AP per protected location (not 0-AP ones)", () => {
    const r = computeArmour([{ additive: false, craftsmanship: "best", locations: { head: 0, body: 6, rightArm: 0, leftArm: 0, rightLeg: 0, leftLeg: 0 } }], 0);
    expect(r.body).toBe(7);
    expect(r.head).toBe(0);
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

describe("corrodeArmour", () => {
  it("melts the struck location's AP, no excess when armour absorbs it all", () => {
    const { losses, excess } = corrodeArmour([{ locations: loc({ body: 6 }) }], "body", 4);
    expect(losses).toEqual([{ index: 0, loss: 4 }]);
    expect(excess).toBe(0);
  });
  it("corrosion beyond the total AP becomes excess (dealt to the wearer)", () => {
    const { losses, excess } = corrodeArmour([{ locations: loc({ body: 3 }) }], "body", 8);
    expect(losses).toEqual([{ index: 0, loss: 3 }]);
    expect(excess).toBe(5);
  });
  it("no armour at the location -> the whole roll is excess", () => {
    expect(corrodeArmour([{ locations: loc({ head: 4 }) }], "body", 7)).toEqual({ losses: [], excess: 7 });
    expect(corrodeArmour([], "body", 7)).toEqual({ losses: [], excess: 7 });
  });
  it("multiple pieces: highest AP at the location melts first, then the next", () => {
    const armours = [
      { locations: loc({ body: 2 }) },   // index 0 (additive chestplate)
      { locations: loc({ body: 6 }) },   // index 1 (main suit — melts first)
    ];
    const { losses, excess } = corrodeArmour(armours, "body", 7);
    expect(losses).toEqual([{ index: 1, loss: 6 }, { index: 0, loss: 1 }]);
    expect(excess).toBe(0);
  });
  it("clamps a nonsense negative amount to zero", () => {
    expect(corrodeArmour([{ locations: loc({ body: 3 }) }], "body", -2)).toEqual({ losses: [], excess: 0 });
  });
});
