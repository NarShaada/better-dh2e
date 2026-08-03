// scripts/helpers/psychic-manifest.mjs — PURE. Psychic manifest math.

export const MAX_PUSH = { bound: 2, daemonic: 3, unbound: 4 };
export function maxPush(psykerClass) { return MAX_PUSH[psykerClass] ?? 0; }

/** "fettered" | "normal" | "pushed" */
export function manifestState(effectivePR, normalPR) {
  if (effectivePR < normalPR) return "fettered";
  if (effectivePR > normalPR) return "pushed";
  return "normal";
}

/** Focus-test modifier from the PR choice: +10/pt fettered, -10/pt pushed. */
export function fetterPushModifier(effectivePR, normalPR) {
  return (normalPR - effectivePR) * 10;
}

/** Matching tens/units on a d100 (1..100; 100 -> "00", a double). */
export function isDoubles(d100) {
  const n = d100 % 100;
  return Math.floor(n / 10) === (n % 10);
}

/** Does phenomena trigger? state: "fettered"|"normal"|"pushed". */
export function phenomenaTriggers(psykerClass, state, doubles) {
  if (state !== "pushed") return doubles;
  if (psykerClass === "bound") return !doubles;
  return true;
}

/** Modifier added to the phenomena d100. */
export function phenomenaModifier(psykerClass, state, pushPoints) {
  if (state === "pushed") {
    if (psykerClass === "unbound")  return Math.min(5 * pushPoints, 20);
    if (psykerClass === "daemonic") return Math.min(10 * pushPoints, 30);
    return 0;
  }
  return (psykerClass === "unbound" || psykerClass === "daemonic") ? 10 : 0;
}

/** Black Crusade push limits by class. */
export const BC_MAX_PUSH = { bound: 3, unbound: 5, daemonic: 4 };
export function bcMaxPush(psykerClass) { return BC_MAX_PUSH[psykerClass] ?? 0; }

/** BC Fettered manifests at half PR, rounded up. (Daemonic cannot fetter — enforced by the ruleset's castOptions.) */
export function bcFetteredPR(normalPR) { return Math.ceil(normalPR / 2); }

/** BC phenomena trigger: fettered never; unfettered on doubles; push always (all classes). */
export function bcPhenomenaTriggers(psykerClass, state, doubles) {
  if (state === "fettered") return false;
  if (state === "pushed") return true;
  return doubles;
}

/** BC phenomena modifier: push — bound flat +10, unbound 5×pts cap +25, daemonic 10×pts cap +40;
 *  non-push — standing +10 for unbound/daemonic, 0 for bound (fettered never triggers, so moot). */
export function bcPhenomenaModifier(psykerClass, state, pushPoints) {
  if (state === "pushed") {
    if (psykerClass === "unbound")  return Math.min(5 * pushPoints, 25);
    if (psykerClass === "daemonic") return Math.min(10 * pushPoints, 40);
    return 10;
  }
  return (psykerClass === "unbound" || psykerClass === "daemonic") ? 10 : 0;
}

/** Substitute a power's bonus tokens into a formula. `ctxOrPR` is either a bare number (legacy —
 *  read as the effective PR) or `{pr, wpb, cb}`. Absent bonuses substitute 0, never undefined.
 *  Longest token first: PR/WPB/CB do not actually overlap under \b, but ordering makes the rule
 *  hold if another token is ever added. Handles +PR, *PR and a bare token. */
export function substitutePR(formula, ctxOrPR) {
  const c = (typeof ctxOrPR === "number") ? { pr: ctxOrPR } : (ctxOrPR ?? {});
  const { pr = 0, wpb = 0, cb = 0 } = c;
  return String(formula ?? "")
    .replace(/\bWPB\b/gi, String(wpb))
    .replace(/\bCB\b/gi,  String(cb))
    .replace(/\bPR\b/gi,  String(pr));
}

/** Resolve a focusTest key to {kind, key, total} against an actor system; falls back to willpower. */
export function resolveFocusTarget(system, focusTest) {
  if (system?.characteristics?.[focusTest] != null) {
    return { kind: "characteristic", key: focusTest, total: system.characteristics[focusTest].total ?? 0 };
  }
  if (system?.skills?.[focusTest] != null && typeof system.skills[focusTest].total === "number") {
    return { kind: "skill", key: focusTest, total: system.skills[focusTest].total };
  }
  return { kind: "characteristic", key: "willpower", total: system?.characteristics?.willpower?.total ?? 0 };
}

/** Enemies Beyond p. 54: a successful Malefic Daemonology manifest grants Corruption equal to the
 *  psy rating USED to manifest — i.e. the effective PR after push/fetter, not the base rating.
 *  Returns the number of Corruption points to add; 0 means no change. */
export function maleficCorruptionGain(discipline, success, effectivePR) {
  if (discipline !== "malefic" || !success) return 0;
  return Math.max(0, Number(effectivePR) || 0);
}
