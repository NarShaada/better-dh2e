// test/item-sheet.test.mjs
//
// The item sheet had no tests. These pin two defects found in the 2026-11 audit:
//
//  1. The Add Quality / Add Bonus / Add Stat Modifier dialogs saved a BLANK row when the input was
//     invalid. Their `ok` callbacks return null to mean "invalid, do nothing", but DialogV2 turns a
//     nullish callback result into the button's action string, so the sheet received "ok", the
//     `if (!result) return` guard did not fire, and "ok" was pushed into the array — which the
//     schema then cleaned into a default-filled row.
//  2. A magazine count typed just before ✖ was clicked on another row was lost (stale-array race —
//     see test/write-queue.test.mjs).
//
// The dialogs are driven with sheet-stub's faithful DialogV2: it RUNS the sheet's own callback and
// applies the same nullish-to-action rule, so these tests fail on the real mistake rather than on a
// canned return value.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { makeWeapon } from "./helpers/foundry-stub.mjs";
import {
  installSheetStub, resetSheetCaptures, primeDialogSubmit, makeInput, makeSheetElement, slowUpdate,
} from "./helpers/sheet-stub.mjs";

let DarkHeresyItemSheet;
beforeAll(async () => {
  installSheetStub({ faithfulDialogs: true });
  ({ DarkHeresyItemSheet } = await import("../scripts/sheets/item-sheet.mjs"));
});
beforeEach(() => resetSheetCaptures());

const action = (name) => DarkHeresyItemSheet.DEFAULT_OPTIONS.actions[name];

/** An item whose update() lands after a round trip and records every payload it was sent. */
function makeItem(type, system) {
  const item = makeWeapon({ system });
  item.type = type;
  item.update = slowUpdate(item);
  return item;
}
const sheetFor = (item) => new DarkHeresyItemSheet({ document: item });

describe("Add Quality", () => {
  it("saves nothing when the typed text is not a quality", async () => {
    const weapon = makeItem("weapon", { qualities: [{ key: "tearing", value: null }] });
    primeDialogSubmit({ key: "tearing", value: "" });          // lowercase — the list offers "Tearing"

    await action("addQuality").call(sheetFor(weapon), {}, { dataset: {} });

    expect(weapon.update.sent).toEqual([]);
    expect(weapon.system.qualities).toEqual([{ key: "tearing", value: null }]);
  });

  it("adds the quality picked from the list, with its value", async () => {
    const weapon = makeItem("weapon", { qualities: [] });
    primeDialogSubmit({ key: "Proven", value: "3" });

    await action("addQuality").call(sheetFor(weapon), {}, { dataset: {} });

    expect(weapon.system.qualities).toEqual([{ key: "proven", value: 3 }]);
  });

  it("saves nothing when the dialog is dismissed", async () => {
    const weapon = makeItem("weapon", { qualities: [] });
    primeDialogSubmit(null);

    await action("addQuality").call(sheetFor(weapon), {}, { dataset: {} });

    expect(weapon.update.sent).toEqual([]);
  });
});

describe("Add Bonus", () => {
  it("saves nothing when the amount is blank", async () => {
    const armour = makeItem("armour", { bonuses: [] });
    primeDialogSubmit({ key: "Char: BDH.Char.Strength", amount: "" });

    await action("addBonus").call(sheetFor(armour), {}, { dataset: {} });

    expect(armour.update.sent).toEqual([]);
  });

  it("saves nothing when the typed name matches no skill or characteristic", async () => {
    const armour = makeItem("armour", { bonuses: [] });
    primeDialogSubmit({ key: "Strenght", amount: "10" });

    await action("addBonus").call(sheetFor(armour), {}, { dataset: {} });

    expect(armour.update.sent).toEqual([]);
  });
});

describe("Add Stat Modifier", () => {
  it("saves nothing when the amount is blank", async () => {
    const cyber = makeItem("cybernetic", { statMods: [] });
    primeDialogSubmit({ stat: "wounds", amount: "" });

    await action("addStatMod").call(sheetFor(cyber), {}, { dataset: {} });

    expect(cyber.update.sent).toEqual([]);
  });

  it("adds a valid modifier", async () => {
    const cyber = makeItem("cybernetic", { statMods: [] });
    primeDialogSubmit({ stat: "wounds", amount: "2" });

    await action("addStatMod").call(sheetFor(cyber), {}, { dataset: {} });

    expect(cyber.system.statMods).toEqual([{ stat: "wounds", amount: 2 }]);
  });
});

describe("a magazine count edited just before ✖ on another row", () => {
  it("survives the removal", async () => {
    const weapon = makeItem("weapon", { ammo: [{ name: "Standard", count: 1 }, { name: "Dumdum", count: 1 }] });
    const sheet = sheetFor(weapon);
    const input = makeInput({ value: "4", dataset: { index: "0" } });
    sheet.element = makeSheetElement({ ".bdh-ammo-count": [input] });
    sheet._onRender({}, {});

    const edit = input.fire("change");
    const remove = action("removeAmmo").call(sheet, {}, { dataset: { index: "1" } });
    await Promise.all([edit.done, remove]);

    expect(weapon.system.ammo).toEqual([{ name: "Standard", count: 4 }]);
  });
});
