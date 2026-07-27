// test/attack-effective-weapon.test.mjs
//
// Coverage for the "effective weapon" sweep through scripts/rolls/attack.mjs — the rewrite that made
// attack/damage resolution read effectiveWeapon(weapon.system) (base weapon folded with installed
// mods + loaded ammo, see scripts/helpers/weapon-effects.mjs) instead of raw weapon.system.* fields.
//
// QUALITY BAR: every fixture below carries mods and/or loaded ammo whose effect on damage/penetration/
// damageType/qualities is visible, and every assertion is on the EFFECTIVE value — never on a value
// that would read the same whether or not the sweep happened. See the mutation-testing demonstration
// in .superpowers/sdd/attack-harness-report.md for proof this harness can actually fail.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedRolls, capturedMessages,
  primeDice, primeDialog, registerUuid,
  makeWeapon, makeActor, makeChoice, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

// attack.mjs destructures `foundry.applications.api` at MODULE SCOPE (via roll-test.mjs too), so the
// stub must be installed before the dynamic import — a static import would blow up at collection time.
let resolveAttack, bindCardButtons;
beforeAll(async () => {
  installFoundryStub();
  ({ resolveAttack, bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => resetCaptures());

/** Pull the [NS] flags block off the most recently created chat message. */
function lastFlags() {
  const msgs = capturedMessages();
  return msgs[msgs.length - 1]?.flags?.[NS];
}
/** Pull + JSON-parse the templated content of the most recently created chat message
 *  (the stub's renderTemplate resolves to JSON.stringify(cardData)). */
function lastContentData() {
  const msgs = capturedMessages();
  return JSON.parse(msgs[msgs.length - 1].content);
}

describe("1. Single ranged attack — effective values reach the attack card", () => {
  it("reports the mod+ammo-composed penetration/damageType/damageFormula/qualities, and notes the net attack mod", async () => {
    const weapon = makeWeapon({
      system: {
        weaponClass: "basic", damage: "1d10+3", penetration: 4, damageType: "impact",
        qualities: [{ key: "tearing", value: null }],
        mods: [{ name: "Fire Sel", attackMod: 5, damageMod: "+2", penMod: 1 }],
        loadedAmmo: { name: "Man-Stopper", attackMod: -3, damageMod: "+1d5", penMod: 3, damageType: "", qualities: [] },
      },
    });
    const actor = makeActor();

    await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 1 });   // 1 always succeeds — evaluateTest special-cases it

    const f = lastFlags();
    // Base weapon alone would be pen 4 / "1d10+3" / no gearNote — every one of these asserts the
    // MOD+AMMO-FOLDED value, which is what would break if a call site were reverted to a raw read.
    expect(f.penetration).toBe(4 + 1 + 3);            // base 4, + mod penMod 1, + ammo penMod 3 = 8
    expect(f.damageType).toBe("impact");              // ammo's damageType is "" — weapon's own survives
    expect(f.damageFormula).toBe("1d10+3+2+1d5");      // base + mod fragment + ammo fragment, in order
    expect(f.qualities).toEqual([{ key: "tearing", value: null }]);

    const content = lastContentData();
    // attackMod: mod +5, ammo -3 => net +2 — the card's "Mods/Ammo +N" note surfaces exactly that.
    expect(content.attackNotes).toContain("Mods/Ammo +2");
  });
});

describe("2. Loaded ammo overrides damageType (and empty ammo damageType falls back to the weapon's own)", () => {
  it("ammo with a damageType overrides the weapon's", async () => {
    const weapon = makeWeapon({
      system: { damage: "1d10+3", damageType: "impact", penetration: 2,
        loadedAmmo: { name: "Inferno", attackMod: 0, damageMod: "", penMod: 0, damageType: "energy", qualities: [] } },
    });
    await resolveAttack(makeActor(), weapon, makeChoice(), { fixedRoll: 1 });
    expect(lastFlags().damageType).toBe("energy");
  });

  it("ammo with damageType: \"\" leaves the weapon's own damageType untouched", async () => {
    const weapon = makeWeapon({
      system: { damage: "1d10+3", damageType: "impact", penetration: 2,
        loadedAmmo: { name: "Bolt", attackMod: 0, damageMod: "", penMod: 0, damageType: "", qualities: [] } },
    });
    await resolveAttack(makeActor(), weapon, makeChoice(), { fixedRoll: 1 });
    expect(lastFlags().damageType).toBe("impact");
  });
});

describe("3. Ammo quality merge reaches the attack card", () => {
  it("grants a quality the weapon lacks, keeping the weapon's own", async () => {
    const weapon = makeWeapon({
      system: {
        qualities: [{ key: "tearing", value: null }],
        loadedAmmo: { name: "Inferno", attackMod: 0, damageMod: "", penMod: 0, damageType: "",
          qualities: [{ key: "flame", value: null }] },
      },
    });
    await resolveAttack(makeActor(), weapon, makeChoice(), { fixedRoll: 1 });
    const keys = lastFlags().qualities.map((q) => q.key).sort();
    expect(keys).toEqual(["flame", "tearing"]);
  });

  it("replaces a same-key quality's VALUE, and leaves unrelated qualities alone", async () => {
    const weapon = makeWeapon({
      system: {
        qualities: [{ key: "tearing", value: null }, { key: "blast", value: 2 }],
        loadedAmmo: { name: "Frag", attackMod: 0, damageMod: "", penMod: 0, damageType: "",
          qualities: [{ key: "blast", value: 5 }] },
      },
    });
    await resolveAttack(makeActor(), weapon, makeChoice(), { fixedRoll: 1 });
    const qualities = lastFlags().qualities;
    expect(qualities.find((q) => q.key === "blast").value).toBe(5);          // ammo's value wins
    expect(qualities.filter((q) => q.key === "blast")).toHaveLength(1);       // not duplicated
    expect(qualities.find((q) => q.key === "tearing")).toBeTruthy();          // unrelated quality survives
  });
});

describe("4. Damage roll — the composed formula actually reaches the dice", () => {
  it("rolls base + mod fragment + ammo fragment, and applies penMod to the applied penetration", async () => {
    const weapon = makeWeapon({
      system: {
        weaponClass: "basic", damage: "1d10+3", penetration: 4, damageType: "impact",
        mods: [{ name: "Heavy Barrel", attackMod: 0, damageMod: "+2", penMod: 1 }],
        loadedAmmo: { name: "Man-Stopper", attackMod: 0, damageMod: "+1d5", penMod: 3, damageType: "", qualities: [] },
      },
    });
    const actor = makeActor();
    registerUuid(actor.uuid, actor);
    registerUuid(weapon.uuid, weapon);

    // Attack first — this is what puts the composed damageFormula/penetration onto the follow-up
    // "Roll Damage" button's message flags.
    const attackMsg = await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 1 });
    resetCaptures();   // isolate the damage roll's captures from the attack roll's

    const html = makeCardHtml({ buttons: ["rollDamage"] });
    bindCardButtons(attackMsg, html);
    await html.click("rollDamage");

    const rolls = capturedRolls();
    expect(rolls).toContain("1d10+3+2+1d5");   // the exact composed formula, verbatim, reached `new Roll(...)`

    const damageFlags = lastFlags();
    expect(damageFlags.penetration).toBe(4 + 1 + 3);   // 8 — the effective, mod+ammo-folded penetration
    expect(damageFlags.damageType).toBe("impact");
  });
});

describe("5. Overheat path uses effective damage/damageType", () => {
  it("cooks off using the mod+ammo-composed damage formula and damageType", async () => {
    const weapon = makeWeapon({
      system: {
        weaponClass: "basic", damage: "1d10+3", damageType: "impact",
        qualities: [{ key: "overheats", value: null }],
        mods: [{ name: "Overcharge Coil", attackMod: 0, damageMod: "+3", penMod: 0 }],
        loadedAmmo: { name: "Hotshot", attackMod: 0, damageMod: "", penMod: 0, damageType: "energy", qualities: [] },
      },
    });
    const actor = makeActor();
    registerUuid(actor.uuid, actor);
    registerUuid(weapon.uuid, weapon);

    // Force a natural-91+ roll so isOverheats trips `overheated: true` on the attack card.
    const attackMsg = await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 95 });
    expect(lastFlags().overheated).toBe(true);
    resetCaptures();

    const html = makeCardHtml({ buttons: ["overheatDamage"] });
    bindCardButtons(attackMsg, html);
    await html.click("overheatDamage");

    // Overheat damage is rolled straight off effectiveWeapon(weapon.system) (see rollOverheatDamage) —
    // base "1d10+3" would never see the mod's "+3" fragment or the ammo's "energy" damageType.
    expect(capturedRolls()).toContain("1d10+3+3");
    const content = lastContentData();
    expect(content.damageType).toBe("energy");
  });
});

describe("6. Blast and Spray — effective values reach their cards", () => {
  it("Blast: Roll Damage on a blast attack card rolls the composed formula and carries effective pen/qualities", async () => {
    const weapon = makeWeapon({
      system: {
        weaponClass: "basic", damage: "1d10+3", penetration: 2, damageType: "impact",
        qualities: [{ key: "blast", value: 3 }],
        mods: [{ name: "Frag Adaptor", attackMod: 0, damageMod: "+1", penMod: 2 }],
        loadedAmmo: null,
      },
    });
    const actor = makeActor();
    const targetActor = makeActor({ id: "blast-target" });
    const targetToken = { actor: targetActor, name: "Target", document: { testInsideRegion: () => true } };
    registerUuid(actor.uuid, actor);
    registerUuid(weapon.uuid, weapon);
    const region = { uuid: "Scene.s1.Region.blast1", delete: async () => {} };
    registerUuid(region.uuid, region);

    // Build the flags a real blast-catching attack would have produced (see resolveAttack's blastFlags):
    // qualities/penetration/damageType already carry the effective (mod+ammo-folded) values computed at
    // attack time — the blast card must carry them through unchanged. damageFormula is left unset on
    // purpose so rollDamage's blast branch falls back to `blastEff.damage`, proving that fallback also
    // re-derives from effectiveWeapon rather than the bare weapon formula.
    const message = {
      flags: {
        [NS]: {
          actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
          damageFormula: null,
          qualities: [{ key: "blast", value: 3 }],
          penetration: 2 + 2,    // what resolveAttack would have computed: base 2 + mod penMod 2
          damageType: "impact",
          blast: 3, regionUuid: region.uuid, caughtUuids: [targetActor.uuid],
        },
      },
    };

    // canvas.tokens.placeables must list the caught token for tokensInRegion() to find it.
    globalThis.canvas.tokens.placeables = [targetToken];

    const html = makeCardHtml({ buttons: ["rollDamage"] });
    bindCardButtons(message, html);
    await html.click("rollDamage");

    // Base "1d10+3" would never show the mod's "+1" damage fragment — this proves the blast path
    // re-derives from effectiveWeapon rather than staying on the raw weapon formula.
    expect(capturedRolls()).toContain("1d10+3+1");
    const f = lastFlags();
    expect(f.penetration).toBe(4);
    expect(f.qualities).toEqual([{ key: "blast", value: 3 }]);
    expect(f.damageType).toBe("impact");

    globalThis.canvas.tokens.placeables = [];   // don't leak into later tests
  });

  it("Spray: applying a spray hit rolls the composed formula and merges the ammo's qualities", async () => {
    const weapon = makeWeapon({
      system: {
        weaponClass: "basic", damage: "1d10", penetration: 1, damageType: "impact",
        qualities: [{ key: "spray", value: null }],
        mods: [],
        loadedAmmo: { name: "Inferno", attackMod: 0, damageMod: "+2", penMod: 1, damageType: "",
          qualities: [{ key: "flame", value: null }] },
      },
    });
    const actor = makeActor();
    registerUuid(actor.uuid, actor);
    registerUuid(weapon.uuid, weapon);

    const message = {
      flags: {
        [NS]: {
          kind: "spray", actorUuid: actor.uuid, weaponId: weapon.id, weaponUuid: weapon.uuid,
          regionUuid: null, caughtUuids: [], damageType: "impact",
        },
      },
    };
    const html = makeCardHtml({ buttons: ["sprayApply"], sprayChecked: [] });
    bindCardButtons(message, html);
    await html.click("sprayApply");

    // Weapon alone: "1d10". Effective (ammo damageMod "+2"): "1d10+2" — reaching the dice proves
    // applySpray recomputed effectiveWeapon() rather than using the bare weapon formula.
    expect(capturedRolls()).toContain("1d10+2");
    const f = lastFlags();
    const keys = f.qualities.map((q) => q.key).sort();
    expect(keys).toEqual(["flame", "spray"]);   // ammo's Flame merged in, weapon's own Spray survives
  });
});

describe("7. Untouched-weapon invariant — no mods, no ammo ⇒ card flags are exactly the weapon's own stats", () => {
  it("produces the weapon's own damage/penetration/damageType/qualities verbatim", async () => {
    const weapon = makeWeapon({
      system: {
        damage: "1d10+4", penetration: 5, damageType: "rending",
        qualities: [{ key: "proven", value: 3 }],
        mods: [], loadedAmmo: null,
      },
    });
    await resolveAttack(makeActor(), weapon, makeChoice(), { fixedRoll: 1 });
    const f = lastFlags();
    expect(f.penetration).toBe(5);
    expect(f.damageType).toBe("rending");
    expect(f.damageFormula).toBe("1d10+4");
    expect(f.qualities).toEqual([{ key: "proven", value: 3 }]);

    const content = lastContentData();
    expect(content.attackNotes).not.toContain("Mods/Ammo");   // attackMod is 0 — no gear note at all
  });
});

describe("Weapon Jammed status", () => {
  // A jam is a ranged MISS at or above the jam floor: checkJam(roll, isSuccess, isRanged, floor)
  // returns `isRanged && !isSuccess && roll >= floor`. fixedRoll makes the d100 deterministic.
  const lowBS = { system: { characteristics: { ballisticSkill: { total: 30, bonus: 3 } } } };

  it("applies weaponJammed to the attacker when the attack jams", async () => {
    const actor = makeActor(lowBS);
    const weapon = makeWeapon({ system: { weaponClass: "basic" } });
    await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 97 });
    expect(actor.statusToggles).toContainEqual({ id: "weaponJammed", active: true });
    expect(actor.statuses.has("weaponJammed")).toBe(true);
  });

  it("does NOT apply it when the attack does not jam", async () => {
    const actor = makeActor({ system: { characteristics: { ballisticSkill: { total: 60, bonus: 6 } } } });
    const weapon = makeWeapon({ system: { weaponClass: "basic" } });
    await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 5 });
    expect(actor.statusToggles.some((t) => t.id === "weaponJammed")).toBe(false);
  });

  it("does not re-toggle when the attacker is already jammed (that would clear it)", async () => {
    const actor = makeActor({ ...lowBS, statuses: new Set(["weaponJammed"]) });
    const weapon = makeWeapon({ system: { weaponClass: "basic" } });
    await resolveAttack(actor, weapon, makeChoice(), { fixedRoll: 97 });
    expect(actor.statusToggles.some((t) => t.id === "weaponJammed")).toBe(false);
    expect(actor.statuses.has("weaponJammed")).toBe(true);
  });
});
