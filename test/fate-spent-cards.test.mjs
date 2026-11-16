// test/fate-spent-cards.test.mjs
//
// A Fate reroll (or "+1 DoS") SUPERSEDES the card it was spent on: a new card is posted and the old
// one is history. The old card used to stay live, so it could be rerolled or boosted again and
// again — each pass re-running whatever "undo" its kind has (a Malefic cast took its Corruption
// grant back every time). The actor now remembers which cards it has spent Fate on.
//
// The memory lives on the ACTOR (flags.better-dh2e.spentCards) because the user spending Fate owns
// the actor but is often not the author of the chat card, and only a card's author or a GM can
// update it.
//
// Also here: Fate must not be spent on a card that can no longer be re-resolved.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { installFoundryStub, resetCaptures, registerUuid, primeDice, capturedMessages, makeActor } from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let canReroll, rerollFromFate, canAddDoS, addDoSFromFate, warnings;
beforeAll(async () => {
  installFoundryStub();
  ({ canReroll, rerollFromFate, canAddDoS, addDoSFromFate } = await import("../scripts/rolls/fate.mjs"));
});
beforeEach(() => {
  resetCaptures();
  warnings = [];
  ui.notifications.warn = (m) => warnings.push(String(m));
});

function makeHero(fate = 3) {
  const actor = makeActor({ name: "Acolyte", system: { fate: { value: fate, max: 3 } } });
  registerUuid(actor.uuid, actor);
  return actor;
}

let cardCount = 0;
/** A plain test card, as the chat log hands it to the Fate menu: it has an id. */
const testCard = (actor, over = {}) => ({
  id: `card-${++cardCount}`,
  flags: { [NS]: { reroll: {
    kind: "test", actorUuid: actor.uuid, label: "Awareness", base: 40, modifier: "+0",
    roll: 30, success: true, dosBonus: 0, characteristic: "perception", ...over,
  } } },
});

describe("a card Fate has been spent on", () => {
  it("cannot be rerolled a second time", async () => {
    const actor = makeHero();
    const card = testCard(actor);
    expect(canReroll(card)).toBe(true);

    await rerollFromFate(card);

    expect(canReroll(card)).toBe(false);
    await rerollFromFate(card);                       // called directly, as a macro might
    expect(actor.system.fate.value).toBe(2);          // spent once
    expect(warnings).toHaveLength(1);
  });

  it("cannot be boosted and then rerolled, or boosted twice", async () => {
    const actor = makeHero();
    const card = testCard(actor);
    expect(canAddDoS(card)).toBe(true);

    await addDoSFromFate(card);

    expect(canAddDoS(card)).toBe(false);
    expect(canReroll(card)).toBe(false);
    await addDoSFromFate(card);
    expect(actor.system.fate.value).toBe(2);
  });

  it("leaves the card that replaced it rerollable", async () => {
    const actor = makeHero();
    await rerollFromFate(testCard(actor));
    const replacement = { id: "the-new-card", flags: capturedMessages().at(-1).flags };

    expect(canReroll(replacement)).toBe(true);
  });

  it("does not affect another actor's cards, or a different card of the same actor", async () => {
    const actor = makeHero();
    const other = makeHero();
    const spent = testCard(actor);
    await rerollFromFate(spent);

    expect(canReroll(testCard(actor))).toBe(true);
    expect(canReroll({ ...testCard(other), id: spent.id })).toBe(true);
  });

  it("remembers only the most recent cards", async () => {
    const actor = makeHero(3);
    for (let i = 0; i < 45; i++) {
      actor.system.fate.value = 3;
      primeDice([50]);
      await rerollFromFate(testCard(actor));
    }
    expect(actor.getFlag(NS, "spentCards").length).toBeLessThanOrEqual(40);
  });
});

describe("a card that can no longer be re-resolved", () => {
  const attackCard = (actor) => ({
    id: `card-${++cardCount}`,
    flags: { [NS]: { reroll: {
      kind: "attack", actorUuid: actor.uuid, weaponId: "gone", weaponUuid: "Actor.x.Item.gone",
      choice: {}, roll: 30, success: true, dosBonus: 0,
    } } },
  });

  it("reroll: the weapon is gone → no Fate is spent and nothing is posted", async () => {
    const actor = makeHero();

    await rerollFromFate(attackCard(actor));

    expect(actor.system.fate.value).toBe(3);
    expect(capturedMessages()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("+1 DoS: the weapon is gone → no Fate is spent and nothing is posted", async () => {
    const actor = makeHero();

    await addDoSFromFate(attackCard(actor));

    expect(actor.system.fate.value).toBe(3);
    expect(capturedMessages()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
