// test/weapon-parts-sync.test.mjs
//
// A weapon caches the effects of its installed mods and stocked ammunition; when the SOURCE item is
// edited, parts.mjs refreshes every weapon that links to it. It looked for those weapons in the
// world Items directory and on world actors only — so a weapon on an UNLINKED token (a synthetic
// actor, which lives in neither) kept its zeroed cache forever: add a mod on an NPC token's weapon,
// set it to +10 to hit, and the weapon never learned about it.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { installFoundryStub, makeActor, makeWeapon } from "./helpers/foundry-stub.mjs";

let refreshWeaponsReferencing, purgeDeletedPartSource;
beforeAll(async () => {
  installFoundryStub();
  ({ refreshWeaponsReferencing, purgeDeletedPartSource } = await import("../scripts/weapons/parts.mjs"));
});
afterEach(() => {
  game.actors = [];
  canvas.tokens.placeables = [];
});

const SOURCE = {
  uuid: "Item.red-dot", type: "weaponMod", name: "Red-dot Sight",
  system: { attackMod: 10, damageMod: "", penMod: 0, special: "" },
};
/** A weapon holding a freshly added (still zeroed) link to SOURCE, on an actor. */
function armed() {
  const weapon = makeWeapon({ system: { mods: [{ uuid: SOURCE.uuid, name: "New Weapon Mod", attackMod: 0, damageMod: "", penMod: 0, special: "" }], ammo: [] } });
  return { weapon, actor: makeActor({ items: [weapon] }) };
}

describe("refreshing weapons when a part source changes", () => {
  it("reaches a weapon on an unlinked token's actor", async () => {
    const { weapon, actor } = armed();
    game.actors = [];                                  // a synthetic actor is not a world actor
    canvas.tokens.placeables = [{ actor }];

    await refreshWeaponsReferencing(SOURCE);

    expect(weapon.system.mods[0]).toMatchObject({ name: "Red-dot Sight", attackMod: 10 });
  });

  it("still reaches a weapon on a world actor", async () => {
    const { weapon, actor } = armed();
    game.actors = [actor];

    await refreshWeaponsReferencing(SOURCE);

    expect(weapon.system.mods[0].attackMod).toBe(10);
  });

  it("writes once to a linked token's weapon, which is both a world actor and on the canvas", async () => {
    const { weapon, actor } = armed();
    let writes = 0;
    const update = weapon.update;
    weapon.update = async (changes) => { writes++; return update(changes); };
    game.actors = [actor];
    canvas.tokens.placeables = [{ actor }];

    await refreshWeaponsReferencing(SOURCE);

    expect(writes).toBe(1);
  });
});

// Reaching token actors also reaches tokens the acting user does not own: a player edits a part
// source while an NPC token whose weapon links to it is on the canvas. That write is refused by
// the server — and one refusal used to stop the loop, leaving every later weapon stale.
describe("a weapon the acting user may not update", () => {
  it("is skipped, without throwing, and the weapons after it are still refreshed", async () => {
    const theirs = armed(), mine = armed();
    theirs.weapon.isOwner = false;
    theirs.weapon.update = async () => { throw new Error("User lacks permission to update Item"); };
    canvas.tokens.placeables = [{ actor: theirs.actor }, { actor: mine.actor }];

    await refreshWeaponsReferencing(SOURCE);

    expect(theirs.weapon.system.mods[0].attackMod).toBe(0);
    expect(mine.weapon.system.mods[0].attackMod).toBe(10);
  });

  it("is skipped when its part source is deleted, too", async () => {
    const theirs = armed(), mine = armed();
    theirs.weapon.isOwner = false;
    theirs.weapon.update = async () => { throw new Error("User lacks permission to update Item"); };
    canvas.tokens.placeables = [{ actor: theirs.actor }, { actor: mine.actor }];

    await purgeDeletedPartSource(SOURCE.uuid);

    expect(mine.weapon.system.mods[0].uuid).toBe("");
  });
});

describe("dropping the link when a part source is deleted", () => {
  it("reaches a weapon on an unlinked token's actor", async () => {
    const { weapon, actor } = armed();
    game.actors = [];
    canvas.tokens.placeables = [{ actor }];

    await purgeDeletedPartSource(SOURCE.uuid);

    expect(weapon.system.mods[0].uuid).toBe("");
  });
});
