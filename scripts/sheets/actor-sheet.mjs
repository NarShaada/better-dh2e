// scripts/sheets/actor-sheet.mjs
import { buildCharacteristics, buildSkills, fatiguePercent } from "../helpers/sheet-data.mjs";

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

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor"],
    position: { width: 800, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleUntrained: DarkHeresyActorSheet.#onToggleUntrained
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
    return context;
  }
}
