// test/attack-blast-card.test.mjs
//
// Four defects in the blast path, from the 2026-11 audit:
//   1. The blast DAMAGE card copied the attack card's flags wholesale, `reroll` included — so the
//      damage card offered "Spend Fate: Reroll", which re-fired the attack and placed a new template
//      after damage had been rolled.
//   2. Blast damage skipped the Primitive / Proven die clamp that every other damage path applies.
//   3. Evade on a blast attack card always rolled as the bound (primary) target, so a bystander
//      caught in the blast dodged with someone else's stats.
//   4. Roll Damage clicked while viewing a different scene tested that scene's tokens against the
//      template: it threw, or found nobody and deleted the template without rolling.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedMessages, primeDice,
  registerUuid, makeWeapon, makeActor, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let bindCardButtons, canReroll, canAddDoS, warnings;
beforeAll(async () => {
  installFoundryStub();
  ({ bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
  ({ canReroll, canAddDoS } = await import("../scripts/rolls/fate.mjs"));
});
beforeEach(() => {
  resetCaptures();
  warnings = [];
  ui.notifications.warn = (m) => warnings.push(String(m));
});
afterEach(() => {
  canvas.tokens.placeables = [];
  canvas.tokens.controlled = [];
  canvas.scene = null;
});

const lastFlags = () => capturedMessages().at(-1)?.flags?.[NS];

/** A blast attack card with `caught` standing in its template. */
function blastCard({ qualities = [{ key: "blast", value: 3 }], caught, extraFlags = {}, region = {} } = {}) {
  const weapon = makeWeapon({ system: { damage: "1d10+3", penetration: 2, damageType: "impact", qualities } });
  const attacker = makeActor({ name: "Attacker", system: { fate: { value: 2, max: 3 } } });
  registerUuid(attacker.uuid, attacker);
  registerUuid(weapon.uuid, weapon);
  for (const a of caught) registerUuid(a.uuid, a);
  const template = { uuid: "Scene.s1.Region.blast", deleted: false, async delete() { this.deleted = true; }, ...region };
  registerUuid(template.uuid, template);
  canvas.tokens.placeables = caught.map((actor) => ({ actor, name: actor.name, document: { testInsideRegion: () => true } }));
  const flags = {
    type: "attack", actorUuid: attacker.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
    qualities, penetration: 2, damageType: "impact",
    blast: 3, regionUuid: template.uuid, caughtUuids: caught.map((a) => a.uuid),
    ...extraFlags,
  };
  return { message: { flags: { [NS]: flags } }, attacker, weapon, template };
}

async function click(message, bdh) {
  const html = makeCardHtml({ buttons: [bdh] });
  bindCardButtons(message, html);
  await html.click(bdh);
}

describe("the blast damage card", () => {
  it("cannot be Fate-rerolled — it does not inherit the attack card's reroll data", async () => {
    const caught = [makeActor({ id: "blast-a" })];
    const { message, attacker } = blastCard({ caught });
    message.flags[NS].reroll = { kind: "attack", actorUuid: attacker.uuid, weaponId: "x", success: true, dosBonus: 0 };
    expect(canReroll(message)).toBe(true);            // the ATTACK card is rerollable, as it should be

    await click(message, "rollDamage");

    expect(lastFlags().blast).toBe(true);
    expect(canReroll({ flags: { [NS]: lastFlags() } })).toBe(false);
  });

  // Blast damage cards ALREADY in a world's chat log were written with the stray reroll data and
  // cannot be rewritten, so the Fate menu itself has to recognise them: a damage card is marked
  // `blast: true`, an attack card carries the blast RADIUS there.
  it("is refused by the Fate menu even when it is an old card that still carries reroll data", async () => {
    const attacker = makeActor({ name: "Attacker", system: { fate: { value: 2, max: 3 } } });
    registerUuid(attacker.uuid, attacker);
    const reroll = { kind: "attack", actorUuid: attacker.uuid, weaponId: "x", success: true, dosBonus: 0 };
    const oldDamageCard = { flags: { [NS]: { type: "attack", blast: true, poolUuids: [], damageTotal: 9, reroll } } };
    const attackCard = { flags: { [NS]: { type: "attack", blast: 3, reroll } } };

    expect(canReroll(oldDamageCard)).toBe(false);
    expect(canAddDoS(oldDamageCard)).toBe(false);
    expect(canReroll(attackCard)).toBe(true);
  });

  it("clamps the shared damage die for Primitive, as every other damage path does", async () => {
    const caught = [makeActor({ id: "blast-b" })];
    const { message } = blastCard({ caught, qualities: [{ key: "blast", value: 3 }, { key: "primitive", value: 7 }] });
    primeDice([10]);

    await click(message, "rollDamage");

    expect(lastFlags().damageTotal).toBe(10);          // die 10 → 7, +3
  });

  it("raises the die for Proven", async () => {
    const caught = [makeActor({ id: "blast-c" })];
    const { message } = blastCard({ caught, qualities: [{ key: "blast", value: 3 }, { key: "proven", value: 4 }] });
    primeDice([1]);

    await click(message, "rollDamage");

    expect(lastFlags().damageTotal).toBe(7);           // die 1 → 4, +3
  });

  it("clamps each of a horde's separately rolled hits too", async () => {
    const horde = makeActor({ id: "blast-horde", type: "horde", system: { magnitude: 30 } });
    const { message } = blastCard({ caught: [horde], qualities: [{ key: "blast", value: 3 }, { key: "primitive", value: 7 }] });
    primeDice([10, 9, 8, 2]);                          // the shared roll, then the horde's three hits

    await click(message, "rollDamage");

    expect(lastFlags().hordeBlast[0].totals).toEqual([10, 10, 5]);   // 9→7, 8→7, 2 stays; each +3
  });
});

describe("Evade on a blast attack card", () => {
  const evader = () => capturedMessages().at(-1)?.flags?.[NS]?.reroll?.actorUuid;

  it("rolls for the user's own selected token when it was caught in the blast", async () => {
    const primary = makeActor({ id: "ev-primary", name: "Primary" });
    const bystander = makeActor({ id: "ev-bystander", name: "Bystander" });
    const { message } = blastCard({ caught: [primary, bystander], extraFlags: { targetUuid: primary.uuid } });
    canvas.tokens.controlled = [{ actor: bystander }];

    await click(message, "evade");

    expect(evader()).toBe(bystander.uuid);
  });

  it("still rolls for the bound target when the selected token was not caught", async () => {
    const primary = makeActor({ id: "ev2-primary", name: "Primary" });
    const elsewhere = makeActor({ id: "ev2-elsewhere", name: "Elsewhere" });
    const { message } = blastCard({ caught: [primary], extraFlags: { targetUuid: primary.uuid } });
    canvas.tokens.controlled = [{ actor: elsewhere }];

    await click(message, "evade");

    expect(evader()).toBe(primary.uuid);
  });

  it("is unchanged on an ordinary attack card: the bound target evades", async () => {
    const target = makeActor({ id: "ev3-target", name: "Target" });
    const other = makeActor({ id: "ev3-other", name: "Other" });
    registerUuid(target.uuid, target);
    canvas.tokens.controlled = [{ actor: other }];

    await click({ flags: { [NS]: { type: "attack", targetUuid: target.uuid, qualities: [] } } }, "evade");

    expect(evader()).toBe(target.uuid);
  });
});

describe("Roll Damage clicked while viewing a different scene", () => {
  it("leaves the template alone and says where to click, instead of deleting it unrolled", async () => {
    const caught = [makeActor({ id: "scene-a" })];
    const { message, template } = blastCard({ caught, region: { parent: { id: "scene-of-the-blast", name: "Hab Block" } } });
    canvas.scene = { id: "some-other-scene" };
    canvas.tokens.placeables = [];                     // this scene has nobody in the template

    await click(message, "rollDamage");

    expect(template.deleted).toBe(false);
    expect(capturedMessages()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("rolls as usual on the blast's own scene", async () => {
    const caught = [makeActor({ id: "scene-b" })];
    const { message, template } = blastCard({ caught, region: { parent: { id: "s1" } } });
    canvas.scene = { id: "s1" };

    await click(message, "rollDamage");

    expect(lastFlags().poolUuids).toEqual([caught[0].uuid]);
    expect(template.deleted).toBe(true);
  });
});
