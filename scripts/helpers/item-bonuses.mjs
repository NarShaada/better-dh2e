// scripts/helpers/item-bonuses.mjs — PURE. Item bonuses (cybernetics/gear/armour).
// One flag: `situational`. Unchecked = always-on (auto roll bonus for skills; persistent flat increase
// for characteristics). Checked = opt-in at roll. No imports: each entry carries its own `kind`.

/** Flatten bonus entries from an actor's ACTIVE bonus-bearing items.
 *  Active = installed cybernetics, equipped armour, or any gear (owned ⇒ present).
 *  Gear is situational-only: its entries are coerced to situational. */
export function gatherActiveBonusEntries(items) {
  const out = [];
  for (const it of items ?? []) {
    const type = it?.type;
    const sys = it?.system ?? {};
    const active = (type === "cybernetic" && sys.installed) || (type === "armour" && sys.equipped) || (type === "gear");
    if (!active) continue;
    for (const b of sys.bonuses ?? []) {
      const base = { kind: b.kind, key: b.key, amount: Number(b.amount) || 0, sourceType: type, sourceName: it.name ?? "Item" };
      out.push({ ...base, situational: type === "gear" ? true : !!b.situational });
    }
  }
  return out;
}

/** Sum persistent characteristic increases per key: UNCHECKED characteristic bonuses from
 *  cybernetic/armour sources (gear is always situational, so excluded). */
export function persistentCharacteristicBonuses(entries) {
  const totals = {};
  for (const e of entries ?? []) {
    if (e.kind !== "characteristic" || e.situational) continue;
    if (e.sourceType !== "cybernetic" && e.sourceType !== "armour") continue;
    const amt = Number(e.amount) || 0;
    if (!e.key || !amt) continue;
    totals[e.key] = (totals[e.key] ?? 0) + amt;
  }
  return totals;
}

/** Mutate `chars` in place: add persistent increases to the characteristic total, recompute bonus,
 *  and flag `boosted` when the net increase is positive (drives the green display). */
export function applyPersistentBonuses(chars, entries) {
  const totals = persistentCharacteristicBonuses(entries);
  for (const [key, amt] of Object.entries(totals)) {
    const c = chars[key];
    if (!c) continue;
    c.total = (c.total ?? 0) + amt;
    c.bonus = Math.floor(c.total / 10) + (c.unnatural ?? 0);
    if (amt > 0) c.boosted = true;
  }
  return chars;
}

/** For a roll target (kind+key): situational = matching checked entries (any kind); auto = matching
 *  unchecked SKILL entries only (an unchecked characteristic is persistent, never a roll bonus). */
export function rollBonusesFor(entries, kind, key) {
  let auto = 0;
  const situational = [];
  (entries ?? []).forEach((e, i) => {
    if (e.kind !== kind || e.key !== key) return;
    const amt = Number(e.amount) || 0;
    if (!amt) return;
    if (e.situational) situational.push({ id: `b${i}`, label: `${e.sourceName} ${amt >= 0 ? "+" : ""}${amt}`, amount: amt });
    else if (e.kind === "skill") auto += amt;
  });
  return { auto, situational };
}

/** Strength Bonus for a damage roll given a situational Strength-point delta: floor((total+delta)/10)+unnatural. */
export function effectiveStrengthBonus(total, unnatural, delta) {
  return Math.floor(((total ?? 0) + (delta ?? 0)) / 10) + (unnatural ?? 0);
}
