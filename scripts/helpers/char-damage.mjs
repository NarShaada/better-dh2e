// scripts/helpers/char-damage.mjs — PURE. Temporary characteristic-point damage from the injuries array.
// Applied BEFORE fatigue halving / armour Agility cap, so those operate on the already-reduced value.

/** Sum positive characteristic-damage points per characteristic key from the injuries array. */
export function characteristicDamageTotals(injuries) {
  const totals = {};
  for (const e of injuries ?? []) {
    if (e?.type !== "charDamage") continue;
    const key = e.characteristic;
    const amt = Number(e.amount) || 0;
    if (!key || amt <= 0) continue;
    totals[key] = (totals[key] ?? 0) + amt;
  }
  return totals;
}

/** Mutate `chars` in place: reduce each damaged characteristic's total (floored at 0),
 *  recompute bonus = floor(total/10)+unnatural, and flag it impaired (red display). */
export function applyCharacteristicDamage(chars, injuries) {
  const totals = characteristicDamageTotals(injuries);
  for (const [key, dmg] of Object.entries(totals)) {
    const c = chars[key];
    if (!c) continue;
    c.total = Math.max(0, c.total - dmg);
    c.bonus = Math.floor(c.total / 10) + (c.unnatural ?? 0);
    c.impaired = true;
  }
  return chars;
}
