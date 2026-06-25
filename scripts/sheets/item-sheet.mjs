// scripts/sheets/item-sheet.mjs
import { BDH } from "../config.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";
import { isPsychicAttack } from "../helpers/psychic-data.mjs";
import { filterQualityChoices } from "../helpers/quality-modules.mjs";
import { homebrewQualitiesEnabled } from "../helpers/homebrew.mjs";

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

  /** Action: add a bonus entry from the picker row (kind is derived from the chosen key). */
  static async #onAddBonus(event, target) {
    const root = this.element;
    const key = root.querySelector(".bdh-bonus-key")?.value;
    if (!key) return;
    const kind = BDH.skills[key] ? "skill" : "characteristic";
    const amount = parseInt(root.querySelector(".bdh-bonus-amount")?.value, 10) || 0;
    if (!amount) return;   // a zero bonus is inert — don't create a dead "+0" row (negatives are allowed)
    const type = this.document.type;
    let situational = !!root.querySelector(".bdh-bonus-situational")?.checked;
    let persistent = (type === "cybernetic" || type === "armour") && kind === "characteristic"
      && !!root.querySelector(".bdh-bonus-persistent")?.checked;
    if (type === "gear") { situational = true; persistent = false; }   // gear is situational-only
    if (persistent) situational = false;                               // mutually exclusive
    const bonuses = foundry.utils.deepClone(this.document.system.bonuses);
    bonuses.push({ kind, key, amount, situational, persistent });
    await this.document.update({ "system.bonuses": bonuses });
  }

  /** Action: remove a bonus entry by index. */
  static async #onRemoveBonus(event, target) {
    const bonuses = foundry.utils.deepClone(this.document.system.bonuses);
    bonuses.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.bonuses": bonuses });
  }

  /** Action: remove an installed mod by index. */
  static async #onRemoveMod(event, target) {
    const mods = foundry.utils.deepClone(this.document.system.mods);
    mods.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.mods": mods });
  }

  /** Action: add the picked aptitude to the talent item. */
  static async #onAddAptitude(event, target) {
    const pick = target.closest(".bdh-apt-add")?.querySelector(".bdh-apt-pick")?.value;
    if (!pick) return;
    const list = this.document.system.aptitudes ?? [];
    if (list.includes(pick)) return;
    await this.document.update({ "system.aptitudes": [...list, pick] });
  }

  /** Action: remove an aptitude from the talent item. */
  static async #onRemoveAptitude(event, target) {
    const apt = target.dataset.aptitude;
    await this.document.update({ "system.aptitudes": (this.document.system.aptitudes ?? []).filter((a) => a !== apt) });
  }

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "item"],
    position: { width: 640, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addQuality: DarkHeresyItemSheet.#onAddQuality,
      removeQuality: DarkHeresyItemSheet.#onRemoveQuality,
      removeMod: DarkHeresyItemSheet.#onRemoveMod,
      addAptitude: DarkHeresyItemSheet.#onAddAptitude,
      removeAptitude: DarkHeresyItemSheet.#onRemoveAptitude,
      addBonus: DarkHeresyItemSheet.#onAddBonus,
      removeBonus: DarkHeresyItemSheet.#onRemoveBonus,
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
    context.isPsychicPower = t === "psychicPower";
    context.craftChoices = BDH.craftsmanship;
    context.availChoices = BDH.availability;
    context.tierChoices = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
    if (context.isTalent) {
      context.availableAptitudes = BDH.aptitudes.filter((a) => !(system.aptitudes ?? []).includes(a));
    }

    if (context.isPsychicPower) {
      const s = this.document.system;
      context.disciplines = BDH.disciplines;
      context.psychicTypes = BDH.psychicTypes;
      context.psychicActions = BDH.psychicActions;
      context.damageTypes = BDH.damageTypes;
      context.charChoices = Object.fromEntries(Object.entries(BDH.characteristics).map(([k, c]) => [k, game.i18n.localize(c.label)]));
      context.focusOptions = [
        ...Object.entries(BDH.characteristics).map(([k, c]) => ({ key: k, label: game.i18n.localize(c.label) })),
        ...Object.entries(BDH.skills).map(([k, sk]) => ({ key: k, label: game.i18n.localize(sk.label) })),
      ];
      context.psyIsAttack = isPsychicAttack(s.type);
      context.psyIsBlast = s.type === "blast";
      context.psyOpposed = s.opposed;
      if (context.psyIsAttack) {
        context.qualityChoices = filterQualityChoices(BDH.qualities, homebrewQualitiesEnabled());
        context.qualityList = (s.qualities ?? []).map((q, i) => {
          const cfg = BDH.qualities[q.key];
          const label = cfg?.label ?? q.key;
          const automation = cfg?.automation;
          const display = cfg?.takesValue && q.value ? `${label} (${q.value})` : label;
          return { index: i, key: q.key, display, autoFull: automation === "full", autoPartial: automation === "partial" };
        });
      }
    }

    if (context.isWeapon) {
      const flags = weaponClassFlags(system.weaponClass);
      context.usesRange = flags.usesRange;
      context.usesAmmo = flags.usesAmmo;
      context.weaponClasses = BDH.weaponClasses;
      context.weaponTypes = BDH.weaponTypes;
      context.damageTypes = BDH.damageTypes;
      context.reloadChoices = BDH.reload;
      context.qualityChoices = filterQualityChoices(BDH.qualities, homebrewQualitiesEnabled());
      context.qualityList = system.qualities.map((q, i) => {
        const cfg = BDH.qualities[q.key];
        const label = cfg?.label ?? q.key;
        const automation = cfg?.automation;
        // Show the (value) only for qualities that actually take one (and have a truthy value) —
        // matches the chat cards and avoids "Reliable (0)" on value-less qualities.
        const display = cfg?.takesValue && q.value ? `${label} (${q.value})` : label;
        return { index: i, key: q.key, display, autoFull: automation === "full", autoPartial: automation === "partial" };
      });
      context.modList = system.mods.map((m, i) => ({ index: i, ...m }));
    }

    context.showBonuses = context.isCybernetic || context.isGear || context.isArmour;
    if (context.showBonuses) {
      context.allowPersistent = context.isCybernetic || context.isArmour;
      context.bonusTargetChoices = {
        ...Object.fromEntries(Object.entries(BDH.skills).map(([k, s]) => [k, `Skill: ${game.i18n.localize(s.label)}`])),
        ...Object.fromEntries(Object.entries(BDH.characteristics).map(([k, c]) => [k, `Char: ${game.i18n.localize(c.label)}`]))
      };
      context.bonusList = (system.bonuses ?? []).map((b, i) => {
        const lbl = BDH.skills[b.key]?.label ?? BDH.characteristics[b.key]?.label ?? b.key;
        const tag = b.persistent ? "persistent" : (b.situational ? "situational" : "always");
        return { index: i, display: `${game.i18n.localize(lbl)} ${b.amount >= 0 ? "+" : ""}${b.amount} (${tag})` };
      });
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
