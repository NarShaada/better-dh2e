// scripts/canvas/cover.mjs — cover-piece Regions: create, adjacency lookup, AP lookup, clear, placement.
import { adjacentCellsOnSide, isLegacyCoverFlag } from "../helpers/cover.mjs";
import { beginCellMode, endCellMode } from "./cell-mode.mjs";

const NS = "better-dh2e";

/** Is this Region one of our cover pieces? */
export function isCoverRegion(region) {
  return !!region?.flags?.[NS]?.cover?.isCover;
}

/** The cover payload stored on a Region (or null). */
export function coverFlag(region) {
  return region?.flags?.[NS]?.cover ?? null;
}

/** Cover automation enabled? */
export function coverMechanicsEnabled() {
  return game.settings.get(NS, "coverMechanics") === true;
}

/** Create a single-cell cover Region snapshotting a template at the cell containing `point` (scene px). */
export async function createCoverPiece(scene, point, template) {
  const tl = canvas.grid.getTopLeftPoint(point);
  const width = canvas.grid.sizeX;
  const height = canvas.grid.sizeY;
  const cover = {
    isCover: true,
    name: template.name,
    color: template.color,
    ap: template.ap,
    locations: [...template.locations],
  };
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: template.name,
    color: template.color,
    shapes: [{ type: "rectangle", x: Math.round(tl.x), y: Math.round(tl.y), width, height }],
    elevation: { bottom: 0, top: null },
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    flags: { [NS]: { cover } },
  }]);
  return region;
}

/** Delete every cover Region on a scene. Returns the count removed. */
export async function clearAllCover(scene) {
  if (!scene) return 0;
  const ids = scene.regions.filter(isCoverRegion).map((r) => r.id);
  if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  return ids.length;
}

/** Delete phase-2 cover pieces from a scene. Returns how many were removed. */
export async function clearLegacyCover(scene) {
  if (!scene) return 0;
  const ids = scene.regions
    .filter((r) => isCoverRegion(r) && isLegacyCoverFlag(coverFlag(r)))
    .map((r) => r.id);
  if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  return ids.length;
}

/**
 * Clean up phase-2 auto-marking residue on tokens: the deleted updateTokenCover used to write
 * flags.better-dh2e.coverAuto on a token and force its actor's In Cover status on. Both functions are
 * gone, but that data is not — an upgraded world's tokens would otherwise keep a forced In Cover status
 * (and dead flag) forever, silently re-triggering the cover prompt on every damage application.
 * Returns how many tokens were cleaned.
 */
async function clearLegacyCoverTokenResidue(scene) {
  if (!scene) return 0;
  let n = 0;
  for (const token of scene.tokens) {
    if (!token.getFlag(NS, "coverAuto")) continue;
    if (token.actor?.statuses?.has?.("inCover")) {
      await token.actor.toggleStatusEffect("inCover", { active: false });
    }
    await token.unsetFlag(NS, "coverAuto");
    n++;
  }
  return n;
}

/** Is this client the GM responsible for shared writes? (avoids every connected GM racing the same update) */
function isPrimaryGM() {
  return game.user.isGM && (game.users.activeGM?.id === game.user.id);
}

/** The cover Regions occupying a given grid cell. */
function coverRegionsAtCell(scene, cell) {
  const px = canvas.grid.getTopLeftPoint({ i: cell.y, j: cell.x });
  const cx = px.x + canvas.grid.sizeX / 2;
  const cy = px.y + canvas.grid.sizeY / 2;
  return scene.regions.filter((r) => {
    if (!isCoverRegion(r)) return false;
    const s = r.shapes?.[0];
    return s?.type === "rectangle"
      && cx >= s.x && cx < s.x + s.width
      && cy >= s.y && cy < s.y + s.height;
  });
}

/**
 * The highest-AP cover Region sitting in a cell adjacent to this token on `side`, or null.
 * `side` is the shot's approach side from facingFromDelta — the direction the attack came FROM,
 * which is the direction the shielding obstacle must lie in.
 * Returns the RegionDocument, not its payload, so callers can degrade it; use coverFlag() for the
 * payload.
 */
export function coverPieceAdjacentTo(tokenDoc, side) {
  if (!coverMechanicsEnabled() || !tokenDoc?.parent || !side) return null;
  const origin = canvas.grid.getOffset({ x: tokenDoc.x, y: tokenDoc.y });
  const footprint = { x: origin.j, y: origin.i, width: tokenDoc.width, height: tokenDoc.height };
  const regions = adjacentCellsOnSide(footprint, side)
    .flatMap((cell) => coverRegionsAtCell(tokenDoc.parent, cell))
    .filter((r) => coverFlag(r));
  if (!regions.length) return null;
  return regions.reduce((best, r) =>
    ((Number(coverFlag(r).ap) || 0) > (Number(coverFlag(best).ap) || 0) ? r : best));
}

/**
 * Persist a degraded AP onto a cover piece, or destroy the piece when it reaches 0.
 * One call per damage application, not one per hit — same result, one overlay redraw.
 * Silently no-ops on a piece that has already left the scene (a GM deleting it mid-application).
 * A non-finite `newAp` (NaN, ±Infinity) is treated as destroy rather than persisted — `newAp <= 0` is
 * `false` for NaN, so without this check junk would land in the flag instead of removing the piece.
 */
export async function applyCoverDegradation(region, newAp) {
  if (!region?.parent?.regions?.get(region.id)) return;
  if (!Number.isFinite(newAp) || newAp <= 0) { await region.delete(); return; }
  await region.update({ [`flags.${NS}.cover.ap`]: newAp });
}

/** Paint one cell (skipping cells already covered) or erase every piece in it. */
async function applyBrushAtCell(scene, cell, erasing, template) {
  const existing = coverRegionsAtCell(scene, cell);
  if (erasing) {
    if (existing.length) await scene.deleteEmbeddedDocuments("Region", existing.map((r) => r.id));
  } else if (!existing.length) {
    const px = canvas.grid.getTopLeftPoint({ i: cell.y, j: cell.x });
    await createCoverPiece(scene, px, template);
  }
}

/** Begin painting cover pieces. Left paints, right erases, both drag; Escape exits. */
export function beginCoverPainting(template) {
  beginCellMode({
    notice: `Painting "${template.name}" — left-drag to paint, right-drag to erase, Esc to stop.`,
    onCell: (cell, button) => applyBrushAtCell(canvas.scene, cell, button === 2, template),
    owner: "cover-paint",
  });
}

/** Stop painting. Kept as a named export because the templates app calls it directly. */
export function endCoverPainting() {
  // Tagged: this only ever tears down painting's own mode. An untagged call here would end whatever
  // cell mode happens to be running — e.g. the templates manager's close handler silently killing
  // Cover Degradation after the GM switched tools without explicitly stopping painting first.
  endCellMode("cover-paint");
}

/**
 * Begin manual cover degradation: click or drag across cover pieces to knock 1 off each one's AP,
 * destroying any at 0. Left button only — right-click is deliberately unbound, so a misclick cannot
 * repair or erase. Escape exits.
 */
export function beginCoverDegrading() {
  // Dedupes by Region id, not by cell: a piece resized to span multiple cells (coverRegionsAtCell matches
  // by cell-centre containment) would otherwise fire one onCell per cell it occupies, and visit() in
  // cell-mode.mjs only dedupes by cell and doesn't await onCell — so a single drag across a 2-cell piece
  // could fire two concurrent degrade writes on the same Region. This Set is captured fresh in this
  // closure each time the tool starts, so it lives for the whole mode session, not per-stroke: degrading
  // the same piece a second time in one session requires re-selecting the tool. That's deliberately
  // conservative — a safer default for a destructive action than allowing a same-session repeat.
  const touchedThisSession = new Set();
  beginCellMode({
    notice: "Cover Degradation — click or drag to take 1 off each cover piece you touch, destroying it at 0. Esc to stop.",
    onCell: async (cell, button) => {
      if (button !== 0) return;
      const regions = coverRegionsAtCell(canvas.scene, cell).filter((r) => coverFlag(r));
      if (!regions.length) return;
      // Same tie-break as the adjacency lookup: the toughest piece in the cell is the one being shot.
      const region = regions.reduce((best, r) =>
        ((Number(coverFlag(r).ap) || 0) > (Number(coverFlag(best).ap) || 0) ? r : best));
      if (touchedThisSession.has(region.id)) return;
      touchedThisSession.add(region.id);
      const ap = Number(coverFlag(region).ap) || 0;
      if (ap <= 0) return;                       // an AP-0 piece has nothing left to lose
      await applyCoverDegradation(region, ap - 1);
    },
    owner: "cover-degrade",
  });
}

/**
 * Clear any phase-2 cover (pieces + the token residue they left behind) from the current scene and say
 * so once. Idempotent — a scene with nothing legacy on it is a silent no-op.
 */
export async function runLegacyCoverMigration() {
  if (!isPrimaryGM() || !coverMechanicsEnabled()) return;   // kept from Task 3
  const n = await clearLegacyCover(canvas.scene);
  const tokensCleaned = await clearLegacyCoverTokenResidue(canvas.scene);
  if (!n && !tokensCleaned) return;
  let msg = "Better DH2e:";
  if (n) {
    msg += ` removed ${n} old cover piece${n === 1 ? "" : "s"} from this scene — cover pieces are now the ` +
      `obstacle itself, repaint them where the cover actually is.`;
  }
  if (tokensCleaned) {
    msg += `${n ? " Also" : ""} cleared the old auto-applied In Cover status from ${tokensCleaned} token${tokensCleaned === 1 ? "" : "s"} on this scene.`;
  }
  ui.notifications.warn(msg);
}

/**
 * Run the legacy-cover migration on every scene the GM opens, including the one already loaded when the
 * world logs in. `Game#setupGame` awaits `initializeCanvas()` (which draws the current scene and fires
 * "canvasReady") *before* it calls "ready" — so a listener attached only inside Hooks.once("ready")
 * misses the "canvasReady" firing for the scene the GM is actually sitting on. Mirror the pattern
 * cover-overlay.mjs already uses for the same problem: register for future scene changes, then also run
 * once immediately if the canvas is already sitting there.
 */
export function registerLegacyCoverMigration() {
  Hooks.on("canvasReady", () => { runLegacyCoverMigration(); });
  if (canvas?.ready) runLegacyCoverMigration();
}
