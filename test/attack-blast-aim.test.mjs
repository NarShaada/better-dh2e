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
// `canvas.ready` is undefined — falsy — so the WHOLE aim block would be skipped regardless of target,
// which would let both tests below pass for the wrong reason. Each test sets `canvas.ready = true`
// directly on the stub's exposed global right after installFoundryStub(), the same way
// attack-effective-weapon.test.mjs's Blast test (section 6) pokes `canvas.tokens.placeables` — a
// plain property assignment on the harness's own global, not new stub infrastructure.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedMessages,
  primeDialog, makeWeapon, makeActor, makeChoice,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

// attack.mjs destructures `foundry.applications.*` at MODULE SCOPE, so the stub must be installed
// before the dynamic import — see attack-effective-weapon.test.mjs for the same pattern.
let rollAttack;
beforeAll(async () => {
  installFoundryStub();
  ({ rollAttack } = await import("../scripts/rolls/attack.mjs"));
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
