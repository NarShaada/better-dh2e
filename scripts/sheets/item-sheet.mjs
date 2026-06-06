// scripts/sheets/item-sheet.mjs
import { BDH } from "../config.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class DarkHeresyItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** Action: add the selected quality (with optional value) to the weapon. */
  static async #onAddQuality(event, target) {
    const root = this.element;
    const key = root.querySelector(".bdh-quality-key")?.value;
    if (!key) return;
    const takesValue = BDH.qualities[key]?.takesValue;
    const raw = root.querySelector(".bdh-quality-value")?.value;
    const value = takesValue ? (parseInt(raw, 10) || 0) : null;
    const qualities = foundry.utils.deepClone(this.document.system.qualities);
    qualities.push({ key, value });
    await this.document.update({ "system.qualities": qualities });
  }

  /** Action: remove a quality by index. */
  static async #onRemoveQuality(event, target) {
    const qualities = foundry.utils.deepClone(this.document.system.qualities);
    qualities.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.qualities": qualities });
  }

  /** Action: remove an installed mod by index. */
  static async #onRemoveMod(event, target) {
    const mods = foundry.utils.deepClone(this.document.system.mods);
    mods.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.mods": mods });
  }

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "item"],
    position: { width: 640, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addQuality: DarkHeresyItemSheet.#onAddQuality,
      removeQuality: DarkHeresyItemSheet.#onRemoveQuality,
      removeMod: DarkHeresyItemSheet.#onRemoveMod
    }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const t = this.document.type;
    const system = this.document.system;
    context.document = this.document;
    context.system = system;
    context.isTalent = t === "talent";
    context.isGear = t === "gear";
    context.isForceField = t === "forceField";
    context.isCybernetic = t === "cybernetic";
    context.isArmour = t === "armour";
    context.isWeapon = t === "weapon";
    context.isWeaponMod = t === "weaponMod";
    context.craftChoices = BDH.craftsmanship;
    context.availChoices = BDH.availability;
    context.tierChoices = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
    context.aptitudeChoices = Object.fromEntries(BDH.aptitudes.map((a) => [a, a]));

    if (context.isWeapon) {
      const flags = weaponClassFlags(system.weaponClass);
      context.usesRange = flags.usesRange;
      context.usesAmmo = flags.usesAmmo;
      context.weaponClasses = BDH.weaponClasses;
      context.weaponTypes = BDH.weaponTypes;
      context.damageTypes = BDH.damageTypes;
      context.reloadChoices = BDH.reload;
      context.qualityChoices = Object.fromEntries(Object.entries(BDH.qualities).map(([k, v]) => [k, v.label]));
      context.qualityList = system.qualities.map((q, i) => {
        const label = BDH.qualities[q.key]?.label ?? q.key;
        return { index: i, key: q.key, display: q.value != null ? `${label} (${q.value})` : label, automated: BDH.qualities[q.key]?.automated ?? false };
      });
      context.modList = system.mods.map((m, i) => ({ index: i, ...m }));
    }
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Select-all on focus for short text/number fields (not name/description) — faster bulk entry.
    // (Re-attached each render: these inputs are content that is replaced on every render.)
    for (const el of this.element.querySelectorAll('input[type="text"]:not([name="name"]), input[type="number"]')) {
      el.addEventListener("focus", (event) => event.currentTarget.select());
    }
  }

  /** One-time wiring: weapons accept a dropped weaponMod item to install. The frame element persists
   * across renders, so this must NOT be in _onRender (it would stack drop listeners and double-install). */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    if (this.document.type === "weapon") {
      this.element.addEventListener("dragover", (event) => event.preventDefault());
      this.element.addEventListener("drop", this.#onDropMod.bind(this));
    }
  }

  /** Install a dropped weaponMod by copying its fields into system.mods[]. */
  async #onDropMod(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item") return;
    const item = await Item.implementation.fromDropData(data);
    if (!item || item.type !== "weaponMod") return;
    const mods = foundry.utils.deepClone(this.document.system.mods);
    mods.push({
      name: item.name,
      attackMod: item.system.attackMod,
      damageMod: item.system.damageMod,
      penMod: item.system.penMod,
      special: item.system.special
    });
    await this.document.update({ "system.mods": mods });
  }
}
