// test/attack-reroll-target.test.mjs
//
// A Fate reroll (or "+1 DoS") re-resolves an earlier attack card. Its target is whatever THAT card
// had — possibly none. Two defects from the 2026-11 audit:
//   - a reroll that turned a miss into a hit never tested the target's force field: the field test
//     keyed off the user's LIVE target, which a reroll deliberately ignores in favour of the card's;
//   - a reroll of an UNTARGETED attack adopted whoever the user happened to have targeted now — its
//     size and condition modifiers, its force field, and its name on the new card.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedMessages, primeDice, registerUuid,
  makeWeapon, makeActor, makeChoice,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";
const HIT = 5;

let resolveAttack;
beforeAll(async () => {
  installFoundryStub();
  ({ resolveAttack } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => resetCaptures());
afterEach(() => { game.user.targets = { first: () => null }; });

const fieldCards = () => capturedMessages().filter((m) => String(m.content).includes("forcefield-card"));
const attackFlags = () => capturedMessages().find((m) => m.flags?.[NS]?.type === "attack")?.flags[NS];

function shielded(name = "Shielded") {
  const field = { id: "ff", type: "forceField", name: "Refractor Field", system: { equipped: true, protectionRating: 30, overload: 5 } };
  const actor = makeActor({ name, items: [field] });
  registerUuid(actor.uuid, actor);
  return actor;
}
const targeting = (actor) => { game.user.targets = { first: () => ({ actor, name: actor.name, center: { x: 0, y: 0 } }) }; };

describe("the force field of a rerolled attack's target", () => {
  it("is tested when a fresh reroll hits", async () => {
    const target = shielded();
    primeDice([HIT]);

    await resolveAttack(makeActor(), makeWeapon(), makeChoice(),
      { consumeAmmo: false, targetUuid: target.uuid, targetName: target.name, replay: true });

    expect(fieldCards()).toHaveLength(1);
  });

  // A force field is tested once per ATTACK, when the character is attacked. Spending Fate re-rolls
  // the attack TEST, not the field: if the attack being rerolled had already hit (and so already
  // tested the field), that result stands — a second roll would give the field a second chance to
  // stop the same attack, and a second chance to overload.
  it("is NOT tested again when the attack being rerolled had already tested it", async () => {
    const target = shielded();
    primeDice([HIT]);

    await resolveAttack(makeActor(), makeWeapon(), makeChoice(),
      { consumeAmmo: false, targetUuid: target.uuid, targetName: target.name, replay: true, fieldTested: true });

    expect(fieldCards()).toEqual([]);
  });

  it("remembers on the card whether the field has been tested, so a chain of rerolls tests it once", async () => {
    const target = shielded();
    targeting(target);
    primeDice([97]);                                    // a miss: nothing to test yet
    await resolveAttack(makeActor(), makeWeapon(), makeChoice(), { consumeAmmo: true });
    expect(attackFlags().reroll.fieldTested).toBe(false);

    resetCaptures();
    primeDice([HIT]);                                   // the reroll hits: tested now
    await resolveAttack(makeActor(), makeWeapon(), makeChoice(),
      { consumeAmmo: false, targetUuid: target.uuid, targetName: target.name, replay: true, fieldTested: false });
    expect(fieldCards()).toHaveLength(1);
    expect(attackFlags().reroll.fieldTested).toBe(true);
  });

  it("is NOT tested again by +1 DoS, which replays a roll whose field test already happened", async () => {
    const target = shielded();

    await resolveAttack(makeActor(), makeWeapon(), makeChoice(),
      { consumeAmmo: false, targetUuid: target.uuid, targetName: target.name, replay: true, fixedRoll: HIT, dosBonus: 1 });

    expect(fieldCards()).toEqual([]);
  });

  it("is still tested on an ordinary attack against the live target", async () => {
    targeting(shielded());
    primeDice([HIT]);

    await resolveAttack(makeActor(), makeWeapon(), makeChoice(), { consumeAmmo: true });

    expect(fieldCards()).toHaveLength(1);
  });
});

describe("rerolling an attack that had no target", () => {
  it("stays untargeted, whoever the user has targeted now", async () => {
    targeting(shielded("Bystander"));
    primeDice([HIT]);

    await resolveAttack(makeActor(), makeWeapon(), makeChoice(),
      { consumeAmmo: false, targetUuid: null, targetName: null, replay: true });

    expect(attackFlags().targetUuid).toBeNull();
    expect(attackFlags().targetName).toBeNull();
    expect(fieldCards()).toEqual([]);
  });

  it("an ordinary attack still binds the live target", async () => {
    const live = shielded("Live");
    targeting(live);
    primeDice([HIT]);

    await resolveAttack(makeActor(), makeWeapon(), makeChoice(), { consumeAmmo: true });

    expect(attackFlags().targetUuid).toBe(live.uuid);
  });
});

describe("Fate reroll of an attack, through fate.mjs", () => {
  let rerollFromFate;
  beforeAll(async () => { ({ rerollFromFate } = await import("../scripts/rolls/fate.mjs")); });

  /** An attack card as it sits in the chat log, written by the code BEFORE `fieldTested` existed. */
  function oldAttackCard(success) {
    const weapon = makeWeapon();
    const attacker = makeActor({ items: [weapon], system: { fate: { value: 2, max: 3 } } });
    registerUuid(attacker.uuid, attacker);
    const target = shielded();
    return { flags: { [NS]: { type: "attack", reroll: {
      kind: "attack", actorUuid: attacker.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid, choice: makeChoice(),
      targetUuid: target.uuid, targetName: target.name, roll: success ? 20 : 90, success, dosBonus: 0,
    } } } };
  }

  it("a MISS rerolled into a hit tests the target's force field", async () => {
    primeDice([HIT]);
    await rerollFromFate(oldAttackCard(false));
    expect(fieldCards()).toHaveLength(1);
  });

  it("a HIT rerolled into another hit does not test the field a second time", async () => {
    primeDice([HIT]);
    await rerollFromFate(oldAttackCard(true));
    expect(fieldCards()).toEqual([]);
  });
});
