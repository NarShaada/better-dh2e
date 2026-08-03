// test/manifest-corruption.test.mjs
//
// Pins the WIRING of the Malefic Corruption grant in scripts/rolls/manifest.mjs (Enemies Beyond
// p. 54). The rule itself — how many points a cast is worth — lives in maleficCorruptionGain and is
// unit-tested in psychic-data.test.mjs; what is tested here is when resolveManifest actually writes
// to the actor.
//
// The case that matters most is the LAST one: Fate's "+1 DoS" button re-enters resolveManifest with
// `fixedRoll` set to replay the same successful cast. Without the fixedRoll gate the corruption
// block fires a second time and a single PR-4 Malefic cast bills the psyker 8 points instead of 4.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { installFoundryStub, resetCaptures, primeDice, makeActor } from "./helpers/foundry-stub.mjs";

// manifest.mjs destructures `foundry.applications.*` at module scope — stub first, import after.
let resolveManifest;
beforeAll(async () => {
  installFoundryStub({ settings: { maleficCorruption: true } });
  ({ resolveManifest } = await import("../scripts/rolls/manifest.mjs"));
});
beforeEach(() => resetCaptures());

/** A psyker with PR 4 and WP 40, starting at `corruption` points. */
function makePsyker(corruption = 10) {
  return makeActor({
    system: { psyRating: 4, psykerClass: "bound", corruption, fate: { value: 3 } },
  });
}

/** An Effect-type power on the given discipline (no attack routing, nothing to sustain). */
function makePower(discipline) {
  return {
    id: "power-P", name: "Summoning", type: "psychicPower",
    system: { type: "effect", discipline, focusTest: "willpower", focusModifier: 0, sustained: "no", opposed: false },
  };
}

const CAST = { rulesetKey: "dh2", state: "normal", statePR: 4, prBonus: 0, circ: 0, sustain: false };

describe("resolveManifest — Malefic Corruption grant (Enemies Beyond p. 54)", () => {
  it("grants the effective PR in Corruption on a successful Malefic cast", async () => {
    const actor = makePsyker(10);
    primeDice([10]);                                  // 1d100 = 10 vs WP 40 → success
    await resolveManifest(actor, makePower("malefic"), CAST);
    expect(actor.system.corruption).toBe(14);
  });

  it("counts the PR bonus, not the chosen rung", async () => {
    const actor = makePsyker(0);
    primeDice([10]);
    await resolveManifest(actor, makePower("malefic"), { ...CAST, prBonus: 2 });
    expect(actor.system.corruption).toBe(6);          // effective PR 6, not the statePR of 4
  });

  it("grants nothing when the Focus test fails", async () => {
    const actor = makePsyker(10);
    primeDice([95]);                                  // 1d100 = 95 vs WP 40 → failure
    await resolveManifest(actor, makePower("malefic"), CAST);
    expect(actor.system.corruption).toBe(10);
  });

  it("grants nothing on a non-Malefic discipline", async () => {
    const actor = makePsyker(10);
    primeDice([10]);
    await resolveManifest(actor, makePower("biomancy"), CAST);
    expect(actor.system.corruption).toBe(10);
  });

  // The defect this file exists for: Fate's "+1 DoS" re-resolves the SAME roll (fixedRoll set), so
  // `success` recomputes to true and `effPR` is unchanged — a second grant would silently double the
  // cost of the cast. A replay of a moment must not re-charge for it.
  it("does NOT re-grant on a +1 DoS re-resolution of the same successful cast", async () => {
    const actor = makePsyker(10);
    primeDice([10]);
    await resolveManifest(actor, makePower("malefic"), CAST);
    expect(actor.system.corruption).toBe(14);         // precondition: the original cast granted

    await resolveManifest(actor, makePower("malefic"), { ...CAST, fixedRoll: 10, dosBonus: 1 });
    expect(actor.system.corruption).toBe(14);         // unchanged — would be 18 without the gate
  });
});

describe("resolveManifest — Malefic Corruption disabled", () => {
  beforeAll(() => installFoundryStub({ settings: { maleficCorruption: false } }));
  beforeEach(() => resetCaptures());

  it("never touches Corruption when the GM tracks it by hand", async () => {
    const actor = makePsyker(10);
    primeDice([10]);
    await resolveManifest(actor, makePower("malefic"), CAST);
    expect(actor.system.corruption).toBe(10);
  });
});
