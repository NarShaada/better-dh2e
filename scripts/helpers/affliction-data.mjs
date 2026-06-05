// scripts/helpers/affliction-data.mjs
// PURE — no Foundry imports. Track thresholds are data-driven; verify vs the book (spec §10).

/** Corruption track tier + test penalty. */
export function corruptionTrack(value) {
  if (value <= 30) return { tier: "Tainted", penalty: 0 };
  if (value <= 60) return { tier: "Soiled", penalty: -10 };
  if (value <= 90) return { tier: "Debased", penalty: -20 };
  return { tier: "Profane", penalty: -30 };
}

/** Insanity track tier + trauma-test modifier. */
export function insanityTrack(value) {
  if (value <= 9) return { tier: "Stable", penalty: 0 };
  if (value <= 39) return { tier: "Unsettled", penalty: 10 };
  if (value <= 59) return { tier: "Disturbed", penalty: 0 };
  if (value <= 79) return { tier: "Unhinged", penalty: -10 };
  if (value <= 99) return { tier: "Deranged", penalty: -20 };
  return { tier: "Terminally Insane", penalty: -30 };
}

/** The next multiple of 10 above the current value (when the next test triggers). */
export function nextTestAt(value) {
  return Math.floor(value / 10) * 10 + 10;
}
