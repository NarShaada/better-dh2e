// scripts/helpers/cover.mjs — pure cover helpers (no Foundry, no DOM).

// Parse a cover-AP text input into a non-negative integer (junk / empty / negative → 0).
export function coverApFromInput(str) {
  const n = parseInt(String(str ?? "").replace(/[^-\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
