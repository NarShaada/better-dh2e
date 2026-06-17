// scripts/canvas/cover-overlay.mjs — draws cover pieces (protected-side borders + AP label) on the canvas.
// The Region itself stays a faint tint; this overlay is the visible cover piece. Per-client visibility toggle.
import { isCoverRegion, coverFlag, coverMechanicsEnabled } from "./cover.mjs";

let _layer = null;
let _visible = true;

function ensureLayer() {
  if (_layer && !_layer.destroyed) return _layer;
  _layer = new PIXI.Container();
  _layer.eventMode = "none";        // never intercept canvas interaction
  _layer.visible = _visible;
  canvas.interface.addChild(_layer); // interface group = scene coordinates, above tokens; pans/zooms automatically
  return _layer;
}

function drawPiece(layer, shape, cover) {
  const { x, y, width: w, height: h } = shape;
  const protectedSides = new Set(cover.sides ?? []);
  const g = new PIXI.Graphics();
  // edges: gold + thick if protected, dim + thin otherwise. order: n(top) e(right) s(bottom) w(left)
  const edges = [
    ["n", x, y, x + w, y],
    ["e", x + w, y, x + w, y + h],
    ["s", x, y + h, x + w, y + h],
    ["w", x, y, x, y + h],
  ];
  for (const [key, x1, y1, x2, y2] of edges) {
    const on = protectedSides.has(key);
    g.lineStyle(on ? 6 : 2, on ? 0xffcc44 : 0x5b6b7d, on ? 0.95 : 0.5);
    g.moveTo(x1, y1).lineTo(x2, y2);
  }
  layer.addChild(g);
  // AP label, centred
  const label = new PIXI.Text(String(cover.ap ?? 0), {
    fontFamily: "Georgia, serif",
    fontSize: Math.round(Math.min(w, h) * 0.34),
    fontWeight: "bold",
    fill: 0xffe08a,
    stroke: 0x1a1207,
    strokeThickness: 3,
  });
  label.anchor.set(0.5);
  label.position.set(x + w / 2, y + h / 2);
  layer.addChild(label);
}

/** Rebuild the whole cover overlay from the current scene's cover Regions. */
export function redrawCoverOverlay() {
  if (!canvas?.ready) return;
  const layer = ensureLayer();
  for (const child of layer.removeChildren()) child.destroy();
  if (!coverMechanicsEnabled()) return;
  for (const region of canvas.scene.regions) {
    if (!isCoverRegion(region)) continue;
    const shape = region.shapes?.[0];
    if (!shape || shape.type !== "rectangle") continue;
    drawPiece(layer, shape, coverFlag(region));
  }
}

/** Per-client: show/hide the cover overlay (does not change any document). */
export function setCoverVisibility(v) {
  _visible = !!v;
  if (_layer) _layer.visible = _visible;
}
export function toggleCoverVisibility() {
  setCoverVisibility(!_visible);
  ui.notifications.info(`Cover pieces ${_visible ? "shown" : "hidden"}.`);
}
export function coverVisible() {
  return _visible;
}

/** Hook the overlay to canvas readiness and cover-Region changes. Call once at ready. */
export function initCoverOverlay() {
  Hooks.on("canvasReady", () => { _layer = null; redrawCoverOverlay(); });
  const onRegion = (region) => { if (isCoverRegion(region)) redrawCoverOverlay(); };
  Hooks.on("createRegion", onRegion);
  Hooks.on("updateRegion", onRegion);
  Hooks.on("deleteRegion", onRegion);
  if (canvas?.ready) redrawCoverOverlay();
}
