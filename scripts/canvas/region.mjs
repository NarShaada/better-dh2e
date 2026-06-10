// scripts/canvas/region.mjs — AoE Region helpers (v14: templates are Region docs, not MeasuredTemplate).
const NS = "better-dh2e";

/** Create a circle Region of `radiusMetres` centered at {x,y} (scene pixels). Returns the RegionDocument. */
export async function createBlastRegion(scene, x, y, radiusMetres, { kind = "blast" } = {}) {
  const radiusPx = radiusMetres * canvas.dimensions.distancePixels;
  const [region] = await scene.createEmbeddedDocuments("Region", [{
    name: `Blast (${radiusMetres})`,
    color: "#ff6600",
    shapes: [{ type: "circle", x: Math.round(x), y: Math.round(y), radius: radiusPx }],
    elevation: { bottom: 0, top: null },
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    flags: { [NS]: { kind } },
  }]);
  return region;
}

/** Tokens whose footprint is inside the region. */
export function tokensInRegion(region) {
  if (!region) return [];
  return canvas.tokens.placeables.filter((t) => t.actor && t.document.testInsideRegion(region));
}

/** Delete a region by uuid (cleanup after applying blast damage). */
export async function deleteRegionByUuid(uuid) {
  const region = uuid ? await fromUuid(uuid) : null;
  if (region) await region.delete();
}
