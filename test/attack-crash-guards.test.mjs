// test/attack-crash-guards.test.mjs
//
// Three chat-card buttons that threw instead of working (2026-11 audit):
//   - Roll Damage on a psychic attack cast by a HORDE: the horde damage-bonus line dereferenced
//     `weapon`, which is null on the psychic path.
//   - Roll Damage on a psychic card whose caster no longer exists: `actor.system` on null.
//   - WP Test / Evade for a VEHICLE caught in a Suppressive Fire cone: both read
//     characteristics / skills, which a vehicle does not have. Spray and the ordinary Evade already
//     special-case vehicles; the suppressing-fire cards did not.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedMessages, registerUuid, makeActor, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let bindCardButtons, warnings;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true, enableHordes: true } });
  ({ bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => {
  resetCaptures();
  warnings = [];
  ui.notifications.warn = (m) => warnings.push(String(m));
});

async function click(flags, button) {
  const html = makeCardHtml({ buttons: [button] });
  bindCardButtons({ flags: { [NS]: flags } }, html);
  await html.click(typeof button === "string" ? button : button.bdh);
}

const psychicCard = (casterUuid) => ({
  type: "attack", psychic: true, actorUuid: casterUuid, weaponName: "Smite",
  damage: "1d10+2", penetration: 0, damageType: "energy", qualities: [], isRanged: true,
  dos: 2, success: true, hits: [{ index: 0, location: "body", label: "Body" }],
});

describe("Roll Damage on a psychic attack card", () => {
  it("works when the caster is a horde", async () => {
    const caster = makeActor({ type: "horde", name: "Psyker Coven", system: { magnitude: 30, psyRating: 3 } });
    registerUuid(caster.uuid, caster);

    await click(psychicCard(caster.uuid), "rollDamage");

    expect(capturedMessages().at(-1)?.flags?.[NS]?.type).toBe("damage");
  });

  it("warns instead of throwing when the caster no longer exists", async () => {
    await click(psychicCard("Actor.deleted-caster"), "rollDamage");

    expect(capturedMessages()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});

describe("a vehicle caught in a Suppressive Fire cone", () => {
  function makeVehicle({ withDriver = true } = {}) {
    const driver = makeActor({ name: "Driver", system: { skills: { operate: { specialties: [] } } } });
    registerUuid(driver.uuid, driver);
    const vehicle = {
      id: "veh-1", type: "vehicle", uuid: "Actor.veh-1", name: "Chimera", items: [], statuses: new Set(),
      system: { armour: { front: 20 }, integrity: { value: 0, max: 30 },
                crew: [{ role: "Driver", fixed: true, actorUuid: withDriver ? driver.uuid : "", operate: "", weapons: [] }] },
    };
    registerUuid(vehicle.uuid, vehicle);
    return { vehicle, driver };
  }

  it("WP Test: says a vehicle does not test, and rolls nothing", async () => {
    const { vehicle } = makeVehicle();

    await click({ kind: "suppressWP", wpPenalty: -20 }, { bdh: "suppressWP", uuid: vehicle.uuid });

    const posted = capturedMessages();
    expect(posted).toHaveLength(1);
    expect(posted[0].content).toContain("Vehicle");
    expect(posted[0].flags?.[NS]?.reroll).toBeUndefined();     // a note, not a test card
  });

  it("Evade: the driver Jinks, as on every other card", async () => {
    const { vehicle, driver } = makeVehicle();

    await click({ kind: "suppressHit", hits: [] }, { bdh: "suppressEvade", uuid: vehicle.uuid });

    const card = capturedMessages().at(-1);
    expect(card.flags[NS].reroll.actorUuid).toBe(driver.uuid);
    expect(card.flags[NS].reroll.label).toContain("Jink");
  });

  it("Evade with no driver: warns instead of throwing", async () => {
    const { vehicle } = makeVehicle({ withDriver: false });

    await click({ kind: "suppressHit", hits: [] }, { bdh: "suppressEvade", uuid: vehicle.uuid });

    expect(capturedMessages()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
