// test/fate-reroll-resist.test.mjs
//
// A quality resist test (Shocking, Concussive, Flame, Snare, Toxic, Rad-Phage) applies its
// consequence the moment it is failed. Spending Fate to reroll it used to re-run only the dice:
// the new card could read "Success" while the target stayed On Fire / Stunned / wounded, because
// nothing connected the reroll to what the first roll had done.
//
// What these tests pin, in the order the rules of a reroll require:
//   - a reroll REPLACES the first result — its consequence is undone, then the new result applies;
//   - only what that roll itself changed is undone (a target that was already On Fire stays so);
//   - the undo happens ONLY while the actor is still exactly as that roll left it. Anything else —
//     the card was already rerolled, it is old, the wounds or the condition have changed since —
//     and the reroll is dice only, as every reroll was before this fix, with a note saying so. An
//     automatic undo that guesses would be worse than none: it could wipe wounds dealt since, or
//     put out a fire someone else lit;
//   - cards posted before this fix (no `resist` data on them) keep rerolling exactly as before.
//
// Everything is driven through the real surfaces: the chat-card buttons (bindCardButtons) and the
// Fate context-menu entry points (rerollFromFate / addDoSFromFate).
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, registerUuid, primeDice, capturedMessages,
  makeActor, makeCardHtml, applyDotUpdate,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";
const FAIL = 95;   // vs a target of 40: six degrees of failure
const PASS = 5;

let bindCardButtons, rerollFromFate, addDoSFromFate;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true } });
  ({ bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
  ({ rerollFromFate, addDoSFromFate } = await import("../scripts/rolls/fate.mjs"));
});
beforeEach(() => resetCaptures());

/** A defender whose status effects are real enough for conditions.mjs: toggleStatusEffect keeps
 *  `effects` (each with statuses / flags / update / delete) and `statuses` in step, as Foundry does. */
function makeDefender(overrides = {}) {
  const actor = makeActor({
    name: "Acolyte",
    ...overrides,
    system: { fate: { value: 2, max: 3 }, fatigue: { value: 0 }, injuries: [], ...overrides.system },
  });
  actor.effects = [];
  let effectCount = 0;
  const addEffect = (id) => {
    const eff = {
      id: `${actor.id}-effect-${++effectCount}`,   // a document identity, as every ActiveEffect has
      statuses: new Set([id]), flags: {},
      update: async (changes) => { applyDotUpdate(eff, changes); return eff; },
      delete: async () => { actor.effects.splice(actor.effects.indexOf(eff), 1); actor.statuses.delete(id); },
    };
    actor.effects.push(eff);
    actor.statuses.add(id);
    return eff;
  };
  actor.toggleStatusEffect = async (id, { active } = {}) => {
    const eff = actor.effects.find((e) => e.statuses.has(id));
    if (active && !eff) addEffect(id);
    else if (!active && eff) await eff.delete();
    return true;
  };
  for (const id of overrides.startWith ?? []) addEffect(id);
  registerUuid(actor.uuid, actor);
  return actor;
}

const stunnedRounds = (actor) => actor.effects.find((e) => e.statuses.has("stunned"))?.flags?.[NS]?.rounds;

/** Click a resist chip on a card aimed at `defender`, with the d100 (and any follow-up dice) primed. */
async function clickResist(defender, bdh, dice, cardFlags = {}) {
  const message = { flags: { [NS]: { targetUuid: defender.uuid, qualities: [], ...cardFlags } } };
  const html = makeCardHtml({ buttons: [bdh] });
  bindCardButtons(message, html);
  primeDice(dice);
  await html.click(bdh);
}

/** The most recent test card, shaped like the ChatMessage the Fate menu hands to fate.mjs. */
function lastTestCard() {
  const payload = capturedMessages().filter((m) => m.flags?.[NS]?.reroll?.kind === "test").at(-1);
  if (!payload) throw new Error("no test card was posted");
  return { flags: payload.flags };
}

async function reroll(card, dice) {
  primeDice(dice);
  await rerollFromFate(card);
}

describe("rerolling a failed resist test into a success undoes what the failure applied", () => {
  it("Flame: the target is no longer On Fire", async () => {
    const defender = makeDefender();
    await clickResist(defender, "flameTest", [FAIL]);
    expect(defender.statuses.has("onFire")).toBe(true);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("onFire")).toBe(false);
    expect(defender.system.fate.value).toBe(1);
  });

  it("Snare: the target is no longer Helpless", async () => {
    const defender = makeDefender();
    await clickResist(defender, "snareTest", [FAIL], { qualities: [{ key: "snare", value: 1 }] });
    expect(defender.statuses.has("helpless")).toBe(true);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("helpless")).toBe(false);
  });

  it("Shocking: Stunned is removed and the point of Fatigue is taken back", async () => {
    const defender = makeDefender({ system: { fatigue: { value: 2 } } });
    await clickResist(defender, "shockTest", [FAIL]);
    expect(stunnedRounds(defender)).toBe(3);            // ceil(6 DoF / 2)
    expect(defender.system.fatigue.value).toBe(3);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("stunned")).toBe(false);
    expect(defender.system.fatigue.value).toBe(2);
  });

  it("Concussive: Stunned is removed", async () => {
    const defender = makeDefender();
    await clickResist(defender, "concussiveTest", [FAIL], { qualities: [{ key: "concussive", value: 0 }] });
    expect(defender.statuses.has("stunned")).toBe(true);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("stunned")).toBe(false);
  });

  it("Toxic: the wounds the failed resist dealt are taken back", async () => {
    const defender = makeDefender({ system: { wounds: { value: 3, max: 15, critical: 0 } } });
    await clickResist(defender, "toxicResist", [FAIL, 7], { kind: "toxicResist", potency: 1, damageType: "energy" });
    expect(defender.system.wounds.value).toBe(10);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.system.wounds.value).toBe(3);
  });

  it("Toxic past the Wounds max: the critical damage is taken back too", async () => {
    const defender = makeDefender({ system: { wounds: { value: 12, max: 15, critical: 0 } } });
    await clickResist(defender, "toxicResist", [FAIL, 7], { kind: "toxicResist", potency: 1, damageType: "energy" });
    expect(defender.system.wounds).toMatchObject({ value: 15, critical: 4 });

    await reroll(lastTestCard(), [PASS]);

    expect(defender.system.wounds).toMatchObject({ value: 12, critical: 0 });
  });

  it("Toxic on a horde: the Magnitude it cost comes back", async () => {
    const horde = makeDefender({ type: "horde", system: { magnitude: 20 } });
    await clickResist(horde, "toxicResist", [FAIL, 7], { kind: "toxicResist", potency: 1, damageType: "energy" });
    expect(horde.system.magnitude).toBe(19);

    await reroll(lastTestCard(), [PASS]);

    expect(horde.system.magnitude).toBe(20);
  });

  it("Rad-Phage: the Toughness damage entry is removed, and nothing else in the list", async () => {
    const earlier = { type: "injury", description: "Broken arm", characteristic: "", amount: 0 };
    const defender = makeDefender({ system: { injuries: [earlier] } });
    await clickResist(defender, "radPhageTest", [FAIL, 6, 4]);
    expect(defender.system.injuries).toHaveLength(2);
    expect(defender.system.injuries[1]).toMatchObject({ type: "charDamage", characteristic: "toughness", amount: 10 });

    await reroll(lastTestCard(), [PASS]);

    expect(defender.system.injuries).toEqual([earlier]);
  });

  it("says in chat what was undone", async () => {
    const defender = makeDefender();
    await clickResist(defender, "flameTest", [FAIL]);
    const card = lastTestCard();
    resetCaptures();

    await reroll(card, [PASS]);

    const undo = capturedMessages().find((m) => /undone/i.test(m.content ?? ""));
    expect(undo?.content).toContain("On Fire");
  });

  it("removes a Stunned the failure added even after it has ticked down a round", async () => {
    const defender = makeDefender();
    await clickResist(defender, "shockTest", [FAIL]);
    defender.effects[0].flags[NS].rounds = 2;          // the target's turn started: 3 → 2

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("stunned")).toBe(false);
  });
});

describe("only what the rerolled roll itself changed is undone", () => {
  it("a target that was ALREADY On Fire stays On Fire", async () => {
    const defender = makeDefender({ startWith: ["onFire"] });
    await clickResist(defender, "flameTest", [FAIL]);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("onFire")).toBe(true);
  });

  it("a Stunned that the failure only LENGTHENED goes back to its earlier duration", async () => {
    const defender = makeDefender({ startWith: ["stunned"] });
    defender.effects[0].flags[NS] = { rounds: 1 };
    await clickResist(defender, "shockTest", [FAIL]);
    expect(stunnedRounds(defender)).toBe(3);

    await reroll(lastTestCard(), [PASS]);

    expect(stunnedRounds(defender)).toBe(1);
  });
});

describe("a reroll replaces the result — it does not stack with it", () => {
  it("failing again leaves the consequence applied exactly once", async () => {
    const defender = makeDefender({ system: { fatigue: { value: 2 } } });
    await clickResist(defender, "shockTest", [FAIL]);

    await reroll(lastTestCard(), [85]);      // fails again: 5 DoF → Stunned 3

    expect(defender.system.fatigue.value).toBe(3);    // +1, not +2
    expect(stunnedRounds(defender)).toBe(3);
  });

  it("the card posted by the reroll can itself be rerolled", async () => {
    const defender = makeDefender({ system: { fate: { value: 3, max: 3 } } });
    await clickResist(defender, "flameTest", [FAIL]);
    await reroll(lastTestCard(), [FAIL]);
    expect(defender.statuses.has("onFire")).toBe(true);

    await reroll(lastTestCard(), [PASS]);

    expect(defender.statuses.has("onFire")).toBe(false);
  });

  it("a success rerolled into a failure applies the consequence", async () => {
    const defender = makeDefender();
    await clickResist(defender, "flameTest", [PASS]);
    expect(defender.statuses.has("onFire")).toBe(false);

    await reroll(lastTestCard(), [FAIL]);

    expect(defender.statuses.has("onFire")).toBe(true);
  });
});

describe("the reroll is dice only whenever the undo would have to guess", () => {
  /** Dice only = nothing on the actor moves, the table is told, and the new card is a plain test
   *  card (so rerolling IT cannot start automating again on top of a state nobody undid). */
  const expectDiceOnly = () => {
    expect(capturedMessages().some((m) => /dice only/i.test(m.content ?? ""))).toBe(true);
    expect(lastTestCard().flags[NS].reroll.resist).toBeUndefined();
  };

  it("a card that has already been rerolled: no second undo, and no second consequence", async () => {
    const defender = makeDefender({ system: { fate: { value: 3, max: 3 }, fatigue: { value: 2 } } });
    await clickResist(defender, "shockTest", [FAIL]);
    const original = lastTestCard();
    await reroll(original, [PASS]);                    // undone: Fatigue back to 2, Stunned gone
    resetCaptures();

    await reroll(original, [FAIL]);                    // the same OLD card again, and it fails

    expect(defender.system.fatigue.value).toBe(2);     // not 1 (a second undo) and not 3 (a second hit)
    expect(defender.statuses.has("stunned")).toBe(false);
    expectDiceOnly();
  });

  it("wounds that have changed since the roll are left alone", async () => {
    const defender = makeDefender({ system: { wounds: { value: 3, max: 15, critical: 0 } } });
    await clickResist(defender, "toxicResist", [FAIL, 7], { kind: "toxicResist", potency: 1, damageType: "energy" });
    const card = lastTestCard();
    defender.system.wounds.value = 4;                  // healed since (10 → 4)
    resetCaptures();

    await reroll(card, [PASS]);

    expect(defender.system.wounds.value).toBe(4);      // not max(0, 4 − 7) = 0
    expectDiceOnly();
  });

  it("an On Fire lit by something ELSE since the roll is not put out", async () => {
    const defender = makeDefender();
    await clickResist(defender, "flameTest", [FAIL]);
    const card = lastTestCard();
    await defender.toggleStatusEffect("onFire", { active: false });   // extinguished …
    await defender.toggleStatusEffect("onFire", { active: true });    // … and set alight again by another attack
    resetCaptures();

    await reroll(card, [PASS]);

    expect(defender.statuses.has("onFire")).toBe(true);
    expectDiceOnly();
  });

  it("undoes nothing at all when only part of what the roll did is still intact", async () => {
    const defender = makeDefender({ system: { fatigue: { value: 2 } } });
    await clickResist(defender, "shockTest", [FAIL]);  // Stunned 3 + Fatigue 2 → 3
    const card = lastTestCard();
    defender.system.fatigue.value = 5;                 // more Fatigue from elsewhere
    resetCaptures();

    await reroll(card, [PASS]);

    expect(defender.statuses.has("stunned")).toBe(true);   // not half-undone
    expect(defender.system.fatigue.value).toBe(5);
    expectDiceOnly();
  });

  it("a card from more than a quarter of an hour ago", async () => {
    const defender = makeDefender();
    await clickResist(defender, "flameTest", [FAIL]);
    const card = lastTestCard();
    card.flags[NS].reroll.resist.at = Date.now() - 16 * 60 * 1000;
    resetCaptures();

    await reroll(card, [PASS]);

    expect(defender.statuses.has("onFire")).toBe(true);
    expectDiceOnly();
  });

  it("a failed card with no record of what it applied, and a new failure applies nothing", async () => {
    const defender = makeDefender();
    await clickResist(defender, "flameTest", [FAIL]);
    const card = lastTestCard();
    await defender.unsetFlag(NS, "resistApplied");     // e.g. pushed out by later rolls
    await defender.toggleStatusEffect("onFire", { active: false });
    resetCaptures();

    await reroll(card, [FAIL]);

    expect(defender.statuses.has("onFire")).toBe(false);
    expectDiceOnly();
  });
});

describe("what a resist roll writes to the actor", () => {
  it("nothing on a success", async () => {
    const defender = makeDefender();
    let flagWrites = 0;
    const setFlag = defender.setFlag;
    defender.setFlag = async (...args) => { flagWrites++; return setFlag(...args); };

    await clickResist(defender, "flameTest", [PASS]);

    expect(lastTestCard().flags[NS].reroll.success).toBe(true);
    expect(flagWrites).toBe(0);
    expect(defender.getFlag(NS, "resistApplied")).toBeUndefined();
  });

  it("keeps only the most recent records", async () => {
    const defender = makeDefender({ startWith: ["onFire"] });   // already alight: each failure changes nothing
    for (let i = 0; i < 15; i++) await clickResist(defender, "flameTest", [FAIL]);

    expect(defender.getFlag(NS, "resistApplied").length).toBeLessThanOrEqual(12);
  });
});

describe("cards that predate this fix", () => {
  it("still reroll — re-rolling the dice and leaving the actor as it is", async () => {
    const defender = makeDefender({ startWith: ["onFire"] });
    const legacy = { flags: { [NS]: { reroll: {
      kind: "test", actorUuid: defender.uuid, label: "Agility (Flame)", base: 40, modifier: "+0",
      roll: FAIL, success: false, dosBonus: 0, characteristic: "agility",
    } } } };

    await reroll(legacy, [PASS]);

    expect(defender.statuses.has("onFire")).toBe(true);
    expect(defender.system.fate.value).toBe(1);
    expect(lastTestCard().flags[NS].reroll.success).toBe(true);
  });
});

describe("Spend Fate: +1 DoS on a passed resist test", () => {
  it("keeps the card a resist card, so rerolling it into a failure still applies the consequence", async () => {
    const defender = makeDefender({ system: { fate: { value: 3, max: 3 } } });
    await clickResist(defender, "flameTest", [PASS]);

    await addDoSFromFate(lastTestCard());
    expect(defender.statuses.has("onFire")).toBe(false);
    await reroll(lastTestCard(), [FAIL]);

    expect(defender.statuses.has("onFire")).toBe(true);
  });
});
