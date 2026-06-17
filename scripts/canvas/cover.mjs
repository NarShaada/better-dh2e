// scripts/canvas/cover.mjs — cover-piece Regions: create, query overlap, AP lookup, clear, auto-mark, placement.
import { highestCoverAp, coverAutoDecision } from "../helpers/cover-templates.mjs";

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
    sides: [...template.sides],
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

/** Cover Regions whose area contains the token's footprint. */
export function coverRegionsForToken(tokenDoc) {
  if (!tokenDoc?.parent) return [];
  return tokenDoc.parent.regions.filter((r) => isCoverRegion(r) && tokenDoc.testInsideRegion(r));
}

/** Highest cover AP protecting an Actor's token (0 if mechanics off, no token, or not in cover). */
export function coverApForTarget(targetActor) {
  if (!coverMechanicsEnabled()) return 0;
  const token = targetActor?.getActiveTokens?.()?.[0];
  if (!token) return 0;
  const covers = coverRegionsForToken(token.document).map(coverFlag);
  return highestCoverAp(covers);
}

/** Delete every cover Region on a scene. Returns the count removed. */
export async function clearAllCover(scene) {
  if (!scene) return 0;
  const ids = scene.regions.filter(isCoverRegion).map((r) => r.id);
  if (ids.length) await scene.deleteEmbeddedDocuments("Region", ids);
  return ids.length;
}
