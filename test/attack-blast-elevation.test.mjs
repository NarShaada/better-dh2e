// test/attack-blast-elevation.test.mjs
//
// Which height a blast template is given. A blast catches whoever is within its radius of the
// impact; on a map that uses elevation that means up and down as well as sideways.
//   - Aimed at a TOKEN, the impact is at that token's height, so the template spans one radius
//     either side of it.
//   - Aimed at a bare TILE there is no height to go on, so the template spans every elevation and
//     the GM rules on anything flying or underground.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { installFoundryStub, resetCaptures, primeDice, registerUuid, makeWeapon, makeActor, makeChoice } from "./helpers/foundry-stub.mjs";

let resolveAttack, regions;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true } });
  ({ resolveAttack } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => {
  resetCaptures();
  regions = [];
  canvas.scene = { id: "s1", createEmbeddedDocuments: async (_type, docs) => docs.map((d) => {
    const region = { ...d, uuid: `Scene.s1.Region.r${regions.length}`, async delete() {} };
    regions.push(region); registerUuid(region.uuid, region);
    return region;
  }) };
});
afterEach(() => {
  canvas.scene = null; canvas.tokens.placeables = [];
  game.user.targets = { first: () => null };
});

const grenade = () => makeWeapon({ system: { weaponClass: "thrown", damage: "2d10", damageType: "explosive", qualities: [{ key: "blast", value: 3 }], range: 20 } });
function tokenAt(elevation) {
  const actor = makeActor({ name: "Target" });
  registerUuid(actor.uuid, actor);
  return { actor, name: actor.name, center: { x: 300, y: 300 }, document: { elevation, testInsideRegion: () => true } };
}

describe("the height of a blast template", () => {
  it("aimed at a token: one radius either side of that token's elevation", async () => {
    const token = tokenAt(10);
    canvas.tokens.placeables = [token];
    game.user.targets = { first: () => token };
    primeDice([5]);

    await resolveAttack(makeActor(), grenade(), makeChoice(), { consumeAmmo: true });

    expect(regions[0].elevation).toEqual({ bottom: 7, top: 13 });
  });

  it("a miss scatters sideways, at the same height", async () => {
    const token = tokenAt(-4);
    canvas.tokens.placeables = [token];
    game.user.targets = { first: () => token };
    primeDice([97, 3, 6]);                               // miss, then scatter distance and direction

    await resolveAttack(makeActor(), grenade(), makeChoice(), { consumeAmmo: true });

    expect(regions[0].elevation).toEqual({ bottom: -7, top: -1 });
  });

  it("aimed at a bare tile: every elevation", async () => {
    canvas.tokens.placeables = [tokenAt(25)];
    primeDice([5]);

    await resolveAttack(makeActor(), grenade(), makeChoice(), { consumeAmmo: true, aimPoint: { x: 300, y: 300 } });

    expect(regions[0].elevation).toEqual({ bottom: null, top: null });
  });
});
