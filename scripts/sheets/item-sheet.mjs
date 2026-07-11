// scripts/sheets/item-sheet.mjs
import { BDH } from "../config.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";
import { isPsychicAttack } from "../helpers/psychic-data.mjs";
import { filterQualityChoices } from "../helpers/quality-modules.mjs";
import { homebrewQualitiesEnabled } from "../helpers/homebrew.mjs";
import { canGrant, grantHostType } from "../helpers/grants-data.mjs";
import { grantsFolder } from "../cybernetics/grants.mjs";

const STAT_MOD_LABELS = {
  moveAll: "Movement (all bands)", moveHalf: "Movement: Half", moveFull: "Movement: Full",
  moveCharge: "Movement: Charge", moveRun: "Movement: Run",
  wounds: "Wounds", size: "Size", fatigue: "Fatigue threshold", carry: "Carry", initiative: "Initiative"
};

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class DarkHeresyItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** Action: add a quality via a searchable dialog (shared by weapon + psychic-power sheets). */
  static async #onAddQuality(event, target) {
    const choices = filterQualityChoices(BDH.qualities, homebrewQualitiesEnabled());
    // datalist option value = the LABEL (so the dropdown shows one clean string + filters by label);
    // map the label back to the registry key on submit.
    const labelToKey = {};
    const opts = Object.entries(choices)
      .sort((a, b) => a[1].localeCompare(b[1]))   // alphabetical by label
      .map(([k, label]) => { labelToKey[label] = k; return `<option value="${label}"></option>`; }).join("");
    const content = `<div class="bdh-add-dialog"><div class="bdh-add-line">
      <input class="bdh-pick" name="key" list="bdh-q-list" placeholder="Quality…" autofocus/>
      <datalist id="bdh-q-list">${opts}</datalist>
      <input class="bdh-num" name="value" type="number" placeholder="X"/>
    </div></div>`;
    const result = await DialogV2.prompt({
      window: { title: "Add Quality" }, position: { width: 340 }, content, rejectClose: false,
      ok: { label: "Add", callback: (ev, button) => {
        const f = new foundry.applications.ux.FormDataExtended(button.form).object;
        const key = labelToKey[f.key];
        if (!key || !BDH.qualities[key]) return null;
        const value = BDH.qualities[key].takesValue ? (parseInt(f.value, 10) || 0) : null;
        return { key, value };
      } }
    });
    if (!result) return;
    const qualities = foundry.utils.deepClone(this.document.system.qualities);
    qualities.push(result);
    await this.document.update({ "system.qualities": qualities });
  }

  /** Action: remove a quality by index. */
  static async #onRemoveQuality(event, target) {
    const qualities = foundry.utils.deepClone(this.document.system.qualities);
    qualities.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.qualities": qualities });
  }

  /** Action: add a bonus entry via a searchable dialog (kind derived from the chosen key). */
  static async #onAddBonus(event, target) {
    const type = this.document.type;
    // datalist option value = the LABEL (single clean string + label search); map back to the key on submit.
    const labelToKey = {};
    const opt = (k, label) => { labelToKey[label] = k; return `<option value="${label}"></option>`; };
    const opts = [
      ...Object.entries(BDH.skills).map(([k, s]) => opt(k, `Skill: ${game.i18n.localize(s.label)}`)),
      ...Object.entries(BDH.characteristics).map(([k, c]) => opt(k, `Char: ${game.i18n.localize(c.label)}`))
    ].join("");
    const content = `<div class="bdh-add-dialog"><div class="bdh-add-line">
      <input class="bdh-pick" name="key" list="bdh-b-list" placeholder="Skill or characteristic…" autofocus/>
      <datalist id="bdh-b-list">${opts}</datalist>
      <input class="bdh-num" name="amount" type="number" placeholder="±X"/>
    </div><div class="bdh-add-line">
      <label><input name="situational" type="checkbox"/> Situational</label>
      <label><input name="unnatural" type="checkbox"/> Unnatural (characteristic)</label>
    </div></div>`;
    const result = await DialogV2.prompt({
      window: { title: "Add Bonus" }, position: { width: 360 }, content, rejectClose: false,
      ok: { label: "Add", callback: (ev, button) => {
        const f = new foundry.applications.ux.FormDataExtended(button.form).object;
        const key = labelToKey[f.key];
        if (!key || (!BDH.skills[key] && !BDH.characteristics[key])) return null;
        const isChar = !!BDH.characteristics[key];
        const amount = parseInt(f.amount, 10) || 0;
        if (!amount) return null;   // a zero bonus is inert
        // Unnatural applies to characteristics only; it's inherently persistent (situational ignored).
        if (f.unnatural && isChar) return { kind: "unnatural", key, amount, situational: false };
        const kind = isChar ? "characteristic" : "skill";
        const situational = type === "gear" ? true : !!f.situational;   // gear is situational-only
        return { kind, key, amount, situational };
      } }
    });
    if (!result) return;
    const bonuses = foundry.utils.deepClone(this.document.system.bonuses);
    bonuses.push(result);
    await this.document.update({ "system.bonuses": bonuses });
  }

  /** Action: remove a bonus entry by index. */
  static async #onRemoveBonus(event, target) {
    const bonuses = foundry.utils.deepClone(this.document.system.bonuses);
    bonuses.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.bonuses": bonuses });
  }

  /** Action: add a derived-stat modifier via a small dialog. */
  static async #onAddStatMod(event, target) {
    const { DialogV2 } = foundry.applications.api;
    const opts = Object.entries(STAT_MOD_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
    const content = `<div class="bdh-add-dialog"><div class="bdh-add-line">
      <select class="bdh-stat-key" name="stat">${opts}</select>
      <input class="bdh-num" name="amount" type="number" placeholder="±X"/>
    </div></div>`;
    const result = await DialogV2.prompt({
      window: { title: "Add Stat Modifier" }, position: { width: 320 }, content, rejectClose: false,
      ok: { label: "Add", callback: (ev, button) => {
        const f = new foundry.applications.ux.FormDataExtended(button.form).object;
        const amount = parseInt(f.amount, 10) || 0;
        if (!f.stat || !STAT_MOD_LABELS[f.stat] || !amount) return null;
        return { stat: f.stat, amount };
      } }
    });
    if (!result) return;
    const statMods = foundry.utils.deepClone(this.document.system.statMods);
    statMods.push(result);
    await this.document.update({ "system.statMods": statMods });
  }

  /** Action: remove a derived-stat modifier by index. */
  static async #onRemoveStatMod(event, target) {
    const statMods = foundry.utils.deepClone(this.document.system.statMods);
    statMods.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.statMods": statMods });
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
      addStatMod: DarkHeresyItemSheet.#onAddStatMod,
      removeStatMod: DarkHeresyItemSheet.#onRemoveStatMod,
      grantCreate: DarkHeresyItemSheet.#onGrantCreate,
      grantRemove: DarkHeresyItemSheet.#onGrantRemove,
      grantEdit: DarkHeresyItemSheet.#onGrantEdit,
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
    context.isTrait = t === "trait";
    context.isWeapon = t === "weapon";
    context.isWeaponMod = t === "weaponMod";
    context.isPsychicPower = t === "psychicPower";
    context.craftChoices = BDH.craftsmanship;
    context.availChoices = BDH.availability;
    context.tierChoices = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
    // Quality cog: only shown when Non-Vanilla Qualities is enabled — black = Core, red = Non-Vanilla.
    context.showQualityCogs = homebrewQualitiesEnabled();
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
        context.qualityList = (s.qualities ?? []).map((q, i) => {
          const cfg = BDH.qualities[q.key];
          const label = cfg?.label ?? q.key;
          const display = cfg?.takesValue && q.value ? `${label} (${q.value})` : label;
          return { index: i, key: q.key, display, isHomebrew: cfg?.homebrew === true };
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
      context.qualityList = system.qualities.map((q, i) => {
        const cfg = BDH.qualities[q.key];
        const label = cfg?.label ?? q.key;
        // Show the (value) only for qualities that actually take one (and have a truthy value) —
        // matches the chat cards and avoids "Reliable (0)" on value-less qualities.
        const display = cfg?.takesValue && q.value ? `${label} (${q.value})` : label;
        return { index: i, key: q.key, display, isHomebrew: cfg?.homebrew === true };
      });
      context.modList = system.mods.map((m, i) => ({ index: i, ...m }));
    }

    context.showBonuses = context.isCybernetic || context.isGear || context.isArmour || context.isTrait;
    context.showStatMods = context.isCybernetic || context.isTrait;
    if (context.showBonuses) {
      context.bonusList = (system.bonuses ?? []).map((b, i) => {
        const lbl = BDH.skills[b.key]?.label ?? BDH.characteristics[b.key]?.label ?? b.key;
        const tag = b.kind === "unnatural" ? "unnatural" : (b.situational ? "situational" : "always");
        const unn = b.kind === "unnatural" ? " Unnatural" : "";
        return { index: i, display: `${game.i18n.localize(lbl)}${unn} ${b.amount >= 0 ? "+" : ""}${b.amount} (${tag})` };
      });
    }

    if (context.showStatMods) {
      context.statModList = (system.statMods ?? []).map((m, i) => ({
        index: i,
        display: `${STAT_MOD_LABELS[m.stat] ?? m.stat} ${m.amount >= 0 ? "+" : ""}${m.amount}`
      }));
    }

    context.showGrants = context.isCybernetic || context.isArmour || context.isTrait;
    if (context.showGrants) {
      context.grantList = (system.grants ?? []).map((g, i) => {
        let src = null;
        try { src = fromUuidSync(g.uuid); } catch { src = null; }   // live name/type from the source (the master)
        return { index: i, uuid: g.uuid, name: src?.name ?? g.name ?? g.uuid, type: src?.type ?? g.type ?? "", missing: !src };
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
    } else if (grantHostType(this.document)) {   // cybernetic / armour / trait
      this.element.addEventListener("dragover", (event) => event.preventDefault());
      this.element.addEventListener("drop", this.#onDropGrant.bind(this));
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

  /** Add a dropped item as a grant reference (validated against the host's grant rules). */
  async #onDropGrant(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item") return;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return;
    if (!canGrant(this.document.type, item.type)) {
      ui.notifications.warn(`A ${this.document.type} can't grant a ${item.type}.`);
      return;
    }
    const grants = foundry.utils.deepClone(this.document.system.grants);
    if (grants.some((g) => g.uuid === item.uuid)) return;   // no duplicate references
    grants.push({ uuid: item.uuid, name: item.name, type: item.type });
    await this.document.update({ "system.grants": grants });
  }

  /** Action: create a new real Item of an allowed type in the Granted Items folder and reference it. */
  static async #onGrantCreate(event, target) {
    const hostType = this.document.type;
    const TYPES = ["talent", "trait", "gear", "weapon", "armour", "forceField", "psychicPower"].filter((t) => canGrant(hostType, t));
    const opts = TYPES.map((t) => `<option value="${t}">${game.i18n.localize(`TYPES.Item.${t}`)}</option>`).join("");
    const type = await DialogV2.prompt({
      window: { title: "Create Granted Item" }, position: { width: 320 },
      content: `<div class="bdh-add-dialog"><div class="bdh-add-line"><label>Type</label><select name="type">${opts}</select></div></div>`,
      ok: { label: "Create", callback: (ev, b) => new foundry.applications.ux.FormDataExtended(b.form).object.type },
      rejectClose: false
    });
    if (!type) return;
    const folder = await grantsFolder();
    const created = await getDocumentClass("Item").create({ name: `New ${game.i18n.localize(`TYPES.Item.${type}`)}`, type, folder: folder.id });
    if (!created) return;
    const grants = foundry.utils.deepClone(this.document.system.grants);
    grants.push({ uuid: created.uuid, name: created.name, type: created.type });
    await this.document.update({ "system.grants": grants });
    created.sheet.render(true);
  }

  /** Action: remove a grant reference by index. */
  static async #onGrantRemove(event, target) {
    const grants = foundry.utils.deepClone(this.document.system.grants);
    grants.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.grants": grants });
  }

  /** Action: open the source item of a grant (the editable master; the actor copy is read-only). */
  static async #onGrantEdit(event, target) {
    const uuid = target.closest("[data-grant-uuid]")?.dataset.grantUuid;
    const src = uuid ? await fromUuid(uuid) : null;
    if (src) src.sheet.render(true);
    else ui.notifications.warn("Grant source not found (it may have been deleted).");
  }
}
