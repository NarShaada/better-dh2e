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

/** Interactively place a cone Region (apex at the shooter, aimed at the cursor). Returns RegionDocument or null. */
export async function placeConeRegion(originToken, lengthMetres, angle = 30, { kind = "spray" } = {}) {
  const radiusPx = lengthMetres * canvas.dimensions.distancePixels;
  const { x, y } = originToken.center;
  const data = {
    name: "Spray", color: "#ff9900",
    shapes: [{ type: "cone", x: Math.round(x), y: Math.round(y), radius: radiusPx, angle, rotation: 0, curvature: "flat" }],
    elevation: { bottom: 0, top: null },
    visibility: CONST.REGION_VISIBILITY.ALWAYS, highlightMode: "coverage",
    flags: { [NS]: { kind } },
  };
  return canvas.regions.placeRegion(data, {
    onMove: ({ shape, position }) => {
      const rot = (Math.atan2(position.y - y, position.x - x) * 180) / Math.PI;   // aim toward cursor (0° = +x)
      shape.updateSource({ x: Math.round(x), y: Math.round(y), rotation: rot });
      return false;   // take over: keep the apex pinned to the shooter
    },
  });
}

/**
 * Interactively place a circle Region at the cursor, snapped to the grid cell centre.
 * Mirrors placeConeRegion's contract: returns the RegionDocument, or null if the player cancels.
 *
 * Callers that only want an aimed POINT should read the returned region's shape centre and delete it
 * straight away — a blast's real radius is not known until the attack dialog has been answered.
 */
export async function placeBlastRegion(radiusMetres, { kind = "blast" } = {}) {
  const radiusPx = radiusMetres * canvas.dimensions.distancePixels;
  // Seed the shape from the current cursor, snapped the same way onMove does — onMove returns false
  // ("we position, core does not"), so if a click confirms before any pointermove fires, this seed
  // is the ONLY position the shape ever gets. Left at {0,0} that seed is the scene's top-left corner.
  // Fall back to the scene centre (still a valid on-map point) when canvas.mousePosition isn't
  // available yet — never the origin.
  const seed = canvas.mousePosition
    ? canvas.grid.getCenterPoint(canvas.mousePosition)
    : { x: canvas.dimensions.width / 2, y: canvas.dimensions.height / 2 };
  const data = {
    name: `Blast (${radiusMetres})`, color: "#ff6600",
    shapes: [{ type: "circle", x: Math.round(seed.x), y: Math.round(seed.y), radius: radiusPx }],
    elevation: { bottom: 0, top: null },
    visibility: CONST.REGION_VISIBILITY.ALWAYS, highlightMode: "coverage",
    flags: { [NS]: { kind } },
  };
  return canvas.regions.placeRegion(data, {
    onMove: ({ shape, position }) => {
      const c = canvas.grid.getCenterPoint(position);      // snap to the cell the cursor is over
      shape.updateSource({ x: Math.round(c.x), y: Math.round(c.y) });
      return false;   // take over positioning: we snap, core does not
    },
  });
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
