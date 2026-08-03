// scripts/helpers/cover-templates.mjs — pure cover-template helpers + thin world-setting wrappers.
// Pure section (no Foundry, no DOM) is unit-tested; the loadLibrary/saveLibrary wrappers touch game.settings.

const NS = "better-dh2e";

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
    locations: Array.isArray(o.locations) ? o.locations.filter((l) => LOCATION_KEYS.includes(l)) : [...LOCATION_KEYS],
  };
}

/** Coerce arbitrary (persisted/untrusted) data into a valid template: loose-parse AP (e.g. "5") then clamp ≥ 0,
 *  whitelist locations, fall back name→"Cover"/colour. A legacy `sides` field is dropped, not carried
 *  forward. Looser than newTemplate by design. */
export function validateTemplate(t) {
  let ap = parseInt(t?.ap, 10);
  if (!Number.isFinite(ap) || ap < 0) ap = 0;
  return {
    id: t?.id ?? null,
    name: typeof t?.name === "string" && t.name.trim() ? t.name.trim() : "Cover",
    color: typeof t?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : DEFAULT_COLOR,
    ap,
    locations: Array.isArray(t?.locations) ? LOCATION_KEYS.filter((l) => t.locations.includes(l)) : [],
  };
}

/** One-line summary for a manager row, e.g. "AP4 · Right Leg, Left Leg". */
export function summarizeTemplate(t) {
  const locs = !t.locations?.length
    ? "—"
    : t.locations.length === LOCATION_KEYS.length
      ? "all"
      : t.locations.map((l) => LOCATION_LABELS[l]).join(", ");
  return `AP${t.ap} · ${locs}`;
}

/** Pre-fill value for the cover-AP prompt: the piece's AP when a hit struck a location it protects,
 *  else 0. There is no side test — adjacency has already established the piece is on the shot's side.
 *  A null piece (manual In Cover) pre-fills 0 for the GM to type. */
export function coverPrefill(piece, hitLocations) {
  if (!piece) return 0;
  const protectedHit = (hitLocations ?? []).some((l) => piece.locations?.includes(l));
  return protectedHit ? (Number(piece.ap) || 0) : 0;
}

/** Human context line for the cover prompt, e.g.
 *  "Shot approached from N · protects Right Leg, Left Leg". */
export function coverContextLabel(piece, approachSide) {
  const from = approachSide ? SIDE_LABELS[approachSide] : "unknown";
  const locs = piece?.locations?.length ? piece.locations.map((l) => LOCATION_LABELS[l]).join(", ") : "nothing";
  return `Shot approached from ${from} · protects ${locs}`;
}

/**
 * Compact display grouping of a piece's protected locations, for the on-canvas H A B L badge.
 * `a` and `l` mean "at least one" — a piece protecting only the right arm still lights A. That can
 * over-promise on a half-ticked limb pair; the exact list stays available in the template summary
 * and the damage prompt's context line.
 * @param {string[]} locations
 * @returns {{h: boolean, a: boolean, b: boolean, l: boolean}}
 */
export function locationBadge(locations) {
  const set = new Set(locations ?? []);
  return {
    h: set.has("head"),
    a: set.has("rightArm") || set.has("leftArm"),
    b: set.has("body"),
    l: set.has("rightLeg") || set.has("leftLeg"),
  };
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
