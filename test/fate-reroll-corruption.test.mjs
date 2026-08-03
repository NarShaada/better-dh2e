// test/fate-reroll-corruption.test.mjs
//
// Companion to fate-reroll-sustain.test.mjs, for the OTHER persistent side effect resolveManifest
// leaves behind: the Malefic Corruption grant (Enemies Beyond p. 54).
//
// A Fate reroll re-plays the same cast with a fresh roll, so resolveManifest will grant again if the
// reroll succeeds. The original grant therefore has to be taken back BEFORE re-resolution, or:
//   - a reroll that also succeeds charges the psyker twice for one cast;
//   - a reroll that FAILS leaves corruption raised while the new card reads "Failure".
//
// resolveManifest is mocked (as in the sustain test) because the assertion is about ordering: the
// mock records the actor's corruption AS IT LOOKS at the instant re-resolution begins, which is the
// only moment that separates the fixed code from the broken code.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { installFoundryStub, resetCaptures, registerUuid, makeActor } from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

const mocked = vi.hoisted(() => {
  const seenCorruption = [];
  return {
    seenCorruption,
    resolveManifest: async (actor) => { seenCorruption.push(actor.system.corruption); },
    rollManifest: async () => {},
  };
});
vi.mock("../scripts/rolls/manifest.mjs", () => ({
  resolveManifest: mocked.resolveManifest,
  rollManifest: mocked.rollManifest,
}));

let rerollFromFate;
beforeAll(async () => {
  installFoundryStub({ settings: { maleficCorruption: true } });
  ({ rerollFromFate } = await import("../scripts/rolls/fate.mjs"));
});
beforeEach(() => {
  resetCaptures();
  mocked.seenCorruption.length = 0;
});

/** An owner-controlled psyker with Fate to spend, holding one power of the given discipline. */
function makePsyker({ discipline = "malefic", corruption = 14 } = {}) {
  const power = {
    id: "power-P", name: "Summoning", type: "psychicPower",
    system: { type: "effect", discipline, focusTest: "willpower", sustained: "no" },
  };
  const actor = makeActor({
    system: { fate: { value: 3 }, psyRating: 4, corruption },
    items: [power],
  });
  registerUuid(actor.uuid, actor);
  return actor;
}

/** The reroll payload a SUCCESSFUL PR-4 cast card carries. */
function castRerollMessage(actor, overrides = {}) {
  return {
    flags: {
      [NS]: {
        reroll: {
          kind: "cast", actorUuid: actor.uuid, powerId: "power-P",
          success: true, sustain: false,
          rulesetKey: "dh2", state: "normal", statePR: 4, prBonus: 0, effPR: 4, circ: 0,
          ...overrides,
        },
      },
    },
  };
}

describe("Fate reroll of a successful Malefic cast", () => {
  it("takes the original Corruption grant back BEFORE re-resolving", async () => {
    const actor = makePsyker({ corruption: 14 });   // 10 before the cast + 4 granted by it

    await rerollFromFate(castRerollMessage(actor));

    expect(mocked.seenCorruption).toHaveLength(1);
    // The whole point: at the instant resolveManifest ran, the first grant was already reversed, so
    // its own grant (or its absence, on a failed reroll) is the only one that survives.
    expect(mocked.seenCorruption[0]).toBe(10);
    expect(actor.system.corruption).toBe(10);
  });

  it("reverses the effective PR, including the PR bonus the cast was made with", async () => {
    const actor = makePsyker({ corruption: 16 });   // 10 + a PR-6 grant

    await rerollFromFate(castRerollMessage(actor, { prBonus: 2, effPR: 6 }));

    expect(mocked.seenCorruption[0]).toBe(10);
  });

  it("never drives Corruption below 0", async () => {
    const actor = makePsyker({ corruption: 1 });    // GM edited it down between cast and reroll

    await rerollFromFate(castRerollMessage(actor));

    expect(mocked.seenCorruption[0]).toBe(0);
    expect(actor.system.corruption).toBe(0);
  });

  it("reverses nothing when the cast being rerolled FAILED — it never granted", async () => {
    const actor = makePsyker({ corruption: 10 });

    await rerollFromFate(castRerollMessage(actor, { success: false }));

    expect(mocked.seenCorruption[0]).toBe(10);
    expect(actor.system.corruption).toBe(10);
  });

  it("reverses nothing on a non-Malefic discipline", async () => {
    const actor = makePsyker({ discipline: "biomancy", corruption: 10 });

    await rerollFromFate(castRerollMessage(actor));

    expect(mocked.seenCorruption[0]).toBe(10);
  });

  // Legacy cards (pre-PR-bonus) carried only effPR; newer ones carry both. Either shape must reverse.
  it("falls back to statePR when the card predates the effPR field", async () => {
    const actor = makePsyker({ corruption: 14 });

    await rerollFromFate(castRerollMessage(actor, { effPR: undefined }));

    expect(mocked.seenCorruption[0]).toBe(10);
  });
});

describe("Fate reroll with Malefic Corruption disabled", () => {
  beforeAll(() => installFoundryStub({ settings: { maleficCorruption: false } }));
  beforeEach(() => resetCaptures());

  it("does not subtract points the system never granted", async () => {
    const actor = makePsyker({ corruption: 10 });

    await rerollFromFate(castRerollMessage(actor));

    expect(mocked.seenCorruption[0]).toBe(10);
    expect(actor.system.corruption).toBe(10);
  });
});
