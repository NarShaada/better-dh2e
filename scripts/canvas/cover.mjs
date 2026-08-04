// scripts/canvas/cover.mjs — cover-piece Regions: create, adjacency lookup, AP lookup, clear, placement.
import { adjacentCellsOnSide, isLegacyCoverFlag } from "../helpers/cover.mjs";

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

// { template, onDown, onMove, onUp, onKey, onContext, painted, erasing,
//   mgr, mgrPermissions, tokensLayer, tokensInteractiveChildren, regionsLayer, regionsInteractiveChildren }
let _painting = null;

// canvas.stage is a *sibling* listener target to Foundry's own MouseInteractionManager (both are bound
// directly to canvas.stage, and Foundry's is registered first) — event.stopPropagation() only stops
// propagation between PIXI display-tree targets, not between sibling listeners on the same target, so it
// cannot suppress Foundry's own pan/click/drag handling. The actual suppression is the permissions gate
// below: MouseInteractionManager#can() reads this.permissions[action] and honours a plain boolean.
// NOTE: this only covers what can() actually gates. #handleLongPress calls its callback directly and
// unconditionally, without going through can("longPress", ...) — a "longPress" entry here would be inert,
// so it is deliberately omitted. A left-button-down held still mid-stroke can therefore still reach
// Foundry's own long-press handling; that gap is a known, separate, deferred concern, not something this
// list can close.
const DENIED_ACTIONS = ["clickLeft", "clickLeft2", "clickRight", "clickRight2", "dragLeftStart", "dragRightStart"];

/** Cell key so a single drag never paints the same cell twice. */
function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

/** Grid cell under a scene-coordinate point. */
function cellAtPoint(point) {
  const o = canvas.grid.getOffset(point);
  return { x: o.j, y: o.i };
}

/** Paint one cell (skipping cells already covered) or erase every piece in it. */
async function applyBrushAt(point, erasing) {
  const scene = canvas.scene;
  const cell = cellAtPoint(point);
  const key = cellKey(cell);
  if (_painting.painted.has(key)) return;      // one visit per cell per stroke
  _painting.painted.add(key);
  const existing = coverRegionsAtCell(scene, cell);
  if (erasing) {
    if (existing.length) await scene.deleteEmbeddedDocuments("Region", existing.map((r) => r.id));
  } else if (!existing.length) {
    await createCoverPiece(scene, point, _painting.template);
  }
}

/** Begin painting. Left paints, right erases, both drag; Escape exits. */
export function beginCoverPainting(template) {
  if (!canvas?.ready) {
    ui.notifications.warn("Better DH2e: open a scene before painting cover.");
    return;
  }
  endCoverPainting();                   // tear down a previous session before starting this one
  ui.notifications.info(`Painting "${template.name}" — left-drag to paint, right-drag to erase, Esc to stop.`);

  // event.stopPropagation() is deliberately absent from onDown/onMove — see the DENIED_ACTIONS comment
  // below for why it would be a no-op here. Suppression is the permissions gate + interactiveChildren
  // toggles further down, not this call.
  const onDown = (event) => {
    if (!_painting) return;
    const btn = event.button ?? event.originalEvent?.button ?? 0;
    if (btn !== 0 && btn !== 2) return;
    _painting.erasing = btn === 2;
    _painting.painted.clear();
    applyBrushAt(event.getLocalPosition(canvas.stage), _painting.erasing).catch((err) => {
      console.error("better-dh2e | cover paint stroke failed", err);
      ui.notifications.error("Cover painting: a stroke failed to save — see console.");
    });
  };
  const onMove = (event) => {
    if (!_painting || _painting.erasing === null) return;   // not painting, or no button held
    applyBrushAt(event.getLocalPosition(canvas.stage), _painting.erasing).catch((err) => {
      console.error("better-dh2e | cover paint stroke failed", err);
      ui.notifications.error("Cover painting: a stroke failed to save — see console.");
    });
  };
  const onUp = () => { if (_painting) { _painting.erasing = null; _painting.painted.clear(); } };
  const onKey = (e) => { if (e.key === "Escape") endCoverPainting(); };
  const onContext = (e) => e.preventDefault();     // no browser/Foundry context menu while painting

  // Snapshot and gate the canvas's own interaction permissions so Foundry can't also pan/click/drag
  // underneath our listeners. Only touch it if a manager actually exists; only restore what we captured,
  // and restore onto the same manager instance we modified — not whatever canvas.mouseInteractionManager
  // happens to resolve to at exit time.
  const mgr = canvas?.mouseInteractionManager;
  const mgrPermissions = mgr ? mgr.permissions : undefined;
  if (mgr) {
    const denied = { ...mgr.permissions };
    for (const action of DENIED_ACTIONS) denied[action] = false;
    mgr.permissions = denied;
  }

  // The permissions gate above only covers canvas.mouseInteractionManager (the board manager on
  // canvas.stage). Every placeable owns its OWN MouseInteractionManager
  // (PlaceableObject#activateListeners), untouched by that gate — and the cover tools live on the Tokens
  // control group, so the Token layer is active and its tokens are interactive. A left-drag across a
  // token would take control of it (drag / ruler) before our stage handler sees the stroke; a right-click
  // on a token opens the Token HUD and calls stopPropagation (PlaceableObject#_propagateRightClick
  // returns false), so that cell would silently fail to erase. Disable each layer's interactivity
  // instead — exactly what core's own InteractionLayer#deactivate does — and restore it on every exit
  // path. Cover pieces are Regions, so canvas.regions gets the same treatment in case the GM is on that
  // layer. Snapshot each layer's own value, and guard for the layer being absent.
  const tokensLayer = canvas?.tokens;
  const regionsLayer = canvas?.regions;
  const tokensInteractiveChildren = tokensLayer ? tokensLayer.interactiveChildren : undefined;
  const regionsInteractiveChildren = regionsLayer ? regionsLayer.interactiveChildren : undefined;
  if (tokensLayer) tokensLayer.interactiveChildren = false;
  if (regionsLayer) regionsLayer.interactiveChildren = false;

  _painting = {
    template, onDown, onMove, onUp, onKey, onContext, painted: new Set(), erasing: null,
    mgr, mgrPermissions, tokensLayer, tokensInteractiveChildren, regionsLayer, regionsInteractiveChildren,
  };
  canvas.stage.eventMode = "static";
  canvas.stage.on("pointerdown", onDown);
  canvas.stage.on("pointermove", onMove);
  canvas.stage.on("pointerup", onUp);
  canvas.stage.on("pointerupoutside", onUp);
  window.addEventListener("keydown", onKey);
  canvas.app.view.addEventListener("contextmenu", onContext);
}

/** Stop painting and restore normal canvas interaction. Safe to call when not painting. */
export function endCoverPainting() {
  if (!_painting) return;
  const p = _painting;
  _painting = null;                                 // clear first so a re-entrant call is a no-op
  canvas.stage.off("pointerdown", p.onDown);
  canvas.stage.off("pointermove", p.onMove);
  canvas.stage.off("pointerup", p.onUp);
  canvas.stage.off("pointerupoutside", p.onUp);
  window.removeEventListener("keydown", p.onKey);
  canvas.app?.view?.removeEventListener("contextmenu", p.onContext);
  if (p.mgr && p.mgrPermissions !== undefined) p.mgr.permissions = p.mgrPermissions;
  if (p.tokensLayer && p.tokensInteractiveChildren !== undefined) p.tokensLayer.interactiveChildren = p.tokensInteractiveChildren;
  if (p.regionsLayer && p.regionsInteractiveChildren !== undefined) p.regionsLayer.interactiveChildren = p.regionsInteractiveChildren;
}

/**
 * Stop painting if the canvas goes out from under us — either a normal scene swap (canvasReady) or a
 * teardown to a blank/no scene, which returns before canvasReady would ever fire (canvasTearDown covers
 * that path). endCoverPainting is idempotent, so both hooks firing for the same transition is harmless.
 */
export function registerCoverPaintingGuards() {
  Hooks.on("canvasReady", () => endCoverPainting());
  Hooks.on("canvasTearDown", () => endCoverPainting());
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
