// scripts/sheets/vehicle-sheet.mjs — dedicated sheet for the `vehicle` actor type.
// Phase 1: renders + edits all vehicle fields, crew roles, and conditions (stored-only, no automation).
// Phase 2 (deferred): drag-drop actors/weapons onto seats, the Manoeuvre roll, firing seat weapons.
import { BDH } from "../config.mjs";
import { woundsShown, woundsStored, reverseWoundsEnabled } from "../helpers/wounds-display.mjs";
import { skillTotal } from "../helpers/derived.mjs";
import { promptTest, performTest } from "../rolls/roll-test.mjs";
import { parseModifier } from "../rolls/test-logic.mjs";
import { rollAttack } from "../rolls/attack.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class VehicleSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor", "vehicle"],
    position: { width: 640, height: 760 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addRole: VehicleSheet.#onAddRole,
      removeRole: VehicleSheet.#onRemoveRole,
      addCondition: VehicleSheet.#onAddCondition,
      removeCondition: VehicleSheet.#onRemoveCondition,
      unseat: VehicleSheet.#onUnseat,
      rollManoeuvre: VehicleSheet.#onRollManoeuvre,
      fireSeatWeapon: VehicleSheet.#onFireSeatWeapon,
      removeWeapon: VehicleSheet.#onRemoveWeapon,
      editItem: VehicleSheet.#onEditItem,
      reloadWeapon: VehicleSheet.#onReloadWeapon
    }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/actor/vehicle-sheet.hbs" }
  };

  static TABS = {
    primary: {
      initial: "overview",
      tabs: [
        { id: "overview", label: "Overview" },
        { id: "crew", label: "Crew" }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const sys = this.actor.system;
    context.document = this.document;
    context.tabs = this._prepareTabs("primary");
    context.system = sys;
    // Integrity honours the "Reverse wounds display" setting, exactly like acolyte wounds.
    context.integrityShown = woundsShown(sys.integrity?.value ?? 0, sys.integrity?.max ?? 0, reverseWoundsEnabled());
    context.editable = this.isEditable;
    context.vehicleTypes = BDH.vehicleTypes;
    context.availabilityChoices = Object.fromEntries(Object.entries(BDH.availability).map(([k, v]) => [k, v]));
    context.sizeChoices = BDH.sizes;

    // Armour facings in display order (no Toughness — vehicles have flat AP per facing).
    context.facings = [
      { key: "front", label: "Front", ap: sys.armour.front },
      { key: "left",  label: "Left",  ap: sys.armour.left },
      { key: "right", label: "Right", ap: sys.armour.right },
      { key: "rear",  label: "Rear",  ap: sys.armour.rear }
    ];

    context.conditions = (sys.conditions ?? []).map((text, index) => ({ text, index }));

    // Crew seats: resolve the occupant + (for the Driver) the Operate-specialty options.
    context.crew = (sys.crew ?? []).map((seat, index) => {
      const occ = seat.actorUuid ? fromUuidSync(seat.actorUuid) : null;
      const weapons = (seat.weapons ?? [])
        .map((id) => this.actor.items.get(id))
        .filter(Boolean)
        .map((w) => {
          const flags = weaponClassFlags(w.system.weaponClass);
          return {
            id: w.id, name: w.name,
            summary: [w.system?.damage, w.system?.penetration != null ? `Pen ${w.system.penetration}` : null].filter(Boolean).join(" · "),
            attackChar: w.system?.weaponClass === "melee" ? "WS" : "BS",
            usesAmmo: flags.usesAmmo, clip: `${w.system.clip?.value ?? 0}/${w.system.clip?.max ?? 0}`
          };
        });
      const isDriver = seat.role === "Driver";
      let operateOptions = null, operateSel = seat.operate;
      if (isDriver) {
        // Fallback is always offered; the driver's known+ Operate specialties (if any) come after it.
        operateOptions = { "": "Agility −20 (untrained)" };
        const specs = occ?.system?.skills?.operate?.specialties ?? [];
        for (const sp of specs) operateOptions[sp.name] = `Operate (${sp.name})`;
        if (operateSel && !specs.some((s) => s.name === operateSel)) operateSel = "";   // stale pick → fallback
      }
      return {
        index,
        role: seat.role,
        fixed: seat.fixed,
        isDriver,
        operateOptions,
        operateSel,
        hasDriver: !!occ,
        occupant: occ ? { name: occ.name, img: occ.img, uuid: occ.uuid } : null,
        weapons
      };
    });
    return context;
  }

  /** Current crew as PLAIN objects with every field read explicitly. `deepClone` of the live
   *  DataModel seats yields empty objects (their values aren't own-enumerable), and on save the
   *  schema refills them with field defaults — which silently turned the Driver into a plain "Crew"
   *  seat. Reading each field by name avoids that. */
  #crewSource() {
    return (this.actor.system.crew ?? []).map((s) => ({
      role: s.role, fixed: !!s.fixed, actorUuid: s.actorUuid ?? "", operate: s.operate ?? "",
      weapons: [...(s.weapons ?? [])]
    }));
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Crew seat fields (role / operate): rewrite the WHOLE crew array — updating one element by
    // dotted index (`system.crew.1.role`) makes Foundry rebuild the array and reset the other seats.
    for (const el of this.element.querySelectorAll("[data-veh-field]")) {
      el.addEventListener("change", async (ev) => {
        const i = Number(ev.currentTarget.dataset.vehIndex);
        const field = ev.currentTarget.dataset.vehField;
        if (!Number.isInteger(i) || !field) return;
        const crew = this.#crewSource();
        if (!crew[i]) return;
        crew[i][field] = ev.currentTarget.value;
        await this.actor.update({ "system.crew": crew });
      });
    }
    // Conditions (array of strings): same — rewrite the whole array on edit.
    for (const el of this.element.querySelectorAll("[data-cond-index]")) {
      el.addEventListener("change", async (ev) => {
        const i = Number(ev.currentTarget.dataset.condIndex);
        if (!Number.isInteger(i)) return;
        const conditions = [...(this.actor.system.conditions ?? [])];
        conditions[i] = ev.currentTarget.value;
        await this.actor.update({ "system.conditions": conditions });
      });
    }
    // Integrity current value: convert the shown number back through the reverse-wounds setting.
    for (const input of this.element.querySelectorAll(".bdh-integrity-value")) {
      input.addEventListener("change", (ev) => {
        const typed = Number(ev.currentTarget.value);
        const max = this.actor.system.integrity?.max ?? 0;
        this.actor.update({ "system.integrity.value": woundsStored(typed, max, reverseWoundsEnabled()) });
      });
    }
    // Drop an actor onto a seat to occupy it.
    for (const seatEl of this.element.querySelectorAll("[data-seat-index]")) {
      seatEl.addEventListener("dragover", (ev) => ev.preventDefault());
      seatEl.addEventListener("drop", this.#onSeatDrop.bind(this));
    }
  }

  /** Drop onto a role card: an Actor seats the occupant; a weapon Item mounts to the seat. */
  async #onSeatDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    const i = Number(event.currentTarget.dataset.seatIndex);
    if (!Number.isInteger(i)) return;

    if (data?.type === "Actor") {
      event.preventDefault();
      event.stopPropagation();
      const actor = await Actor.implementation.fromDropData(data);
      if (!actor) return;
      if (actor.type === "vehicle") { ui.notifications.warn("A vehicle can't crew a vehicle."); return; }
      const crew = this.#crewSource();
      if (!crew[i]) return;
      crew[i].actorUuid = actor.uuid;
      await this.actor.update({ "system.crew": crew });
      return;
    }

    if (data?.type === "Item") {
      const item = await Item.implementation.fromDropData(data);
      if (!item || item.type !== "weapon") { ui.notifications.warn("Only weapons can be mounted to a seat."); return; }
      event.preventDefault();
      event.stopPropagation();
      const [created] = await this.actor.createEmbeddedDocuments("Item", [item.toObject()]);   // the vehicle owns the mount
      const crew = this.#crewSource();
      if (!crew[i]) return;
      crew[i].weapons = [...(crew[i].weapons ?? []), created.id];
      await this.actor.update({ "system.crew": crew });
    }
  }

  /** Fire a mounted weapon using the seat occupant's stats (the weapon stays owned by the vehicle). */
  static async #onFireSeatWeapon(event, target) {
    const seatIndex = Number(target.dataset.seat);
    const seat = this.actor.system.crew?.[seatIndex];
    const occ = seat?.actorUuid ? await fromUuid(seat.actorUuid) : null;
    if (!occ) { ui.notifications.warn("Seat a crew member to fire this weapon."); return; }
    const weapon = this.actor.items.get(target.dataset.itemId);
    if (!weapon) return;
    await rollAttack(occ, weapon.id, { weapon });
  }

  /** Open a mounted weapon's sheet (edit its stats/qualities), like the acolyte gear rows. */
  static #onEditItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(id)?.sheet.render(true);
  }

  /** Reload a mounted weapon — refill its clip to max. */
  static async #onReloadWeapon(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item) await item.update({ "system.clip.value": item.system.clip.max });
  }

  /** Unmount a weapon: drop it from the seat and delete the vehicle's copy. */
  static async #onRemoveWeapon(event, target) {
    const seatIndex = Number(target.dataset.seat);
    const weaponId = target.dataset.itemId;
    const crew = this.#crewSource();
    if (crew[seatIndex]) crew[seatIndex].weapons = (crew[seatIndex].weapons ?? []).filter((id) => id !== weaponId);
    await this.actor.update({ "system.crew": crew });
    await this.actor.items.get(weaponId)?.delete();
  }

  static async #onAddRole() {
    const crew = this.#crewSource();
    crew.push({ role: "Crew", fixed: false, actorUuid: "", operate: "", weapons: [] });
    await this.actor.update({ "system.crew": crew });
  }

  static async #onRemoveRole(event, target) {
    const i = Number(target.dataset.index);
    const crew = this.#crewSource();
    if (crew[i]?.fixed) { ui.notifications.warn("The Driver seat can't be removed."); return; }
    crew.splice(i, 1);
    await this.actor.update({ "system.crew": crew });
  }

  static async #onUnseat(event, target) {
    const i = Number(target.dataset.index);
    const crew = this.#crewSource();
    if (crew[i]) crew[i].actorUuid = "";
    await this.actor.update({ "system.crew": crew });
  }

  /** Manoeuvre: the seated driver's chosen Operate specialty (Agility-based), or the Ag−20 fallback
   *  when they have no Operate skill; the vehicle's manoeuvrability is pre-filled as the modifier. */
  static async #onRollManoeuvre(event, target) {
    const i = Number(target.dataset.index);
    const seat = this.actor.system.crew?.[i];
    const occ = seat?.actorUuid ? await fromUuid(seat.actorUuid) : null;
    if (!occ) { ui.notifications.warn("Seat a driver first."); return; }
    const man = this.actor.system.manoeuvrability ?? 0;
    const ag = occ.system?.characteristics?.agility?.total ?? 0;
    const specs = occ.system?.skills?.operate?.specialties ?? [];
    const spec = seat.operate ? specs.find((s) => s.name === seat.operate) : null;
    const sign = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;
    // Manoeuvrability + (fallback −20) are inherent breakdown rows; the typed modifier is strictly "on top".
    let base, label, inherent, info;
    if (spec) {
      base = skillTotal(ag, spec.rank);
      label = `Operate (${spec.name}) — ${this.actor.name}`;
      inherent = man;
      info = [{ label: "Manoeuvrability", value: sign(man) }];
    } else {
      base = ag;
      label = `Agility (Operate, untrained) — ${this.actor.name}`;
      inherent = man - 20;
      info = [{ label: "Untrained (Agility)", value: "−20" }, { label: "Manoeuvrability", value: sign(man) }];
    }
    const choice = await promptTest({ title: label, defaultModifier: "+0", info });
    if (!choice) return;
    const modifier = inherent + parseModifier(choice.modifier);   // evaluateTest clamps the total to ±60
    await performTest(occ, { label, base, modifier, characteristic: "agility" });
  }

  static async #onAddCondition() {
    const conditions = [...(this.actor.system.conditions ?? []), ""];
    await this.actor.update({ "system.conditions": conditions });
  }

  static async #onRemoveCondition(event, target) {
    const i = Number(target.dataset.index);
    const conditions = [...(this.actor.system.conditions ?? [])];
    conditions.splice(i, 1);
    await this.actor.update({ "system.conditions": conditions });
  }
}
