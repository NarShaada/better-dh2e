// scripts/helpers/item-bonuses.mjs — PURE. Situational & persistent item bonuses (cybernetics/gear/armour).
// No imports: each entry carries its own `kind`, so no registry lookup is needed.

/** Flatten bonus entries from an actor's ACTIVE bonus-bearing items.
 *  Active = installed cybernetics, equipped armour, or any gear (owned ⇒ present).
 *  Gear is situational-only: its entries are coerced to situational and never persistent. */
export function gatherActiveBonusEntries(items) {
  const out = [];
  for (const it of items ?? []) {
    const type = it?.type;
    const sys = it?.system ?? {};
    const active = (type === "cybernetic" && sys.installed) || (type === "armour" && sys.equipped) || (type === "gear");
    if (!active) continue;
    for (const b of sys.bonuses ?? []) {
      const base = { kind: b.kind, key: b.key, amount: Number(b.amount) || 0, sourceType: type, sourceName: it.name ?? "Item" };
      if (type === "gear") out.push({ ...base, situational: true, persistent: false });
      else out.push({ ...base, situational: !!b.situational, persistent: !!b.persistent });
    }
  }
  return out;
}

/** Sum persistent characteristic increases per characteristic key (cybernetic/armour sources only). */
export function persistentCharacteristicBonuses(entries) {
  const totals = {};
  for (const e of entries ?? []) {
    if (e.kind !== "characteristic" || !e.persistent) continue;
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

/** For a roll target (kind+key), split matching NON-persistent bonuses into an auto sum and a
 *  situational opt-in list. The situational id is stable within one gather (its index). */
export function rollBonusesFor(entries, kind, key) {
  let auto = 0;
  const situational = [];
  (entries ?? []).forEach((e, i) => {
    if (e.persistent || e.kind !== kind || e.key !== key) return;
    const amt = Number(e.amount) || 0;
    if (!amt) return;
    if (e.situational) situational.push({ id: `b${i}`, label: `${e.sourceName} ${amt >= 0 ? "+" : ""}${amt}`, amount: amt });
    else auto += amt;
  });
  return { auto, situational };
}
