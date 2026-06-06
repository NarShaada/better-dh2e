import { describe, it, expect } from "vitest";
import { tearingFormula, qualityToHitMod, accurateBonusDice, weaponDamageFormula, parryModifier, hasShocking, concussiveValue, fellingValue, felledToughnessBonus, hasFlame, hasFlexible, hasGraviton, hallucinogenicValue, hasInaccurate, effectivePenetration, hasOverheats, primitiveValue, provenValue, transformDamageDie, hasMaximal, scatterToHit, scatterDamage, snareValue, hasStorm } from "../scripts/helpers/quality-modules.mjs";

const Q = (...keys) => keys.map((key) => ({ key, value: "" }));
const W = (qualities, craftsmanship = "normal") => ({ qualities, craftsmanship });   // a melee weapon for parryModifier

describe("tearingFormula", () => {
  it("adds a die and keeps highest of the first dice term", () => {
    expect(tearingFormula("1d10+3")).toBe("2d10kh1+3");
    expect(tearingFormula("2d10")).toBe("3d10kh2");
  });
});
describe("qualityToHitMod", () => {
  it("Accurate gives +10 only when aiming", () => {
    expect(qualityToHitMod(Q("accurate"), { aiming: true })).toBe(10);
    expect(qualityToHitMod(Q("accurate"), { aiming: false })).toBe(0);
    expect(qualityToHitMod(Q(), { aiming: true })).toBe(0);
  });
});
describe("accurateBonusDice", () => {
  it("+1d10 per 2 DoS, capped 2, ranged+aiming only", () => {
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 4 })).toBe("2d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 2 })).toBe("1d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 6 })).toBe("2d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 1 })).toBeNull();
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: false, dos: 4 })).toBeNull();
    expect(accurateBonusDice(Q("accurate"), { isRanged: false, aiming: true, dos: 4 })).toBeNull();
    expect(accurateBonusDice(Q(), { isRanged: true, aiming: true, dos: 4 })).toBeNull();
  });
});
describe("weaponDamageFormula", () => {
  it("applies Tearing only when present", () => {
    expect(weaponDamageFormula(Q("tearing"), "1d10+3")).toBe("2d10kh1+3");
    expect(weaponDamageFormula(Q(), "1d10+3")).toBe("1d10+3");
  });
});
describe("parryModifier", () => {
  it("best of the defender's melee weapons (Balanced +10 / Unbalanced -10) incl. craftsmanship WS bonus", () => {
    expect(parryModifier([W(Q("balanced"))])).toBe(10);
    expect(parryModifier([W(Q("unbalanced"))])).toBe(-10);
    expect(parryModifier([W(Q("balanced")), W(Q("unbalanced"))])).toBe(10);
    expect(parryModifier([])).toBe(0);
    expect(parryModifier([W(Q(), "best")])).toBe(10);                  // Best craftsmanship = +10 WS
    expect(parryModifier([W(Q("balanced"), "best")])).toBe(20);        // balanced 10 + Best 10, same weapon
    expect(parryModifier([W(Q("balanced")), W(Q(), "good")])).toBe(10);// best of (10) vs (Good +5) = 10
    expect(parryModifier([W(Q("unbalanced"), "poor")])).toBe(-20);     // unbalanced -10 + Poor -10
  });
});
describe("hasShocking", () => {
  it("detects Shocking", () => {
    expect(hasShocking(Q("shocking"))).toBe(true);
    expect(hasShocking(Q())).toBe(false);
  });
});
describe("parryModifier with Defensive", () => {
  it("Defensive is +15; sums with Balanced/craftsmanship on ONE weapon; best single weapon wins", () => {
    expect(parryModifier([W(Q("defensive"))])).toBe(15);
    expect(parryModifier([W(Q("balanced", "defensive"))])).toBe(25);
    expect(parryModifier([W(Q("balanced")), W(Q("defensive"))])).toBe(15);
    expect(parryModifier([W(Q("defensive", "unbalanced"))])).toBe(5);
    expect(parryModifier([W(Q("defensive"), "best")])).toBe(25);       // defensive 15 + Best 10
  });
});
describe("qualityToHitMod with Defensive", () => {
  it("Defensive is -10, and combines with Accurate", () => {
    expect(qualityToHitMod(Q("defensive"), { aiming: false })).toBe(-10);
    expect(qualityToHitMod(Q("accurate", "defensive"), { aiming: true })).toBe(0);
    expect(qualityToHitMod(Q("accurate", "defensive"), { aiming: false })).toBe(-10);
  });
});
describe("concussiveValue", () => {
  it("returns the numeric X, or 0 if absent/blank", () => {
    expect(concussiveValue([{ key: "concussive", value: "2" }])).toBe(2);
    expect(concussiveValue([{ key: "concussive", value: "" }])).toBe(0);
    expect(concussiveValue(Q())).toBe(0);
    expect(concussiveValue([{ key: "tearing", value: "" }])).toBe(0);
  });
});
describe("fellingValue / hallucinogenicValue", () => {
  it("read the numeric X (0 if absent/blank)", () => {
    expect(fellingValue([{ key: "felling", value: "4" }])).toBe(4);
    expect(fellingValue(Q())).toBe(0);
    expect(hallucinogenicValue([{ key: "hallucinogenic", value: "2" }])).toBe(2);
    expect(hallucinogenicValue([{ key: "hallucinogenic", value: "" }])).toBe(0);
  });
});
describe("felledToughnessBonus", () => {
  it("removes the unnatural part up to X, never the natural part", () => {
    expect(felledToughnessBonus(5, 2, 4)).toBe(3);
    expect(felledToughnessBonus(5, 2, 1)).toBe(4);
    expect(felledToughnessBonus(3, 0, 4)).toBe(3);
    expect(felledToughnessBonus(6, 3, 3)).toBe(3);
  });
});
describe("flag helpers", () => {
  it("detect Flame / Flexible / Graviton", () => {
    expect(hasFlame(Q("flame"))).toBe(true);
    expect(hasFlexible(Q("flexible"))).toBe(true);
    expect(hasGraviton(Q("graviton"))).toBe(true);
    expect(hasFlame(Q())).toBe(false);
  });
});
describe("hasInaccurate", () => {
  it("detects Inaccurate", () => {
    expect(hasInaccurate(Q("inaccurate"))).toBe(true);
    expect(hasInaccurate(Q())).toBe(false);
  });
});
describe("effectivePenetration", () => {
  it("Lance multiplies Pen by DoS on a hit; nothing on a miss", () => {
    expect(effectivePenetration(4, { qualities: Q("lance"), dos: 3, success: true, closeRange: false })).toBe(12);
    expect(effectivePenetration(4, { qualities: Q("lance"), dos: 3, success: false, closeRange: false })).toBe(4);
  });
  it("Melta doubles Pen at close range only", () => {
    expect(effectivePenetration(4, { qualities: Q("melta"), dos: 1, success: true, closeRange: true })).toBe(8);
    expect(effectivePenetration(4, { qualities: Q("melta"), dos: 1, success: true, closeRange: false })).toBe(4);
  });
  it("stacks Lance and Melta", () => {
    expect(effectivePenetration(4, { qualities: Q("lance", "melta"), dos: 2, success: true, closeRange: true })).toBe(16);
  });
  it("no relevant qualities -> base Pen", () => {
    expect(effectivePenetration(4, { qualities: Q(), dos: 3, success: true, closeRange: true })).toBe(4);
  });
});
describe("hasOverheats", () => {
  it("detects Overheats", () => {
    expect(hasOverheats(Q("overheats"))).toBe(true);
    expect(hasOverheats(Q())).toBe(false);
  });
});
describe("primitiveValue / provenValue", () => {
  it("read the numeric X (0 if absent/blank)", () => {
    expect(primitiveValue([{ key: "primitive", value: "6" }])).toBe(6);
    expect(provenValue([{ key: "proven", value: "3" }])).toBe(3);
    expect(primitiveValue(Q())).toBe(0);
    expect(provenValue([{ key: "proven", value: "" }])).toBe(0);
  });
});
describe("transformDamageDie", () => {
  it("Primitive caps at X; Proven floors at X; neither -> unchanged", () => {
    expect(transformDamageDie(9, { primitiveX: 7 })).toBe(7);
    expect(transformDamageDie(5, { primitiveX: 7 })).toBe(5);
    expect(transformDamageDie(10, { primitiveX: 7 })).toBe(7);
    expect(transformDamageDie(2, { provenX: 3 })).toBe(3);
    expect(transformDamageDie(5, { provenX: 3 })).toBe(5);
    expect(transformDamageDie(8, {})).toBe(8);
  });
});
describe("effectivePenetration with Razor Sharp", () => {
  it("doubles Pen at 3+ DoS on a hit only", () => {
    expect(effectivePenetration(4, { qualities: Q("razorSharp"), dos: 3, success: true, closeRange: false })).toBe(8);
    expect(effectivePenetration(4, { qualities: Q("razorSharp"), dos: 2, success: true, closeRange: false })).toBe(4);
    expect(effectivePenetration(4, { qualities: Q("razorSharp"), dos: 5, success: false, closeRange: false })).toBe(4);
  });
});
describe("hasMaximal", () => {
  it("detects Maximal", () => {
    expect(hasMaximal(Q("maximal"))).toBe(true);
    expect(hasMaximal(Q())).toBe(false);
  });
});
describe("scatterToHit", () => {
  it("+10 at Point-Blank/Short only", () => {
    expect(scatterToHit(Q("scatter"), "pointBlank")).toBe(10);
    expect(scatterToHit(Q("scatter"), "short")).toBe(10);
    expect(scatterToHit(Q("scatter"), "normal")).toBe(0);
    expect(scatterToHit(Q(), "pointBlank")).toBe(0);
  });
});
describe("scatterDamage", () => {
  it("+3 PB, 0 Short, -3 Normal/Long/Extreme, 0 otherwise/no-scatter", () => {
    expect(scatterDamage(Q("scatter"), "pointBlank")).toBe(3);
    expect(scatterDamage(Q("scatter"), "short")).toBe(0);
    expect(scatterDamage(Q("scatter"), "normal")).toBe(-3);
    expect(scatterDamage(Q("scatter"), "long")).toBe(-3);
    expect(scatterDamage(Q("scatter"), "extreme")).toBe(-3);
    expect(scatterDamage(Q("scatter"), undefined)).toBe(0);
    expect(scatterDamage(Q(), "normal")).toBe(0);
  });
});
describe("snareValue / hasStorm", () => {
  it("snareValue reads X; hasStorm detects Storm", () => {
    expect(snareValue([{ key: "snare", value: "2" }])).toBe(2);
    expect(snareValue(Q())).toBe(0);
    expect(hasStorm(Q("storm"))).toBe(true);
    expect(hasStorm(Q())).toBe(false);
  });
});
