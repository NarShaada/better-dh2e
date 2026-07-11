// scripts/canvas/vehicle-facing.mjs — vehicle token facing: a front-arrow indicator drawn on the token
// and two Token-HUD buttons to turn in 45° steps. Facing lives in the token flag `better-dh2e.facing`
// (degrees, clockwise from north) so the art never spins and the value feeds the armour-arc math.
// Always on for vehicle tokens (not battlemap-gated) — vehicle battlemap play is meant to be default.
import { turnFacing, facingVector } from "../helpers/facing.mjs";

const NS = "better-dh2e";

/** Read a token's facing (degrees). */
export function tokenFacing(tokenDoc) {
  return Number(tokenDoc?.getFlag?.(NS, "facing") ?? tokenDoc?.flags?.[NS]?.facing ?? 0) || 0;
}

const isVehicle = (tokenDoc) => tokenDoc?.actor?.type === "vehicle";

/** Draw / refresh the front-arrow child on a vehicle token (removed from non-vehicles). */
function drawTokenFacing(token) {
  if (!token) return;
  if (!isVehicle(token.document)) {
    if (token._bdhFacing) { token._bdhFacing.destroy(); token._bdhFacing = null; }
    return;
  }
  let g = token._bdhFacing;
  if (!g || g.destroyed) g = token._bdhFacing = token.addChild(new PIXI.Graphics());
  g.clear();
  const v = facingVector(tokenFacing(token.document));
  const cx = token.w / 2, cy = token.h / 2;
  const r = Math.min(token.w, token.h) / 2;
  const perp = { x: -v.y, y: v.x };
  const bw = Math.max(6, Math.min(token.w, token.h) * 0.13);   // arrow half-width
  const tip = { x: cx + v.x * (r - 1), y: cy + v.y * (r - 1) };
  const back = { x: cx + v.x * (r - 13), y: cy + v.y * (r - 13) };
  g.beginFill(0xffcc44, 0.95);
  g.lineStyle(1.5, 0x1a1207, 0.9);
  g.moveTo(tip.x, tip.y);
  g.lineTo(back.x + perp.x * bw, back.y + perp.y * bw);
  g.lineTo(back.x - perp.x * bw, back.y - perp.y * bw);
  g.closePath();
  g.endFill();
}

/** Add the two turn buttons to a vehicle token's HUD. */
function onRenderTokenHUD(hud, html) {
  const token = hud.object;
  if (!isVehicle(token?.document)) return;
  if (!token.document.canUserModify(game.user, "update")) return;   // only those who can turn it
  const root = html instanceof HTMLElement ? html : html?.[0];
  const col = root?.querySelector(".col.left") ?? root;
  if (!col) return;
  const mk = (title, icon, delta) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "control-icon bdh-turn";
    b.dataset.tooltip = title;
    b.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      await token.document.update({ [`flags.${NS}.facing`]: turnFacing(tokenFacing(token.document), delta) });
    });
    return b;
  };
  col.append(
    mk("Turn 45° counter-clockwise", "fa-rotate-left", -45),
    mk("Turn 45° clockwise", "fa-rotate-right", 45)
  );
}

/** Register the facing hooks. Call once at ready. */
export function initVehicleFacing() {
  Hooks.on("refreshToken", (token) => drawTokenFacing(token));
  Hooks.on("updateToken", (doc, changes) => {
    if (foundry.utils.hasProperty(changes, `flags.${NS}.facing`)) drawTokenFacing(doc.object);
  });
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
  for (const t of canvas?.tokens?.placeables ?? []) drawTokenFacing(t);
}
