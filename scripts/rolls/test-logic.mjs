// scripts/rolls/test-logic.mjs
// PURE roll math — no Foundry imports. DH2e: roll-under d100; DoS/DoF = 1 + |tens(target) - tens(roll)|.
const MOD_CAP = 60;

/** Parse a signed integer from a string like "+10", "10", "-20"; 0 if unparseable. */
export function parseModifier(input) {
  if (typeof input === "number") return input;
  if (!input) return 0;
  const m = String(input).trim().match(/^([+-]?)\s*(\d+)$/);
  if (!m) return 0;
  const n = parseInt(m[2], 10);
  return m[1] === "-" ? -n : n;
}

/** Clamp a modifier to the DH2e +/-60 combined cap. */
export function clampModifier(modifier) {
  return Math.max(-MOD_CAP, Math.min(MOD_CAP, modifier));
}

function degrees(target, roll, success) {
  const t = Math.floor(target / 10);
  const r = Math.floor(roll / 10);
  return Math.max(1, success ? 1 + (t - r) : 1 + (r - t));
}

/**
 * Resolve a d100 test.
 * @param {{base:number, modifier?:number, roll:number}} args
 * @returns {{base:number, modifier:number, target:number, roll:number, success:boolean, degrees:number}}
 */
export function evaluateTest({ base, modifier = 0, roll }) {
  const mod = clampModifier(modifier);
  const target = base + mod;
  let success;
  if (roll === 1) success = true;
  else if (roll === 100) success = false;
  else success = roll <= target;
  return { base, modifier: mod, target, roll, success, degrees: degrees(target, roll, success) };
}
