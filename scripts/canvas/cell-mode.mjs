// scripts/canvas/cell-mode.mjs — take over canvas input and hand back grid cells.
// Extracted from the cover-painting mode so more than one tool can use it. Knows nothing about cover.

// canvas.stage is a *sibling* listener target to Foundry's own MouseInteractionManager (both are bound
// directly to canvas.stage, and Foundry's is registered first) — event.stopPropagation() only stops
// propagation between PIXI display-tree targets, not between sibling listeners on the same target, so it
// cannot suppress Foundry's own pan/click/drag handling. The actual suppression is the permissions gate
// below: MouseInteractionManager#can() reads this.permissions[action] and honours a plain boolean.
// NOTE: this only covers what can() actually gates. #handleLongPress calls its callback directly and
// unconditionally, without going through can("longPress", ...) — a "longPress" entry here would be inert,
// so it is deliberately omitted. A left-button-down held still mid-stroke can therefore still reach
// Foundry's own long-press handling; that gap is a known, separate, deferred concern.
const DENIED_ACTIONS = ["clickLeft", "clickLeft2", "clickRight", "clickRight2", "dragLeftStart", "dragRightStart"];

// { owner, onCell, onDown, onMove, onUp, onKey, onContext, visited, button,
//   mgr, mgrPermissions, tokensLayer, tokensInteractiveChildren, regionsLayer, regionsInteractiveChildren }
let _mode = null;

/** Cell key so a single drag never visits the same cell twice. */
function cellKey(cell) {
  return `${cell.x},${cell.y}`;
}

/** Grid cell under a scene-coordinate point. */
function cellAtPoint(point) {
  const o = canvas.grid.getOffset(point);
  return { x: o.j, y: o.i };
}

/** Deliver one cell to the mode's callback, at most once per cell per stroke. */
function visit(point) {
  const cell = cellAtPoint(point);
  const key = cellKey(cell);
  if (_mode.visited.has(key)) return;
  _mode.visited.add(key);
  Promise.resolve(_mode.onCell(cell, _mode.button)).catch((err) => {
    console.error("better-dh2e | cell mode callback failed", err);
    ui.notifications.error("Canvas tool: an action failed to save — see console.");
  });
}

/**
 * Begin a cell mode. Left and right buttons both drag; Escape exits.
 * @param {{notice: string, onCell: (cell: {x: number, y: number}, button: number) => any, owner?: string}} o
 *   `owner` tags this session so a later `endCellMode(owner)` from a *different* tool can't tear it down —
 *   see endCellMode for why that matters.
 */
export function beginCellMode({ notice, onCell, owner }) {
  if (!canvas?.ready) {
    ui.notifications.warn("Better DH2e: open a scene before using this tool.");
    return;
  }
  endCellMode();                   // tear down a previous session before starting this one
  ui.notifications.info(notice);

  // event.stopPropagation() is deliberately absent from onDown/onMove — see the DENIED_ACTIONS comment
  // above for why it would be a no-op. Suppression is the permissions gate + interactiveChildren toggles.
  const onDown = (event) => {
    if (!_mode) return;
    const btn = event.button ?? event.originalEvent?.button ?? 0;
    if (btn !== 0 && btn !== 2) return;
    _mode.button = btn;
    _mode.visited.clear();
    visit(event.getLocalPosition(canvas.stage));
  };
  const onMove = (event) => {
    if (!_mode || _mode.button === null) return;   // not stroking, or no button held
    visit(event.getLocalPosition(canvas.stage));
  };
  const onUp = () => { if (_mode) { _mode.button = null; _mode.visited.clear(); } };
  const onKey = (e) => { if (e.key === "Escape") endCellMode(); };
  const onContext = (e) => e.preventDefault();     // no browser/Foundry context menu while active

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
  // canvas.stage). Every placeable owns its OWN MouseInteractionManager (PlaceableObject#activateListeners
  // — where each placeable's own MouseInteractionManager is created), untouched by that gate — and these
  // tools live on the Tokens control group, so the Token layer is active and its tokens are interactive.
  // A left-drag across a token would take control of it (drag / ruler) before our stage handler sees the
  // stroke; a right-click on a token opens the Token HUD and calls stopPropagation
  // (PlaceableObject#_propagateRightClick returns false), so that cell would silently do nothing. Disable
  // each layer's interactivity instead — exactly what core's own InteractionLayer#deactivate does — and
  // restore it on every exit path. Cover pieces are Regions, so canvas.regions gets the same treatment in
  // case the GM is on that layer.
  const tokensLayer = canvas?.tokens;
  const regionsLayer = canvas?.regions;
  const tokensInteractiveChildren = tokensLayer ? tokensLayer.interactiveChildren : undefined;
  const regionsInteractiveChildren = regionsLayer ? regionsLayer.interactiveChildren : undefined;
  if (tokensLayer) tokensLayer.interactiveChildren = false;
  if (regionsLayer) regionsLayer.interactiveChildren = false;

  _mode = {
    owner, onCell, onDown, onMove, onUp, onKey, onContext, visited: new Set(), button: null,
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

/**
 * Stop the current cell mode and restore normal canvas interaction. Safe to call when inactive.
 * @param {string} [owner] When given, this is a no-op unless it matches the active mode's `owner` — so
 *   one tool's teardown can never end a *different* tool's mode (e.g. closing the cover-template manager
 *   after switching to the degradation tool must not silently kill degradation). Called with no argument
 *   it ends whatever mode is running regardless of owner — that is what beginCellMode's own
 *   previous-session teardown and the canvasReady/canvasTearDown guards below need, since they must be
 *   able to end any tool's mode, not just one tagged owner's.
 */
export function endCellMode(owner) {
  if (!_mode) return;
  if (owner !== undefined && _mode.owner !== owner) return;
  const m = _mode;
  _mode = null;                                     // clear first so a re-entrant call is a no-op
  canvas.stage.off("pointerdown", m.onDown);
  canvas.stage.off("pointermove", m.onMove);
  canvas.stage.off("pointerup", m.onUp);
  canvas.stage.off("pointerupoutside", m.onUp);
  window.removeEventListener("keydown", m.onKey);
  canvas.app?.view?.removeEventListener("contextmenu", m.onContext);
  if (m.mgr && m.mgrPermissions !== undefined) m.mgr.permissions = m.mgrPermissions;
  if (m.tokensLayer && m.tokensInteractiveChildren !== undefined) m.tokensLayer.interactiveChildren = m.tokensInteractiveChildren;
  if (m.regionsLayer && m.regionsInteractiveChildren !== undefined) m.regionsLayer.interactiveChildren = m.regionsInteractiveChildren;
}

/**
 * Stop the mode if the canvas goes out from under us — either a normal scene swap (canvasReady) or a
 * teardown to a blank/no scene, which returns before canvasReady would ever fire (canvasTearDown covers
 * that path). endCellMode is idempotent, so both hooks firing for the same transition is harmless.
 */
export function registerCellModeGuards() {
  Hooks.on("canvasReady", () => endCellMode());
  Hooks.on("canvasTearDown", () => endCellMode());
}
