// test/attack-suppress-horde.test.mjs
//
// Pins ONE thing: suppressing-fire hits applied to a HORDE must cost it Magnitude.
//
// applyHitToToken() deliberately does not write to a horde — it returns the effective damage and
// leaves the Magnitude write to its caller (a horde has no Wounds). Every other caller does that
// write (single hits, bursts, Spray, Blast, Toxic). applySuppressDamage did not, so its card
// reported the hits and the horde's Magnitude never moved.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, registerUuid, primeDice, capturedMessages,
  makeActor, makeWeapon, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let bindCardButtons;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true, enableHordes: true } });
  ({ bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => resetCaptures());

/** A suppress-hit card naming `target` as hit in `locKeys`, with its Apply button clicked. */
async function applySuppressingHits(target, { weapon = makeWeapon({ system: { damage: "1d10+3", penetration: 0 } }), locKeys = ["body"] } = {}) {
  const attacker = makeActor({ items: [weapon] });
  registerUuid(attacker.uuid, attacker);
  registerUuid(weapon.uuid, weapon);
  registerUuid(target.uuid, target);
  const message = { flags: { [NS]: {
    kind: "suppressHit", actorUuid: attacker.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
    hits: [{ uuid: target.uuid, locKeys }],
  } } };
  const html = makeCardHtml({ buttons: [{ bdh: "suppressApply", uuid: target.uuid }] });
  bindCardButtons(message, html);
  await html.click("suppressApply");
}

describe("Suppressive Fire — Apply Damage on a horde", () => {
  it("reduces Magnitude by one for a hit that gets through the soak", async () => {
    // TB 4, no armour: a 1d10+3 hit of 8+3 = 11 leaves 7 after soak → the horde loses Magnitude.
    const horde = makeActor({ type: "horde", name: "Cultist Mob", system: { magnitude: 30 } });
    primeDice([8]);

    await applySuppressingHits(horde);

    expect(horde.system.magnitude).toBe(29);
  });

  it("reports the Magnitude lost on the card", async () => {
    const horde = makeActor({ type: "horde", name: "Cultist Mob", system: { magnitude: 30 } });
    primeDice([8]);

    await applySuppressingHits(horde);

    expect(capturedMessages().at(-1).content).toContain("Magnitude");
  });

  it("leaves Magnitude alone when the soak stops every hit", async () => {
    // 1 + 3 = 4 against TB 4 → nothing gets through.
    const horde = makeActor({ type: "horde", name: "Cultist Mob", system: { magnitude: 30 } });
    primeDice([1]);

    await applySuppressingHits(horde);

    expect(horde.system.magnitude).toBe(30);
  });

  it("still applies Wounds, not Magnitude, to an ordinary target", async () => {
    const guard = makeActor({ name: "Guard", system: { wounds: { value: 0, max: 15, critical: 0 } } });
    primeDice([8]);

    await applySuppressingHits(guard);

    expect(guard.system.wounds.value).toBe(7);
    expect(guard.system.magnitude).toBe(0);   // the fixture's default; untouched
  });
});
