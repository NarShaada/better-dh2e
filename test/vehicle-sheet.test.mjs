// test/vehicle-sheet.test.mjs
//
// The vehicle sheet had no tests. These pin the two defects found in the 2026-11 audit:
//
//  1. Dropping a weapon on a crew seat embedded it TWICE. #onSeatDrop called stopPropagation() only
//     after awaiting the dropped item, by which time the drop had already bubbled to ActorSheetV2's
//     own handler, which embeds any dropped Item. The second copy is mounted nowhere and no part of
//     the sheet lists it. The same bubbling embedded a non-weapon that the seat had just refused.
//  2. An inline edit (role name, condition text) was lost if ＋ / ✖ was clicked before the edit's
//     update came back: the click handler rebuilt the array from the not-yet-updated document.
//
// The sheet is driven through the same surfaces Foundry uses: the listeners _onRender attaches and
// the DEFAULT_OPTIONS.actions map.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { makeActor, makeWeapon, primeDialog } from "./helpers/foundry-stub.mjs";
import {
  installSheetStub, resetSheetCaptures, capturedWarnings, makeInput, makeSheetElement, slowUpdate, sleep,
} from "./helpers/sheet-stub.mjs";

let VehicleSheet;
beforeAll(async () => {
  installSheetStub();
  ({ VehicleSheet } = await import("../scripts/sheets/vehicle-sheet.mjs"));
});
beforeEach(() => resetSheetCaptures());

const driverSeat = () => ({ role: "Driver", fixed: true, actorUuid: "", operate: "", weapons: [] });

/** A vehicle whose update() lands after a round trip and whose embedded creates are recorded. */
function makeVehicle(system = {}) {
  const vehicle = makeActor({ type: "vehicle", system: { conditions: [], crew: [driverSeat()], ...system } });
  vehicle.update = slowUpdate(vehicle);
  vehicle.created = [];
  vehicle.createEmbeddedDocuments = async (_type, docs) => {
    await sleep(1);
    const made = docs.map((d) => ({ ...d, id: `emb-${vehicle.created.length + 1}` }));
    vehicle.created.push(...made);
    return made;
  };
  return vehicle;
}

/** A droppable Item whose resolution is asynchronous, as fromDropData (a uuid lookup) is. */
function droppable(item) {
  item.toObject = () => ({ name: item.name, type: item.type, system: item.system });
  globalThis.Item = { implementation: { fromDropData: async () => { await sleep(1); return item; } } };
  return { type: "Item", uuid: item.uuid };
}

async function renderWith(vehicle, map) {
  const sheet = new VehicleSheet({ document: vehicle });
  sheet.element = makeSheetElement(map);
  await sheet._onRender({}, {});
  return sheet;
}

describe("dropping an Item on a crew seat", () => {
  it("stops the drop bubbling before its first await, so the base sheet cannot embed a second copy", async () => {
    const vehicle = makeVehicle();
    const seat = makeInput({ dataset: { seatIndex: "0" } });
    await renderWith(vehicle, { "[data-seat-index]": [seat] });

    const { event, done } = seat.fire("drop", { dragData: droppable(makeWeapon({ name: "Heavy Stubber" })) });

    // Checked SYNCHRONOUSLY: a DOM event finishes bubbling before any awaited code resumes, so a
    // stopPropagation() that runs after an await is a no-op.
    expect(event.propagationStopped).toBe(true);
    await done;
    expect(vehicle.created.map((d) => d.name)).toEqual(["Heavy Stubber"]);
    expect(vehicle.system.crew[0].weapons).toEqual([vehicle.created[0].id]);
  });

  it("refuses a non-weapon without letting it bubble into the base sheet either", async () => {
    const vehicle = makeVehicle();
    const seat = makeInput({ dataset: { seatIndex: "0" } });
    await renderWith(vehicle, { "[data-seat-index]": [seat] });
    const medikit = { id: "g1", uuid: "Item.g1", name: "Medikit", type: "gear", system: {} };

    const { event, done } = seat.fire("drop", { dragData: droppable(medikit) });

    expect(event.propagationStopped).toBe(true);
    await done;
    expect(vehicle.created).toEqual([]);
    expect(vehicle.system.crew[0].weapons).toEqual([]);
    expect(capturedWarnings()).toHaveLength(1);
  });

  it("leaves a drop it does not handle (not an Actor or Item) alone", async () => {
    const vehicle = makeVehicle();
    const seat = makeInput({ dataset: { seatIndex: "0" } });
    await renderWith(vehicle, { "[data-seat-index]": [seat] });

    const { event, done } = seat.fire("drop", { dragData: { type: "JournalEntry", uuid: "JournalEntry.j1" } });

    expect(event.propagationStopped).toBe(false);
    await done;
    expect(vehicle.created).toEqual([]);
  });
});

describe("dropping an Item on the vehicle sheet outside any seat", () => {
  it("is refused rather than embedded where nothing displays it", async () => {
    const vehicle = makeVehicle();
    const sheet = await renderWith(vehicle, {});
    const lasgun = makeWeapon({ name: "Lasgun" });

    await sheet._onDropItem({}, lasgun);

    expect(sheet.baseItemDrops).toEqual([]);     // never reached core's "embed it" handling
    expect(vehicle.created).toEqual([]);
    expect(capturedWarnings()).toHaveLength(1);
  });
});

describe("an inline edit followed at once by ＋ or ✖", () => {
  const action = (name) => VehicleSheet.DEFAULT_OPTIONS.actions[name];

  it("keeps condition text typed just before ＋ is clicked", async () => {
    const vehicle = makeVehicle({ conditions: [""] });
    const input = makeInput({ value: "On fire", dataset: { condIndex: "0" } });
    const sheet = await renderWith(vehicle, { "[data-cond-index]": [input] });

    // Blur fires `change`; the click lands before that edit's update has come back.
    const edit = input.fire("change");
    const add = action("addCondition").call(sheet, {}, { dataset: {} });
    await Promise.all([edit.done, add]);

    expect(vehicle.system.conditions).toEqual(["On fire", ""]);
  });

  it("keeps a condition edit when another row is removed straight after", async () => {
    const vehicle = makeVehicle({ conditions: ["Tracked", "old", ""] });
    const input = makeInput({ value: "Engine hit", dataset: { condIndex: "1" } });
    const sheet = await renderWith(vehicle, { "[data-cond-index]": [input] });

    const edit = input.fire("change");
    const remove = action("removeCondition").call(sheet, {}, { dataset: { index: "2" } });
    await Promise.all([edit.done, remove]);

    expect(vehicle.system.conditions).toEqual(["Tracked", "Engine hit"]);
  });

  it("keeps a renamed role when a new role is added straight after", async () => {
    const vehicle = makeVehicle({ crew: [driverSeat(), { role: "Crew", fixed: false, actorUuid: "", operate: "", weapons: [] }] });
    const input = makeInput({ value: "Gunner", dataset: { vehIndex: "1", vehField: "role" } });
    const sheet = await renderWith(vehicle, { "[data-veh-field]": [input] });

    const edit = input.fire("change");
    const add = action("addRole").call(sheet, {}, { dataset: {} });
    await Promise.all([edit.done, add]);

    expect(vehicle.system.crew.map((s) => s.role)).toEqual(["Driver", "Gunner", "Crew"]);
  });

  it("applies two quick inline edits to different rows — neither overwrites the other", async () => {
    const vehicle = makeVehicle({ conditions: ["", ""] });
    const first = makeInput({ value: "On fire", dataset: { condIndex: "0" } });
    const second = makeInput({ value: "Immobilised", dataset: { condIndex: "1" } });
    const sheet = await renderWith(vehicle, { "[data-cond-index]": [first, second] });

    first.fire("change");
    second.fire("change");
    await sheet._writes.idle();

    expect(vehicle.system.conditions).toEqual(["On fire", "Immobilised"]);
  });
});

// A seat's mounted weapons are embedded items that ONLY that seat lists. Removing the seat used to
// leave them on the vehicle with nothing on the sheet to show or delete them.
describe("removing a crew role", () => {
  const action = (name) => VehicleSheet.DEFAULT_OPTIONS.actions[name];
  const gunnerSeat = (weapons = []) => ({ role: "Gunner", fixed: false, actorUuid: "", operate: "", weapons });

  /** A vehicle with a Gunner seat mounting `mounted`, recording embedded deletions. */
  function withGunner(mounted) {
    const vehicle = makeVehicle({ crew: [driverSeat(), gunnerSeat(mounted.map((w) => w.id))] });
    vehicle.items.push(...mounted);
    vehicle.deleted = [];
    vehicle.deleteEmbeddedDocuments = async (_type, ids) => { vehicle.deleted.push(...ids); };
    return vehicle;
  }

  it("deletes the weapons mounted to it, after asking", async () => {
    const stubber = makeWeapon({ name: "Heavy Stubber" });
    const vehicle = withGunner([stubber]);
    const sheet = await renderWith(vehicle, {});

    await action("removeRole").call(sheet, {}, { dataset: { index: "1" } });

    expect(vehicle.system.crew.map((s) => s.role)).toEqual(["Driver"]);
    expect(vehicle.deleted).toEqual([stubber.id]);
  });

  it("changes nothing when the GM says no", async () => {
    const stubber = makeWeapon({ name: "Heavy Stubber" });
    const vehicle = withGunner([stubber]);
    const sheet = await renderWith(vehicle, {});
    primeDialog([false]);

    await action("removeRole").call(sheet, {}, { dataset: { index: "1" } });

    expect(vehicle.system.crew.map((s) => s.role)).toEqual(["Driver", "Gunner"]);
    expect(vehicle.deleted).toEqual([]);
  });

  it("removes an unarmed seat without asking", async () => {
    const vehicle = withGunner([]);
    const sheet = await renderWith(vehicle, {});
    primeDialog([false]);                              // would refuse, if it were asked

    await action("removeRole").call(sheet, {}, { dataset: { index: "1" } });

    expect(vehicle.system.crew.map((s) => s.role)).toEqual(["Driver"]);
  });

  it("still refuses to remove the Driver", async () => {
    const vehicle = withGunner([]);
    const sheet = await renderWith(vehicle, {});

    await action("removeRole").call(sheet, {}, { dataset: { index: "0" } });

    expect(vehicle.system.crew.map((s) => s.role)).toEqual(["Driver", "Gunner"]);
    expect(capturedWarnings()).toHaveLength(1);
  });
});

// The confirm dialog takes time, and the crew can change under it (another ✖ on the same sheet, or
// another client). Seats have no id — only a position — so "the seat at index 2" may be a different
// seat by the time the answer arrives. Guessing would remove the wrong seat AND delete the weapons
// of one that stays, so a crew that changed means nothing is removed.
describe("removing a crew role while the crew changes under the confirm dialog", () => {
  const action = (name) => VehicleSheet.DEFAULT_OPTIONS.actions[name];
  const seat = (weapons = []) => ({ role: "Crew", fixed: false, actorUuid: "", operate: "", weapons });
  const Dialog = () => foundry.applications.api.DialogV2;
  let realConfirm;
  beforeEach(() => { realConfirm = Dialog().confirm; });
  afterEach(() => { Dialog().confirm = realConfirm; });

  it("removes nothing, deletes nothing, and says so", async () => {
    const b = makeWeapon({ name: "Weapon B" }), c = makeWeapon({ name: "Weapon C" });
    const vehicle = makeVehicle({ crew: [driverSeat(), seat(), seat([b.id]), seat([c.id])] });
    vehicle.items.push(b, c);
    vehicle.deleted = [];
    vehicle.deleteEmbeddedDocuments = async (_type, ids) => { vehicle.deleted.push(...ids); };
    const sheet = await renderWith(vehicle, {});
    // While the GM is reading the dialog for seat 2, seat 1 (unarmed, so not asked about) is removed.
    Dialog().confirm = async () => {
      await action("removeRole").call(sheet, {}, { dataset: { index: "1" } });
      return true;
    };

    await action("removeRole").call(sheet, {}, { dataset: { index: "2" } });

    expect(vehicle.system.crew.map((s) => s.weapons)).toEqual([[], [b.id], [c.id]]);   // only seat 1 went
    expect(vehicle.deleted).toEqual([]);
    expect(capturedWarnings()).toHaveLength(1);
  });

  it("asks in a modal dialog, so the sheet underneath cannot be clicked meanwhile", async () => {
    const b = makeWeapon({ name: "Weapon B" });
    const vehicle = makeVehicle({ crew: [driverSeat(), seat([b.id])] });
    vehicle.items.push(b);
    vehicle.deleteEmbeddedDocuments = async () => {};
    const sheet = await renderWith(vehicle, {});
    let asked = null;
    Dialog().confirm = async (config) => { asked = config; return true; };

    await action("removeRole").call(sheet, {}, { dataset: { index: "1" } });

    expect(asked.modal).toBe(true);
  });
});
