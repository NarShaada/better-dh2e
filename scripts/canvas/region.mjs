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
    highlightMode: "coverage",   // fill the grid squares the blast actually covers (vs just an outline)
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
  if (!uuid) return;
  try {
    const region = await fromUuid(uuid);
    if (region) await region.delete();
  } catch (err) {
    console.warn("Better DH2e | failed to delete blast region:", uuid, err);
  }
}
