// test/region-templates.test.mjs
//
// Every area template (blast circle, spray / suppressing-fire cone, the blast aim preview) was
// created with `elevation: { bottom: 0, top: null }`, and containment checks elevation — so a token
// below elevation 0 (a trench, a basement) standing at a blast's centre was never caught, and the
// template was deleted as having "scattered into empty space". The system does not model height for
// area attacks, so its templates span every elevation.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { installFoundryStub } from "./helpers/foundry-stub.mjs";

let createBlastRegion, placeConeRegion, placeBlastRegion, placed;
beforeAll(async () => {
  installFoundryStub();
  ({ createBlastRegion, placeConeRegion, placeBlastRegion } = await import("../scripts/canvas/region.mjs"));
});
beforeEach(() => {
  placed = [];
  canvas.regions.placeRegion = async (data) => { placed.push(data); return null; };
  canvas.grid.getCenterPoint = (p) => p;
  canvas.mousePosition = { x: 50, y: 50 };
});

const UNBOUNDED = { bottom: null, top: null };

describe("area templates span every elevation", () => {
  it("a blast template", async () => {
    const created = [];
    const scene = { createEmbeddedDocuments: async (_type, docs) => { created.push(...docs); return docs; } };
    await createBlastRegion(scene, 100, 100, 3);
    expect(created[0].elevation).toEqual(UNBOUNDED);
  });

  it("a spray / suppressing-fire cone", async () => {
    await placeConeRegion({ center: { x: 0, y: 0 } }, 20, 30);
    expect(placed[0].elevation).toEqual(UNBOUNDED);
  });

  it("the blast aim preview", async () => {
    await placeBlastRegion(3);
    expect(placed[0].elevation).toEqual(UNBOUNDED);
  });

  // A blast catches anyone within its radius — a sphere, not a column. Where the height of the
  // impact is known (a targeted token), the template is that tall and no taller: a token standing
  // directly above or below the blast, further away than the radius, is not caught.
  it("a blast whose height is known reaches one radius up and one radius down", async () => {
    const created = [];
    const scene = { createEmbeddedDocuments: async (_type, docs) => { created.push(...docs); return docs; } };
    await createBlastRegion(scene, 100, 100, 3, { elevation: 10 });
    expect(created[0].elevation).toEqual({ bottom: 7, top: 13 });
  });

  it("a blast at ground level reaches into a pit no deeper than its radius", async () => {
    const created = [];
    const scene = { createEmbeddedDocuments: async (_type, docs) => { created.push(...docs); return docs; } };
    await createBlastRegion(scene, 100, 100, 3, { elevation: 0 });
    expect(created[0].elevation).toEqual({ bottom: -3, top: 3 });
  });

  // The data is handed to Foundry, which may keep and later write to it. One shared object would
  // let a change to one template's elevation leak into every template placed after it.
  it("each template gets its own elevation object", async () => {
    await placeBlastRegion(3);
    await placeConeRegion({ center: { x: 0, y: 0 } }, 20, 30);
    expect(placed[0].elevation).not.toBe(placed[1].elevation);
  });
});
