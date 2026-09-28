// test/attack-blast-aim.test.mjs
//
// Pins the tile-aiming GATE inside rollAttack() (scripts/rolls/attack.mjs): with the battlemap on
// and a Blast weapon armed, the interactive aim step must run when nothing is targeted, and must be
// skipped entirely when something IS targeted. The aiming gesture itself is a canvas interaction and
// can't be exercised here — but the gate that decides whether it happens at all is plain JavaScript,
// and the stub's `canvas.regions.placeRegion` already resolves null, which is exactly the
// player-cancelled path (see helpers/foundry-stub.mjs).
//
// This drives rollAttack, NOT resolveAttack. Every test in attack-effective-weapon.test.mjs (and its
// siblings) calls resolveAttack directly, which starts AFTER the aim step runs — those tests exercise
// nothing about the gate and would keep passing even if the gate were inverted.
//
// canvas.ready: the stub's canvas object never sets it (see helpers/foundry-stub.mjs), and the gate
// reads `canvas?.ready` as a guard against aiming before/without a live canvas. Left unset,
// `canvas.ready` is undefined — falsy — so the WHOLE aim block would be skipped regardless of
// target. For test 1 that would fail loudly: the aim step is what makes placeRegion's null
// resolution abort the attack, so skipping it means rollAttack proceeds to the dialog and
// `capturedMessages()` is no longer empty. For test 2 the assignment is inert either way — that
// test's target check short-circuits the gate before `canvas.ready` is even consulted. Each test
// sets `canvas.ready = true` directly on the stub's exposed global right after
// installFoundryStub() anyway, so the gate is always exercised for real rather than by omission —
// the same way attack-effective-weapon.test.mjs's Blast test (section 6) pokes
// `canvas.tokens.placeables` — a plain property assignment on the harness's own global, not new
// stub infrastructure.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedMessages,
  primeDialog, makeWeapon, makeActor, makeChoice,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

// attack.mjs destructures `foundry.applications.*` at MODULE SCOPE, so the stub must be installed
// before the dynamic import — see attack-effective-weapon.test.mjs for the same pattern.
let rollAttack, resolveAttack;
beforeAll(async () => {
  installFoundryStub();
  ({ rollAttack, resolveAttack } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => resetCaptures());

/** A weapon with a Blast(3) quality — a nonzero radius matters because the gate itself is also
 *  guarded on `aimRadius > 0` (a Blast(0) weapon skips aiming even with the battlemap on and no
 *  target; see attack.mjs). */
function blastWeapon() {
  return makeWeapon({
    system: {
      weaponClass: "basic", damage: "1d10+3", penetration: 2, damageType: "impact",
      qualities: [{ key: "blast", value: 3 }],
      mods: [], loadedAmmo: null,
    },
  });
}

describe("Blast tile-aiming gate (rollAttack)", () => {
  it("cancelling the aim (placeRegion resolves null) aborts the whole attack — no chat message", async () => {
    // Battlemap on, no target — the gate's default path, and the one the stub reaches for free:
    // placeRegion always resolves null, which is exactly a player pressing Esc on the placement.
    installFoundryStub({ settings: { enableBattlemap: true } });
    globalThis.canvas.ready = true;   // see file header — unset would mask the gate entirely
    const weapon = blastWeapon();
    const actor = makeActor();

    const result = await rollAttack(actor, weapon.id, { weapon });

    expect(result).toBeNull();
    expect(capturedMessages()).toEqual([]);   // no ammo spent, nothing happened
  });

  it("a targeted blast never aims: the aim step is skipped and the attack proceeds to a card", async () => {
    const targetActor = makeActor({ id: "blast-target" });
    const targetToken = { actor: targetActor, name: "Target" };
    installFoundryStub({ settings: { enableBattlemap: true }, target: targetToken });
    globalThis.canvas.ready = true;
    const weapon = blastWeapon();
    const actor = makeActor();
    // Canned attack-dialog answer: rollAttack drives the dialog itself here (unlike the sibling
    // suite, which calls resolveAttack past it), so the stub's default response — an unmodeled field
    // like "maximal" reading "+0" through its permissive proxy, which is truthy — would misfire.
    // makeChoice() gives every field an explicit, valid value instead.
    primeDialog([makeChoice()]);

    const result = await rollAttack(actor, weapon.id, { weapon });

    expect(result).not.toBeNull();
    expect(capturedMessages().length).toBeGreaterThan(0);
    expect(capturedMessages()[0].flags[NS].type).toBe("attack");   // reached the normal attack card
  });
});

// Pins finding 1: a Fate reroll of a tile-aimed blast must re-throw at the stored aimPoint, even
// when the rerolling user now has a live target. A tile-aimed attack records `targetUuid: null`
// (see fate.mjs, rr.targetUuid), so opts.targetUuid is falsy on the reroll and `liveTarget` falls
// through to game.user.targets.first() — this drives resolveAttack directly (past the aim step,
// which is a canvas gesture the gate test above already covers) with exactly that shape: a live
// target present AND an opts.aimPoint carried forward, to prove aimPoint wins.
describe("Fate reroll of a tile-aimed blast (finding 1)", () => {
  it("a live target present at reroll time does not steal the blast centre from the stored aimPoint", async () => {
    const bossActor = makeActor({ id: "boss" });
    // A live target the REROLLING user happens to have selected — center is deliberately far from
    // aimPoint below, so the assertion fails loudly if the old `targetToken?.center ?? opts.aimPoint`
    // order ever comes back.
    const bossToken = { actor: bossActor, name: "Boss", center: { x: 999, y: 999 } };
    const capturedRegions = [];
    const scene = {
      createEmbeddedDocuments: async (_type, docs) => {
        capturedRegions.push(docs[0]);
        return [{ ...docs[0], uuid: "Region.reroll-test" }];
      },
    };
    installFoundryStub({ settings: { enableBattlemap: true }, target: bossToken, scene });
    globalThis.canvas.ready = true;
    const weapon = blastWeapon();
    const actor = makeActor();
    const aimPoint = { x: 111, y: 222 };

    await resolveAttack(actor, weapon, makeChoice(), {
      fixedRoll: 1,        // always succeeds (evaluateTest special-case) — skips the miss/scatter branch
      consumeAmmo: false,  // this is a reroll: the shot was already paid for
      targetUuid: null,    // the original tile-aimed attempt recorded no target (rr.targetUuid)
      aimPoint,             // …and carries this point forward instead
    });

    expect(capturedRegions.length).toBe(1);        // the blast DID place a Region
    expect(capturedRegions[0].shapes[0]).toMatchObject({ x: aimPoint.x, y: aimPoint.y });
  });
});
