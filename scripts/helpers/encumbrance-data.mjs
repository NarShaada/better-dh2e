// scripts/helpers/encumbrance-data.mjs — PURE. DH2e Table 7-26 (Carrying, Lifting, & Pushing).

/** Indexed by (Strength Bonus + Toughness Bonus), 0..20. Weights in kg. */
export const CARRY_TABLE = [
  { carry: 0.9,  lift: 2.25, push: 4.5 },
  { carry: 2.25, lift: 4.5,  push: 9 },
  { carry: 4.5,  lift: 9,    push: 18 },
  { carry: 9,    lift: 18,   push: 36 },
  { carry: 18,   lift: 36,   push: 72 },
  { carry: 27,   lift: 54,   push: 108 },
  { carry: 36,   lift: 72,   push: 144 },
  { carry: 45,   lift: 90,   push: 180 },
  { carry: 56,   lift: 112,  push: 224 },
  { carry: 67,   lift: 134,  push: 268 },
  { carry: 78,   lift: 156,  push: 312 },
  { carry: 90,   lift: 180,  push: 360 },
  { carry: 112,  lift: 224,  push: 448 },
  { carry: 225,  lift: 450,  push: 900 },
  { carry: 337,  lift: 674,  push: 1348 },
  { carry: 450,  lift: 900,  push: 1800 },
  { carry: 675,  lift: 1350, push: 2700 },
  { carry: 900,  lift: 1800, push: 3600 },
  { carry: 1350, lift: 2700, push: 5400 },
  { carry: 1800, lift: 3600, push: 7200 },
  { carry: 2250, lift: 4500, push: 9000 },
];

/** Carry/lift/push limits for a given Strength-Bonus + Toughness-Bonus sum (clamped 0..20). */
export function carryLimits(sbPlusTb) {
  const i = Math.max(0, Math.min(20, Math.floor(sbPlusTb || 0)));
  return CARRY_TABLE[i];
}
