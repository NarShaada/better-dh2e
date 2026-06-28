// scripts/helpers/wounds-display.mjs — wounds display helpers (cosmetic "reverse wounds" / HP view).
// woundsShown/woundsStored are PURE; reverseWoundsEnabled reads the world setting only when called.

/** The wounds number to SHOW given the stored value, max, and the reverse setting. */
export function woundsShown(value, max, reverse) {
  return reverse ? Math.max(0, (max ?? 0) - (value ?? 0)) : (value ?? 0);
}

/** The wounds value to STORE given a typed/shown number, max, and the reverse setting (clamped 0..max). */
export function woundsStored(shown, max, reverse) {
  const m = max ?? 0;
  const raw = reverse ? m - (shown ?? 0) : (shown ?? 0);
  return Math.min(m, Math.max(0, raw));
}

/** Whether the per-world reverse-wounds (HP-style) display is enabled. */
export function reverseWoundsEnabled() {
  return game.settings.get("better-dh2e", "reverseWounds") === true;
}
