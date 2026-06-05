// scripts/sheets/item-sheet.mjs
import { BDH } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class DarkHeresyItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "item"],
    position: { width: 480, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const t = this.document.type;
    context.document = this.document;
    context.system = this.document.system;
    context.isTalent = t === "talent";
    context.isGear = t === "gear";
    context.isForceField = t === "forceField";
    context.isCybernetic = t === "cybernetic";
    context.isArmour = t === "armour";
    context.craftChoices = BDH.craftsmanship;
    context.availChoices = BDH.availability;
    context.tierChoices = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
    context.aptitudeChoices = Object.fromEntries(BDH.aptitudes.map((a) => [a, a]));
    return context;
  }

  /** Select-all on focus for short text/number fields (not name or description) — speeds bulk entry. */
  _onRender(context, options) {
    super._onRender(context, options);
    const fields = this.element.querySelectorAll('input[type="text"]:not([name="name"]), input[type="number"]');
    for (const el of fields) {
      el.addEventListener("focus", (event) => event.currentTarget.select());
    }
  }
}
