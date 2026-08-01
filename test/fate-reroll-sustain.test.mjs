// test/fate-reroll-sustain.test.mjs
//
// Pins ONE ordering guarantee in scripts/rolls/fate.mjs: rerolling an already-SUCCESSFUL sustained
// cast must release that power's entry BEFORE re-entering resolveManifest.
//
// Why it matters (both halves of the bug this test exists to prevent):
//   - if the reroll FAILS, nothing else would ever remove the entry the original success added, so
//     the chat card says "Failure" while the power stays in the Active Powers block;
//   - resolveManifest reads `sustainCount = readSustained(actor).length` live, so a stale entry
//     makes the power being recast count toward its OWN phenomena strain, which the rules forbid.
//
// resolveManifest is mocked (rather than driven for real) precisely because the assertion is about
// ordering: the mock records the sustained block AS IT LOOKS at the instant re-resolution begins,
// which is the only moment that distinguishes the fixed code from the broken code.
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { installFoundryStub, resetCaptures, registerUuid, makeActor } from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

// vi.hoisted: the vi.mock factory is hoisted above the imports, so its closure state has to be too.
const mocked = vi.hoisted(() => {
  const seenBlocks = [];
  return {
    seenBlocks,
    resolveManifest: async (actor) => {
      seenBlocks.push((actor.getFlag("better-dh2e", "sustained") ?? []).map((e) => e.powerId));
    },
    rollManifest: async () => {},
  };
});
vi.mock("../scripts/rolls/manifest.mjs", () => ({
  resolveManifest: mocked.resolveManifest,
  rollManifest: mocked.rollManifest,
}));

// fate.mjs pulls in attack.mjs / roll-test.mjs, which destructure `foundry.applications.*` at MODULE
// SCOPE — the stub must be installed before the dynamic import (see attack-effective-weapon.test.mjs).
let rerollFromFate;
beforeAll(async () => {
  installFoundryStub();
  ({ rerollFromFate } = await import("../scripts/rolls/fate.mjs"));
});
beforeEach(() => {
  resetCaptures();
  mocked.seenBlocks.length = 0;
});

/** An owner-controlled psyker with Fate to spend, holding P (the power being rerolled) and B. */
function makePsyker() {
  const power = { id: "power-P", name: "Fiery Form", type: "psychicPower", system: {} };
  const held = ["power-P", "power-B"].map((powerId) => ({
    powerId, name: powerId, castEffPR: 5, sustainAction: "half",
  }));
  const actor = makeActor({
    system: { fate: { value: 3 } },
    items: [power],
    flags: { [NS]: { sustained: held } },
  });
  registerUuid(actor.uuid, actor);
  return actor;
}

/** The reroll payload a SUCCESSFUL sustained cast card carries. */
function castRerollMessage(actor, overrides = {}) {
  return {
    flags: {
      [NS]: {
        reroll: {
          kind: "cast", actorUuid: actor.uuid, powerId: "power-P",
          success: true, sustain: true,
          rulesetKey: "dh2e", state: "push", statePR: 5, prBonus: 0, effPR: 5, circ: 0,
          ...overrides,
        },
      },
    },
  };
}

function heldIds(actor) {
  return (actor.getFlag(NS, "sustained") ?? []).map((e) => e.powerId);
}

describe("Fate reroll of a successful sustained cast", () => {
  it("releases the recast power BEFORE re-resolving, so the re-resolution sees a block without it", async () => {
    const actor = makePsyker();
    expect(heldIds(actor)).toEqual(["power-P", "power-B"]);   // precondition: P really is held

    await rerollFromFate(castRerollMessage(actor));

    expect(mocked.seenBlocks).toHaveLength(1);
    // The whole point: at the instant resolveManifest ran, P was already gone and B was untouched.
    // Without the release this would be ["power-P", "power-B"].
    expect(mocked.seenBlocks[0]).toEqual(["power-B"]);
    expect(heldIds(actor)).toEqual(["power-B"]);
  });

  it("does not release anything when the cast being rerolled was not sustained", async () => {
    const actor = makePsyker();

    await rerollFromFate(castRerollMessage(actor, { sustain: false }));

    // P is held from some earlier cast; a non-sustaining reroll must not tear it down.
    expect(mocked.seenBlocks[0]).toEqual(["power-P", "power-B"]);
    expect(heldIds(actor)).toEqual(["power-P", "power-B"]);
  });
});
