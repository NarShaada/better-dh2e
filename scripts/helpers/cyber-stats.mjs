// scripts/helpers/cyber-stats.mjs — PURE. Derived-stat modifiers from installed cybernetics + traits.

export const STAT_KEYS = ["moveAll", "moveHalf", "moveFull", "moveCharge", "moveRun", "wounds", "size", "fatigue", "carry", "initiative"];

/** Flat {stat, amount} list from active stat-mod sources: installed cybernetics + all traits (always-on). */
export function gatherStatMods(items) {
  const out = [];
  for (const it of items ?? []) {
    const active = (it?.type === "cybernetic" && it.system?.installed) || it?.type === "trait";
    if (!active) continue;
    for (const m of it.system.statMods ?? []) out.push({ stat: m.stat, amount: Number(m.amount) || 0 });
  }
  return out;
}

/** Sum per stat; every key present, defaulting to 0. */
export function sumStatMods(mods) {
  const sums = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
  for (const m of mods ?? []) {
    if (m?.stat in sums) sums[m.stat] += Number(m.amount) || 0;
  }
  return sums;
}

/** Apply moveAll + per-band metre mods to {half, full, charge, run}, flooring each at 0. */
export function applyMovementMods(rates, sums) {
  const band = (key, modKey) => Math.max(0, (rates?.[key] ?? 0) + (sums.moveAll ?? 0) + (sums[modKey] ?? 0));
  return { half: band("half", "moveHalf"), full: band("full", "moveFull"), charge: band("charge", "moveCharge"), run: band("run", "moveRun") };
}
