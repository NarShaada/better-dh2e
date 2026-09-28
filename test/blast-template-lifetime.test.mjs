// test/blast-template-lifetime.test.mjs
//
// A blast's template Region has one job: tell rollDamage who is still inside it. rollDamage locks
// the survivors onto the damage card as `poolUuids`, and applyDamage reads that list, never the
// region. So the template must be deleted when damage is ROLLED, not when it is applied — otherwise
// it lingers on the map indefinitely if nobody presses Apply Damage.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedMessages,
  registerUuid, makeWeapon, makeActor, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

// attack.mjs destructures Foundry globals at module scope, so the stub must be installed before the
// dynamic import (same idiom as test/attack-effective-weapon.test.mjs).
let bindCardButtons;
beforeAll(async () => {
  installFoundryStub();
  ({ bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => resetCaptures());
afterEach(() => { globalThis.canvas.tokens.placeables = []; });   // don't leak into other tests

/** Drive a blast attack card's Roll Damage button. Returns the fake region (records its own deletion)
 *  and the actors caught in the template. */
async function rollBlastDamage() {
  const weapon = makeWeapon({
    system: { damage: "1d10+3", penetration: 2, damageType: "impact", qualities: [{ key: "blast", value: 3 }] },
  });
  const attacker = makeActor();
  const caught = [makeActor({ id: "caught-a" }), makeActor({ id: "caught-b" })];
  registerUuid(attacker.uuid, attacker);
  registerUuid(weapon.uuid, weapon);

  const region = { uuid: "Scene.s1.Region.blast-life", deleted: false, async delete() { this.deleted = true; } };
  registerUuid(region.uuid, region);

  // tokensInRegion() filters canvas.tokens.placeables by document.testInsideRegion(region).
  globalThis.canvas.tokens.placeables = caught.map((actor) => ({
    actor, name: actor.name, document: { testInsideRegion: () => true },
  }));

  const message = {
    flags: {
      [NS]: {
        actorUuid: attacker.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
        qualities: [{ key: "blast", value: 3 }], penetration: 2, damageType: "impact",
        blast: 3, regionUuid: region.uuid, caughtUuids: caught.map((a) => a.uuid),
      },
    },
  };
  const html = makeCardHtml({ buttons: ["rollDamage"] });
  bindCardButtons(message, html);
  await html.click("rollDamage");

  const msgs = capturedMessages();
  return { region, caught, damageFlags: msgs[msgs.length - 1].flags[NS] };
}

describe("blast template lifetime — the template goes when damage is rolled", () => {
  it("deletes the template Region once damage is rolled, without waiting for Apply Damage", async () => {
    const { region } = await rollBlastDamage();
    expect(region.deleted).toBe(true);
  });

  it("the pool survives the deletion — the damage card still lists the caught actors", async () => {
    const { caught, damageFlags } = await rollBlastDamage();
    expect(damageFlags.poolUuids).toEqual(caught.map((a) => a.uuid));
  });

  it("the damage card carries regionUuid: null, not the deleted template's uuid", async () => {
    const { damageFlags } = await rollBlastDamage();
    // null specifically, not absent: the flags spread `...f` would otherwise propagate the attack
    // card's regionUuid onto a card whose template no longer exists.
    expect(damageFlags.regionUuid).toBeNull();
  });
});
