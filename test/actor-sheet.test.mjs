// test/actor-sheet.test.mjs
//
// The actor sheet had no tests. These pin two defects found in the 2026-11 audit:
//
//  1. WOUNDS MAX GREW ON EVERY EDIT. BaseActorModel.prepareDerivedData adds Wounds stat-modifiers
//     (installed cybernetics, traits) onto `system.wounds.max`. The Custom-mode input was bound to
//     that derived number, and the sheet submits its whole form on any change — so base 10 with a
//     +2 modifier was written back as 12, derived to 14, written back as 14, and so on. `size` and
//     `unnatural` had the same hazard and already read from `_source`; Wounds max did not.
//  2. An inline edit (specialty name, affliction text, injury text, characteristic-damage amount)
//     was lost if ＋ / ✖ was clicked before the edit's update came back — see write-queue.test.mjs.
//
// _prepareContext is run for real against a fixture actor; the template is read from disk, because
// the bug lived in the pairing of the two and either half alone would not have caught it.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeActor } from "./helpers/foundry-stub.mjs";
import { installSheetStub, resetSheetCaptures, makeInput, makeSheetElement, slowUpdate } from "./helpers/sheet-stub.mjs";
import { BDH } from "../scripts/config.mjs";

const TEMPLATE = fileURLToPath(new URL("../templates/actor/actor-sheet.hbs", import.meta.url));

let DarkHeresyActorSheet;
beforeAll(async () => {
  installSheetStub({
    settings: { advancementRules: "dh2", sheetHeaderStyle: "dh2", psychicRules: "dh2", lockCustomMode: false, reverseWounds: false },
  });
  ({ DarkHeresyActorSheet } = await import("../scripts/sheets/actor-sheet.mjs"));
});
beforeEach(() => resetSheetCaptures());

const action = (name) => DarkHeresyActorSheet.DEFAULT_OPTIONS.actions[name];

/** An acolyte carrying every field _prepareContext reads. `system` is the PREPARED (derived) data;
 *  `source` overrides what is stored — the two differ exactly where prepareDerivedData mutates. */
function makeSheetActor({ system = {}, source = {} } = {}) {
  const characteristics = {};
  for (const key of Object.keys(BDH.characteristics)) characteristics[key] = { base: 30, advance: 0, unnatural: 0, total: 30, bonus: 3 };
  const skills = {};
  for (const [key, cfg] of Object.entries(BDH.skills)) {
    skills[key] = cfg.specialist ? { specialties: [] } : { rank: "untrained", favourite: false, total: 10 };
  }
  const base = {
    characteristics, skills,
    wounds: { value: 0, max: 10, critical: 0 },
    fatigue: { value: 0, max: 6, maxOverride: null },
    fate: { value: 2, max: 3 },
    size: 4, corruption: 0, insanity: 0, psyRating: 0, psykerClass: "bound", notes: "",
    afflictions: { mutations: [], malignancies: [], mentalDisorders: [] },
    injuries: [], advancementLog: [], aptitudes: [], alignment: "unaligned",
    experience: { total: 0, spent: 0 },
    initiative: { characteristic: "agility", dice: "1d10", baseKind: "characteristic", flat: 0, modifier: 0 },
    movementBase: { kind: "characteristic", characteristic: "agility", flat: 0, multiplier: 1, modifier: 0 },
    movement: { half: 3, full: 6, charge: 9, run: 18 },
  };
  const actor = makeActor({ system: { ...base, ...system } });
  actor._source = { system: { ...JSON.parse(JSON.stringify(base)), ...source } };
  actor.update = slowUpdate(actor);
  return actor;
}

async function renderWith(actor, map) {
  const sheet = new DarkHeresyActorSheet({ document: actor });
  sheet.element = makeSheetElement(map);
  await sheet._onRender({}, {});
  return sheet;
}

describe("Wounds max in Custom mode", () => {
  it("offers the STORED max for editing, not the derived one that already includes stat modifiers", async () => {
    // Stored 10; an installed cybernetic's +2 Wounds modifier makes the prepared value 12.
    const actor = makeSheetActor({
      system: { wounds: { value: 0, max: 12, critical: 0 } },
      source: { wounds: { value: 0, max: 10, critical: 0 } },
    });
    const context = await new DarkHeresyActorSheet({ document: actor })._prepareContext({});

    expect(context.woundsMaxBase).toBe(10);
    expect(context.system.wounds.max).toBe(12);   // the read-only display still shows the effective max
  });

  it("binds the editable Wounds max input to that stored value", () => {
    const hbs = readFileSync(TEMPLATE, "utf8");
    const input = hbs.match(/<input[^>]*name="system\.wounds\.max"[^>]*>/)?.[0];

    expect(input, "the Custom-mode Wounds max input").toBeDefined();
    expect(input).toContain('value="{{woundsMaxBase}}"');
  });

  it("copes with an actor type that has no Wounds at all (a horde)", async () => {
    const actor = makeSheetActor();
    actor.type = "horde";
    delete actor._source.system.wounds;
    delete actor.system.wounds;

    const context = await new DarkHeresyActorSheet({ document: actor })._prepareContext({});

    expect(context.woundsMaxBase).toBeNull();
  });
});

describe("an inline edit followed at once by ＋ or ✖", () => {
  it("keeps a specialty name typed just before ＋ is clicked", async () => {
    const actor = makeSheetActor();
    actor.system.skills.commonLore.specialties = [{ id: "s1", name: "New Specialty", rank: "known", favourite: false }];
    const input = makeInput({ value: "Imperium", dataset: { skill: "commonLore", specialty: "0", field: "name" } });
    const sheet = await renderWith(actor, { ".bdh-spec-input": [input] });

    // Blur fires `change`; the click lands before that edit's update has come back.
    const edit = input.fire("change");
    const add = action("addSpecialty").call(sheet, {}, { dataset: { skill: "commonLore" } });
    await Promise.all([edit.done, add]);

    expect(actor.system.skills.commonLore.specialties.map((s) => s.name)).toEqual(["Imperium", "New Specialty"]);
  });

  it("keeps a mutation name typed just before ＋ is clicked", async () => {
    const actor = makeSheetActor();
    actor.system.afflictions.mutations = [{ name: "", description: "" }];
    const row = { dataset: { array: "mutations", index: "0" } };
    const input = makeInput({ value: "Brute", dataset: { field: "name" }, closest: { "[data-array]": row } });
    const sheet = await renderWith(actor, { ".bdh-aff-input": [input] });

    const edit = input.fire("change");
    const add = action("addAffliction").call(sheet, {}, { dataset: { array: "mutations" } });
    await Promise.all([edit.done, add]);

    expect(actor.system.afflictions.mutations).toEqual([{ name: "Brute", description: "" }, { name: "", description: "" }]);
  });

  it("keeps an injury description when another injury is removed straight after", async () => {
    const actor = makeSheetActor();
    actor.system.injuries = [
      { type: "injury", description: "", characteristic: "", amount: 0 },
      { type: "injury", description: "old", characteristic: "", amount: 0 },
    ];
    const input = makeInput({ value: "Broken arm", dataset: { index: "0" } });
    const sheet = await renderWith(actor, { ".bdh-injury": [input] });

    const edit = input.fire("change");
    const remove = action("removeInjury").call(sheet, {}, { dataset: { index: "1" } });
    await Promise.all([edit.done, remove]);

    expect(actor.system.injuries.map((i) => i.description)).toEqual(["Broken arm"]);
  });

  it("applies a characteristic-damage amount and an injury description typed back to back", async () => {
    const actor = makeSheetActor();
    actor.system.injuries = [
      { type: "charDamage", description: "", characteristic: "toughness", amount: 1 },
      { type: "injury", description: "", characteristic: "", amount: 0 },
    ];
    const amount = makeInput({ value: "7", dataset: { index: "0" } });
    const text = makeInput({ value: "Concussion", dataset: { index: "1" } });
    const sheet = await renderWith(actor, { ".bdh-chardmg-amount": [amount], ".bdh-injury": [text] });

    amount.fire("change");
    text.fire("change");
    await sheet._writes.idle();

    expect(actor.system.injuries.map((i) => [i.amount, i.description])).toEqual([[7, ""], [0, "Concussion"]]);
  });
});
