// scripts/canvas/cover-overlay.mjs — draws cover pieces (AP label + location badge) on the canvas.
// The Region itself stays a faint tint; this overlay is the visible cover piece. Per-client visibility toggle.
import { isCoverRegion, coverFlag, coverMechanicsEnabled } from "./cover.mjs";
import { locationBadge } from "../helpers/cover-templates.mjs";

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

const BADGE = [["h", "H"], ["a", "A"], ["b", "B"], ["l", "L"]];

function drawPiece(layer, shape, cover) {
  const { x, y, width: w, height: h } = shape;

  // A single outline: the piece is an obstacle now, so no side is special.
  const g = new PIXI.Graphics();
  g.lineStyle(3, 0xffcc44, 0.9);
  g.beginFill(0x000000, 0.15);
  g.drawRect(x, y, w, h);
  g.endFill();
  layer.addChild(g);

  // AP, sitting a little above centre to leave room for the badge row.
  const ap = new PIXI.Text(String(cover.ap ?? 0), {
    fontFamily: "Georgia, serif",
    fontSize: Math.round(Math.min(w, h) * 0.32),
    fontWeight: "bold",
    fill: 0xffe08a,
    stroke: 0x1a1207,
    strokeThickness: 3,
  });
  ap.anchor.set(0.5);
  ap.position.set(x + w / 2, y + h * 0.38);
  layer.addChild(ap);

  // H A B L — bright where the piece covers that group, dim where it does not.
  const badge = locationBadge(cover.locations);
  const size = Math.round(Math.min(w, h) * 0.17);
  const gap = size * 1.25;
  const startX = x + w / 2 - (gap * (BADGE.length - 1)) / 2;
  for (const [i, [key, glyph]] of BADGE.entries()) {
    const on = badge[key];
    const t = new PIXI.Text(glyph, {
      fontFamily: "Georgia, serif",
      fontSize: size,
      fontWeight: "bold",
      fill: on ? 0xffe08a : 0x6b6357,
      stroke: 0x1a1207,
      strokeThickness: 2,
    });
    t.anchor.set(0.5);
    t.position.set(startX + gap * i, y + h * 0.72);
    layer.addChild(t);
  }
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
/** Hook the overlay to canvas readiness and cover-Region changes. Call once at ready. */
export function initCoverOverlay() {
  Hooks.on("canvasReady", () => { _layer = null; redrawCoverOverlay(); });
  const onRegion = (region) => { if (isCoverRegion(region)) redrawCoverOverlay(); };
  Hooks.on("createRegion", onRegion);
  Hooks.on("updateRegion", onRegion);
  Hooks.on("deleteRegion", onRegion);
  if (canvas?.ready) redrawCoverOverlay();
}
