// scripts/sheets/actor-sheet.mjs
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class DarkHeresyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor"],
    position: { width: 760, height: 640 },
    window: { resizable: true }
  };

  static PARTS = {
    body: { template: "systems/better-dh2e/templates/actor/actor-shell.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.document = this.document;
    context.system = this.document.system;
    return context;
  }
}
