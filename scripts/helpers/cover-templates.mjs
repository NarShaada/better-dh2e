// scripts/helpers/cover-templates.mjs — pure cover-template helpers + thin world-setting wrappers.
// Pure section (no Foundry, no DOM) is unit-tested; the loadLibrary/saveLibrary wrappers touch game.settings.

const NS = "better-dh2e";

export const SIDE_KEYS = ["n", "e", "s", "w"];
export const SIDE_LABELS = { n: "N", e: "E", s: "S", w: "W" };
export const LOCATION_KEYS = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];
export const LOCATION_LABELS = {
  head: "Head", body: "Body", rightArm: "Right Arm", leftArm: "Left Arm", rightLeg: "Right Leg", leftLeg: "Left Leg",
};
const DEFAULT_COLOR = "#8a6a3a";

/** Build a fresh template with a caller-supplied id (runtime passes foundry.utils.randomID()).
 *  Strict on `ap` (finite number or the 4 default) and uses a "New Cover" placeholder name — this builds
 *  from UI-controlled values, unlike validateTemplate which coerces arbitrary persisted data. */
export function newTemplate(id, o = {}) {
  return {
    id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "New Cover",
    color: typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : DEFAULT_COLOR,
    ap: Number.isFinite(o.ap) && o.ap >= 0 ? Math.floor(o.ap) : 4,
    sides: Array.isArray(o.sides) ? o.sides.filter((s) => SIDE_KEYS.includes(s)) : [...SIDE_KEYS],
    locations: Array.isArray(o.locations) ? o.locations.filter((l) => LOCATION_KEYS.includes(l)) : [...LOCATION_KEYS],
  };
}

/** Coerce arbitrary (persisted/untrusted) data into a valid template: loose-parse AP (e.g. "5") then clamp ≥ 0,
 *  whitelist sides/locations, fall back name→"Cover"/colour. Looser than newTemplate by design. */
export function validateTemplate(t) {
  let ap = parseInt(t?.ap, 10);
  if (!Number.isFinite(ap) || ap < 0) ap = 0;
  return {
    id: t?.id ?? null,
    name: typeof t?.name === "string" && t.name.trim() ? t.name.trim() : "Cover",
    color: typeof t?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : DEFAULT_COLOR,
    ap,
    sides: Array.isArray(t?.sides) ? SIDE_KEYS.filter((s) => t.sides.includes(s)) : [],
    locations: Array.isArray(t?.locations) ? LOCATION_KEYS.filter((l) => t.locations.includes(l)) : [],
  };
}

/** One-line summary for a manager row, e.g. "AP4 · S,E · Right Leg, Left Leg". */
export function summarizeTemplate(t) {
  const sides = t.sides?.length ? t.sides.map((s) => SIDE_LABELS[s]).join(",") : "—";
  const locs = !t.locations?.length
    ? "—"
    : t.locations.length === LOCATION_KEYS.length
      ? "all"
      : t.locations.map((l) => LOCATION_LABELS[l]).join(", ");
  return `AP${t.ap} · ${sides} · ${locs}`;
}

/** Highest AP among a list of cover payloads (overlapping pieces are alternatives, not additive). */
export function highestCoverAp(covers) {
  return (covers ?? []).reduce((m, c) => Math.max(m, Number(c?.ap) || 0), 0);
}

/** Decide the auto-mark action. "apply" | "remove" | "none". Never strips a manual (non-auto) condition. */
export function coverAutoDecision({ inCover, hasCondition, wasAuto }) {
  if (inCover && !hasCondition) return "apply";
  if (!inCover && hasCondition && wasAuto) return "remove";
  return "none";
}

/** True iff the cover piece exists and the shot's approach side is one it defends. */
export function isApproachDefended(piece, approachSide) {
  return !!(piece && approachSide && piece.sides?.includes(approachSide));
}

/** Pre-fill value for the cover-AP prompt: the piece's AP only when the shot came from a defended side
 *  AND struck a protected location; otherwise 0 (and 0 for a manual In Cover / null piece). */
export function coverPrefill(piece, approachSide, hitLocations) {
  if (!isApproachDefended(piece, approachSide)) return 0;
  const protectedHit = (hitLocations ?? []).some((l) => piece.locations?.includes(l));
  return protectedHit ? (Number(piece.ap) || 0) : 0;
}

/** Human context line for the cover prompt, e.g.
 *  "Shot approached from N (undefended) · protects Right Leg, Left Leg". */
export function coverContextLabel(piece, approachSide) {
  const from = approachSide ? SIDE_LABELS[approachSide] : "unknown";
  const dir = approachSide ? (isApproachDefended(piece, approachSide) ? "defended" : "undefended") : "no direction";
  const locs = piece?.locations?.length ? piece.locations.map((l) => LOCATION_LABELS[l]).join(", ") : "nothing";
  return `Shot approached from ${from} (${dir}) · protects ${locs}`;
}

// --- world-setting wrappers (not unit-tested; thin) ---

/** Read the template library from the world setting, validated. */
export function loadLibrary() {
  const arr = game.settings.get(NS, "coverTemplates");
  return Array.isArray(arr) ? arr.map(validateTemplate) : [];
}

/** Persist the template library (validated) to the world setting. */
export async function saveLibrary(arr) {
  await game.settings.set(NS, "coverTemplates", (arr ?? []).map(validateTemplate));
}
