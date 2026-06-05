// scripts/sheets/actor-sheet.mjs
import { buildCharacteristics, buildSkills, fatiguePercent } from "../helpers/sheet-data.mjs";
import { rollCharacteristic, rollSkill } from "../rolls/roll-test.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class DarkHeresyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Investigation "hide untrained" filter state (per open sheet). */
  _hideUntrained = false;

  /** Action handler: toggle the hide-untrained filter and re-render. */
  static #onToggleUntrained(event, target) {
    this._hideUntrained = !this._hideUntrained;
    this.render();
  }

  /** Action: roll the clicked characteristic. */
  static async #onRollCharacteristic(event, target) {
    await rollCharacteristic(this.document, target.dataset.characteristic);
  }

  /** Action: roll the clicked skill (dialog offers a characteristic picker). */
  static async #onRollSkill(event, target) {
    await rollSkill(this.document, target.dataset.skill);
  }

  /** Action: create a new owned item of the given type and open its sheet. */
  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const name = `New ${game.i18n.localize(`TYPES.Item.${type}`)}`;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    created?.sheet.render(true);
  }

  /** Action: open an owned item's sheet for editing. */
  static #onEditItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(id)?.sheet.render(true);
  }

  /** Action: delete an owned item. */
  static async #onDeleteItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    await this.actor.items.get(id)?.delete();
  }

  /** Action: toggle a talent's favourite flag. */
  static async #onToggleFavourite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item) await item.update({ "system.favourite": !item.system.favourite });
  }

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor"],
    position: { width: 800, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleUntrained: DarkHeresyActorSheet.#onToggleUntrained,
      rollCharacteristic: DarkHeresyActorSheet.#onRollCharacteristic,
      rollSkill: DarkHeresyActorSheet.#onRollSkill,
      createItem: DarkHeresyActorSheet.#onCreateItem,
      editItem: DarkHeresyActorSheet.#onEditItem,
      deleteItem: DarkHeresyActorSheet.#onDeleteItem,
      toggleFavourite: DarkHeresyActorSheet.#onToggleFavourite
    }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/actor/actor-sheet.hbs" }
  };

  static TABS = {
    primary: {
      initial: "stats",
      tabs: [
        { id: "stats", label: "BDH.Sheet.Stats" },
        { id: "abilities", label: "BDH.Sheet.Abilities" },
        { id: "gear", label: "BDH.Sheet.Gear" },
        { id: "notes", label: "BDH.Sheet.Notes" },
        { id: "afflictions", label: "BDH.Sheet.Afflictions" },
        { id: "psychic", label: "BDH.Sheet.Psychic" },
        { id: "advancement", label: "BDH.Sheet.Advancement" }
      ]
    },
    secondary: {
      initial: "investigation",
      tabs: [
        { id: "investigation", label: "BDH.Sheet.Investigation" },
        { id: "combat", label: "BDH.Sheet.Combat" }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.document = this.document;
    context.system = system;
    context.characteristics = buildCharacteristics(system.characteristics);
    context.skills = buildSkills(system.skills);
    context.fatiguePct = fatiguePercent(system.fatigue?.value ?? 0, system.fatigue?.max ?? 0);
    context.hideUntrained = this._hideUntrained;
    // >1 tab group => context.tabs is not auto-injected; prepare both groups explicitly.
    context.tabs = this._prepareTabs("primary");
    context.subtabs = this._prepareTabs("secondary");
    const items = this.document.items;
    // First line of a (plain-text) description, truncated — a glance reference in list rows.
    const firstLine = (s) => {
      const line = (s ?? "").split(/\r?\n/)[0].trim();
      return line.length > 100 ? `${line.slice(0, 100)}…` : line;
    };
    context.talents = items.filter((i) => i.type === "talent").map((t) => ({
      id: t.id, name: t.name, favourite: t.system.favourite, tier: t.system.tier,
      desc: firstLine(t.system.description)
    }));
    context.traits = items.filter((i) => i.type === "trait").map((t) => ({
      id: t.id, name: t.name, desc: firstLine(t.system.description)
    }));
    return context;
  }
}
