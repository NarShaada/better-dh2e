// scripts/helpers/impairment-data.mjs — PURE. Characteristic impairment: armour Agility cap + fatigue halving.

/** Armour craftsmanship effect on the Agility restriction (Poor restricts 10 more; Good/Best 10 less). */
export function craftAgilityAdj(craftsmanship) {
  return { poor: -10, good: 10, best: 10 }[craftsmanship] ?? 0;
}

/** Most-restrictive (lowest) Agility cap across equipped armour with a maxAgility (>0); null if none. */
export function effectiveAgilityCap(armours) {
  const caps = armours
    .filter((a) => (a.maxAgility ?? 0) > 0)
    .map((a) => a.maxAgility + craftAgilityAdj(a.craftsmanship));
  return caps.length ? Math.min(...caps) : null;
}

/** Mutate `chars` in place: cap Agility at `agilityCap`, then halve any characteristic whose bonus < fatigue.
 *  Bonus is recomputed from the overridden total as floor(total/10)+unnatural (unnatural stays on top). */
export function applyImpairments(chars, fatigueValue, agilityCap) {
  const recompute = (c) => Math.floor(c.total / 10) + (c.unnatural ?? 0);
  if (agilityCap != null && chars.agility && chars.agility.total > agilityCap) {
    chars.agility.total = Math.max(0, agilityCap);
    chars.agility.bonus = recompute(chars.agility);
    chars.agility.impaired = true;
  }
  for (const c of Object.values(chars)) {
    if (c.bonus < fatigueValue) {
      c.total = Math.ceil(c.total / 2);
      c.bonus = recompute(c);
      c.impaired = true;
    }
  }
  return chars;
}
