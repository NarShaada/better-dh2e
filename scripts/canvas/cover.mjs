// scripts/canvas/cover.mjs — cover-piece Regions: create, adjacency lookup, AP lookup, clear, placement.
import { adjacentCellsOnSide } from "../helpers/cover.mjs";

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
 * The highest-AP cover piece sitting in a cell adjacent to this token on `side`, or null.
 * `side` is the shot's approach side from facingFromDelta — the direction the attack came FROM,
 * which is the direction the shielding obstacle must lie in.
 */
export function coverPieceAdjacentTo(tokenDoc, side) {
  if (!coverMechanicsEnabled() || !tokenDoc?.parent || !side) return null;
  const origin = canvas.grid.getOffset({ x: tokenDoc.x, y: tokenDoc.y });
  const footprint = { x: origin.j, y: origin.i, width: tokenDoc.width, height: tokenDoc.height };
  const covers = adjacentCellsOnSide(footprint, side)
    .flatMap((cell) => coverRegionsAtCell(tokenDoc.parent, cell))
    .map(coverFlag)
    .filter(Boolean);
  if (!covers.length) return null;
  return covers.reduce((best, c) => ((Number(c.ap) || 0) > (Number(best.ap) || 0) ? c : best));
}

let _placement = null;   // active placement session { template, onDown, onKey }

/** Begin click-to-stamp placement of a template. Left-click = one piece; right-click / Esc = stop. */
export function beginCoverPlacement(template) {
  endCoverPlacement();
  ui.notifications.info(`Placing "${template.name}" — left-click cells, right-click or Esc to stop.`);
  const onDown = async (event) => {
    // Foundry v13/v14 uses PIXI v7 FederatedPointerEvent — button + getLocalPosition live on the event itself.
    const btn = event.button ?? event.originalEvent?.button ?? 0;
    if (btn === 2) { endCoverPlacement(); return; }       // right-click cancels
    if (btn !== 0) return;
    const p = event.getLocalPosition(canvas.stage);       // scene coordinates
    await createCoverPiece(canvas.scene, p, template);
  };
  const onKey = (e) => { if (e.key === "Escape") endCoverPlacement(); };
  _placement = { template, onDown, onKey };
  canvas.stage.eventMode = "static";
  canvas.stage.on("pointerdown", onDown);
  window.addEventListener("keydown", onKey);
}

/** Stop any active placement session. */
export function endCoverPlacement() {
  if (!_placement) return;
  canvas.stage.off("pointerdown", _placement.onDown);
  window.removeEventListener("keydown", _placement.onKey);
  _placement = null;
}
