// test/attack-tainted.test.mjs
//
// Tainted (Enemies Beyond p. 40) adds the wielder's Corruption bonus to the weapon's damage. It is
// the first flat damage bonus in this system that applies to RANGED weapons — Strength bonus,
// craftsmanship and Force are all melee-only, which is why their absence from the AoE damage paths
// is correct and Tainted's absence was not.
//
// So this file asserts the same weapon in the same hands deals the same bonus through EVERY path
// that assembles a damage formula: the single-target roll, the Blast region, Spray, and suppressing
// fire. taintedBonus() itself is unit-tested in quality-modules.test.mjs — what is pinned here is
// that each call site actually applies it.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedRolls, registerUuid,
  makeWeapon, makeActor, makeChoice, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let resolveAttack, bindCardButtons;
beforeAll(async () => {
  installFoundryStub();
  ({ resolveAttack, bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => resetCaptures());

const TAINTED = { key: "tainted", value: null };

/** An acolyte at 45 Corruption — Corruption bonus 4, so Tainted is worth "+ 4". */
function makeWielder(overrides = {}) {
  const actor = makeActor({ system: { corruption: 45 }, ...overrides });
  registerUuid(actor.uuid, actor);
  return actor;
}

function register(weapon) {
  registerUuid(weapon.uuid, weapon);
  return weapon;
}

describe("Tainted — single-target damage roll (the path that already had it)", () => {
  it("adds the wielder's Corruption bonus to the weapon formula", async () => {
    const weapon = register(makeWeapon({
      system: { weaponClass: "basic", damage: "1d10+3", qualities: [TAINTED] },
    }));
    const actor = makeWielder();

    const attackMsg = await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 1 });
    resetCaptures();
    const html = makeCardHtml({ buttons: ["rollDamage"] });
    bindCardButtons(attackMsg, html);
    await html.click("rollDamage");

    expect(capturedRolls()).toContain("1d10+3 + 4");
  });
});

describe("Tainted — Blast region", () => {
  it("adds the same Corruption bonus to the shared blast roll", async () => {
    const weapon = register(makeWeapon({
      system: { weaponClass: "basic", damage: "1d10+3", penetration: 2, damageType: "impact",
        qualities: [{ key: "blast", value: 3 }, TAINTED] },
    }));
    const actor = makeWielder();
    const targetActor = makeActor({ id: "blast-victim" });
    const targetToken = { actor: targetActor, name: "Victim", document: { testInsideRegion: () => true } };
    const region = { uuid: "Scene.s1.Region.tainted-blast", delete: async () => {} };
    registerUuid(region.uuid, region);
    globalThis.canvas.tokens.placeables = [targetToken];

    const message = {
      flags: { [NS]: {
        actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
        damageFormula: "1d10+3", qualities: [{ key: "blast", value: 3 }, TAINTED],
        penetration: 2, damageType: "impact",
        blast: 3, regionUuid: region.uuid, caughtUuids: [targetActor.uuid],
      } },
    };
    const html = makeCardHtml({ buttons: ["rollDamage"] });
    bindCardButtons(message, html);
    await html.click("rollDamage");

    // Without the fix this reads "1d10+3" — the same grenade launcher, the same acolyte, 4 less damage.
    expect(capturedRolls()).toContain("1d10+3 + 4");
    globalThis.canvas.tokens.placeables = [];
  });

  it("leaves the blast formula alone when the weapon is not Tainted", async () => {
    const weapon = register(makeWeapon({
      system: { weaponClass: "basic", damage: "1d10+3", qualities: [{ key: "blast", value: 3 }] },
    }));
    const actor = makeWielder();
    const targetActor = makeActor({ id: "clean-blast-victim" });
    const region = { uuid: "Scene.s1.Region.clean-blast", delete: async () => {} };
    registerUuid(region.uuid, region);
    globalThis.canvas.tokens.placeables = [{ actor: targetActor, name: "Victim", document: { testInsideRegion: () => true } }];

    const message = {
      flags: { [NS]: {
        actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
        damageFormula: "1d10+3", qualities: [{ key: "blast", value: 3 }],
        penetration: 2, damageType: "impact",
        blast: 3, regionUuid: region.uuid, caughtUuids: [targetActor.uuid],
      } },
    };
    const html = makeCardHtml({ buttons: ["rollDamage"] });
    bindCardButtons(message, html);
    await html.click("rollDamage");

    expect(capturedRolls()).toContain("1d10+3");
    expect(capturedRolls().some((r) => r.includes("+ 4"))).toBe(false);
    globalThis.canvas.tokens.placeables = [];
  });
});

describe("Tainted — Spray", () => {
  it("adds the Corruption bonus to the shared spray roll AND to each per-horde hit roll", async () => {
    const weapon = register(makeWeapon({
      system: { weaponClass: "basic", damage: "1d10", damageType: "energy", range: 20,
        qualities: [{ key: "spray", value: null }, TAINTED] },
    }));
    const actor = makeWielder();
    // A horde re-rolls damage per hit through rollSprayHit() — the second, easily-missed call site.
    const horde = makeActor({ id: "spray-horde", type: "horde", system: { magnitude: 20 } });
    registerUuid(horde.uuid, horde);

    const message = {
      flags: { [NS]: {
        kind: "spray", actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
        regionUuid: null, caughtUuids: [], damageType: "energy",
      } },
    };
    const html = makeCardHtml({ buttons: ["sprayApply"], sprayChecked: [horde.uuid] });
    bindCardButtons(message, html);
    await html.click("sprayApply");

    const damageRolls = capturedRolls().filter((r) => r.startsWith("1d10"));
    expect(damageRolls.length).toBeGreaterThan(1);          // the shared roll + at least one horde hit
    expect(damageRolls.every((r) => r === "1d10 + 4")).toBe(true);
  });
});

describe("Tainted — suppressing fire", () => {
  it("adds the Corruption bonus to each suppressing hit", async () => {
    const weapon = register(makeWeapon({
      system: { weaponClass: "basic", damage: "1d10+2", damageType: "impact",
        qualities: [TAINTED] },
    }));
    const actor = makeWielder();
    const target = makeActor({ id: "suppressed" });
    registerUuid(target.uuid, target);

    const message = {
      flags: { [NS]: {
        kind: "suppressHit", actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
        hits: [{ uuid: target.uuid, locKeys: ["body"] }],
      } },
    };
    const html = makeCardHtml({ buttons: [{ bdh: "suppressApply", uuid: target.uuid }] });
    bindCardButtons(message, html);
    await html.click("suppressApply");

    expect(capturedRolls()).toContain("1d10+2 + 4");
  });

  it("adds nothing when the wielder has no Corruption bonus", async () => {
    const weapon = register(makeWeapon({
      system: { weaponClass: "basic", damage: "1d10+2", qualities: [TAINTED] },
    }));
    const actor = makeWielder({ system: { corruption: 5 } });   // below 10 → Corruption bonus 0
    const target = makeActor({ id: "suppressed-clean" });
    registerUuid(target.uuid, target);

    const message = {
      flags: { [NS]: {
        kind: "suppressHit", actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
        hits: [{ uuid: target.uuid, locKeys: ["body"] }],
      } },
    };
    const html = makeCardHtml({ buttons: [{ bdh: "suppressApply", uuid: target.uuid }] });
    bindCardButtons(message, html);
    await html.click("suppressApply");

    expect(capturedRolls()).toContain("1d10+2");
  });
});
