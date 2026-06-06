// scripts/sheets/actor-sheet.mjs
import { buildCharacteristics, buildSkills, fatiguePercent } from "../helpers/sheet-data.mjs";
import { rollCharacteristic, rollSkill, rollWeaponAttack } from "../rolls/roll-test.mjs";
import { corruptionTrack, insanityTrack, nextTestAt } from "../helpers/affliction-data.mjs";
import { rollAfflictionTest } from "../rolls/roll-test.mjs";
import { BDH } from "../config.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";
import { computeArmour, HIT_LOCATIONS } from "../helpers/combat-data.mjs";
import { aptitudeMatches, characteristicCost, skillCost, talentCost, RANK_ORDER } from "../helpers/advancement-costs.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class DarkHeresyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Investigation "hide untrained" filter state (per open sheet). */
  _hideUntrained = false;

  /** Advancement mode overlay: "none" | "custom" | "simple" (transient per open sheet). */
  _advancementMode = "none";

  /** Action handler: toggle the hide-untrained filter and re-render. */
  static #onToggleUntrained(event, target) {
    this._hideUntrained = !this._hideUntrained;
    this.render();
  }

  /** Action: toggle an advancement mode (press again to return to play mode). */
  static #onSetMode(event, target) {
    const m = target.dataset.mode;
    this._advancementMode = this._advancementMode === m ? "none" : m;
    this.render();
  }

  /** Action: nudge current fatigue by +/-1 (play mode). */
  static async #onAdjustFatigue(event, target) {
    const delta = Number(target.dataset.delta);
    const next = Math.max(0, (this.actor.system.fatigue.value ?? 0) + delta);
    await this.actor.update({ "system.fatigue.value": next });
  }

  /** Action: roll the clicked characteristic. */
  static async #onRollCharacteristic(event, target) {
    await rollCharacteristic(this.document, target.dataset.characteristic);
  }

  /** Action: roll the clicked skill (dialog offers a characteristic picker).
   * Reads the key via closest so it works whether data-skill is on the action element
   * (Investigation rows) or an ancestor row (Combat favourite-skills list).
   * Also reads an optional specialty index from the row. */
  static async #onRollSkill(event, target) {
    const row = target.closest("[data-skill]");
    const key = row?.dataset.skill;
    const sp = row?.dataset.specialty;
    await rollSkill(this.document, key, sp != null && sp !== "" ? Number(sp) : null);
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

  /** Action: toggle a talent/trait favourite (max 3 of each type). */
  static async #onToggleFavourite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const next = !item.system.favourite;
    if (next && this.actor.items.filter((i) => i.type === item.type && i.system.favourite).length >= 3) {
      ui.notifications.warn(`You can favourite at most 3 ${item.type}s.`);
      return;
    }
    await item.update({ "system.favourite": next });
  }

  /** Action: toggle a skill favourite (max 3; counts standard favourites + specialty favourites). */
  static async #onToggleSkillFavourite(event, target) {
    const row = target.closest("[data-skill]");
    const key = row?.dataset.skill;
    if (!key) return;
    const sp = row?.dataset.specialty;
    const skills = this.actor.system.skills;
    const favCount = Object.entries(skills).reduce((n, [k, s]) =>
      CONFIG.BDH.skills[k].specialist
        ? n + (s.specialties?.filter((x) => x.favourite).length ?? 0)
        : n + (s.favourite ? 1 : 0), 0);
    if (sp != null && sp !== "") {
      const list = foundry.utils.deepClone(skills[key].specialties);
      const idx = Number(sp);
      const next = !list[idx].favourite;
      if (next && favCount >= 3) { ui.notifications.warn("You can favourite at most 3 skills."); return; }
      list[idx].favourite = next;
      await this.actor.update({ [`system.skills.${key}.specialties`]: list });
    } else {
      const next = !skills[key].favourite;
      if (next && favCount >= 3) { ui.notifications.warn("You can favourite at most 3 skills."); return; }
      await this.actor.update({ [`system.skills.${key}.favourite`]: next });
    }
  }

  /** Action: add a specialty (free in Custom; charges the Known cost in Simple). */
  static async #onAddSpecialty(event, target) {
    const key = target.dataset.skill;
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    list.push({ name: "New Specialty", rank: "known", favourite: false });
    if (this._advancementMode === "simple") {
      const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
      const cost = skillCost(matches, "untrained");
      const upd = this.#chargeXP({ [`system.skills.${key}.specialties`]: list },
        { type: "specialty", label: `${game.i18n.localize(CONFIG.BDH.skills[key].label)} (new)`, detail: "→ Known", cost });
      if (upd) await this.actor.update(upd);
      return;
    }
    await this.actor.update({ [`system.skills.${key}.specialties`]: list });
  }

  /** Action: remove a specialty by index. */
  static async #onRemoveSpecialty(event, target) {
    const key = target.dataset.skill;
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    list.splice(Number(target.dataset.specialty), 1);
    await this.actor.update({ [`system.skills.${key}.specialties`]: list });
  }

  /** Action: toggle an item's equipped flag. Armour: only one non-additive piece equipped at a time. */
  static async #onToggleEquipped(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const next = !item.system.equipped;
    if (item.type === "armour" && next && !item.system.additive) {
      const others = this.actor.items.filter(
        (i) => i.type === "armour" && i.id !== id && i.system.equipped && !i.system.additive
      );
      if (others.length) {
        await this.actor.updateEmbeddedDocuments("Item", others.map((o) => ({ _id: o.id, "system.equipped": false })));
      }
    }
    await item.update({ "system.equipped": next });
  }

  /** Action: basic attack test for an equipped weapon. */
  static async #onRollAttack(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await rollWeaponAttack(this.actor, id);
  }

  /** Action: add a blank lasting injury. */
  static async #onAddInjury(event, target) {
    const injuries = foundry.utils.deepClone(this.actor.system.injuries);
    injuries.push({ description: "" });
    await this.actor.update({ "system.injuries": injuries });
  }

  /** Action: remove a lasting injury by index. */
  static async #onRemoveInjury(event, target) {
    const injuries = foundry.utils.deepClone(this.actor.system.injuries);
    injuries.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.injuries": injuries });
  }

  /** Action: roll a Malignancy (corruption) or Trauma (insanity) test. */
  static async #onRollAffliction(event, target) {
    const type = target.dataset.type;
    const track = type === "malignancy"
      ? corruptionTrack(this.actor.system.corruption)
      : insanityTrack(this.actor.system.insanity);
    const label = type === "malignancy" ? "Malignancy Test" : "Trauma Test";
    await rollAfflictionTest(this.actor, { label: `${label} (${track.tier})`, penalty: track.penalty });
  }

  /** Action: add a blank {name, description} entry to an affliction array. */
  static async #onAddAffliction(event, target) {
    const arr = target.dataset.array;
    const list = foundry.utils.deepClone(this.actor.system.afflictions[arr]);
    list.push({ name: "", description: "" });
    await this.actor.update({ [`system.afflictions.${arr}`]: list });
  }

  /** Action: remove an affliction-array entry. */
  static async #onRemoveAffliction(event, target) {
    const arr = target.dataset.array;
    const list = foundry.utils.deepClone(this.actor.system.afflictions[arr]);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ [`system.afflictions.${arr}`]: list });
  }

  /** Build an update payload that applies `extraUpdates`, charges spent, and appends a log entry; null if too expensive. */
  #chargeXP(extraUpdates, entry) {
    const sys = this.actor.system;
    const free = sys.experience.total - sys.experience.spent;
    if (entry.cost > free) { ui.notifications.warn(`Not enough XP: needs ${entry.cost}, ${free} free.`); return null; }
    return {
      ...extraUpdates,
      "system.experience.spent": sys.experience.spent + entry.cost,
      "system.advancementLog": [...sys.advancementLog, entry]
    };
  }

  /** Action: buy the next +5 characteristic advance (Simple). */
  static async #onBuyCharacteristic(event, target) {
    const key = target.dataset.characteristic;
    const owned = (this.actor.system.characteristics[key].advance ?? 0) / 5;
    const matches = aptitudeMatches(CONFIG.BDH.characteristics[key].aptitudes, this.actor.system.aptitudes);
    const cost = characteristicCost(matches, owned);
    if (cost == null) return;
    const label = game.i18n.localize(CONFIG.BDH.characteristics[key].label);
    const upd = this.#chargeXP({ [`system.characteristics.${key}.advance`]: (owned + 1) * 5 },
      { type: "characteristic", label, detail: `+5 (advance ${owned + 1})`, cost });
    if (upd) await this.actor.update(upd);
  }

  /** Action: advance a standard skill to the next rank (Simple). */
  static async #onBuySkill(event, target) {
    const key = target.dataset.skill;
    const rank = this.actor.system.skills[key].rank;
    const next = RANK_ORDER[RANK_ORDER.indexOf(rank) + 1];
    const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
    const cost = skillCost(matches, rank);
    if (cost == null || !next) return;
    const label = game.i18n.localize(CONFIG.BDH.skills[key].label);
    const upd = this.#chargeXP({ [`system.skills.${key}.rank`]: next }, { type: "skill", label, detail: `→ ${next}`, cost });
    if (upd) await this.actor.update(upd);
  }

  /** Action: advance an existing specialty to the next rank (Simple). */
  static async #onBuySpecialty(event, target) {
    const key = target.dataset.skill;
    const idx = Number(target.dataset.specialty);
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    const sp = list[idx];
    const next = RANK_ORDER[RANK_ORDER.indexOf(sp.rank) + 1];
    const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
    const cost = skillCost(matches, sp.rank);
    if (cost == null || !next) return;
    sp.rank = next;
    const label = `${game.i18n.localize(CONFIG.BDH.skills[key].label)} (${sp.name})`;
    const upd = this.#chargeXP({ [`system.skills.${key}.specialties`]: list }, { type: "specialty", label, detail: `→ ${next}`, cost });
    if (upd) await this.actor.update(upd);
  }

  /** Action: buy a talent (Simple) — requires tier + exactly 2 aptitudes; charge once. */
  static async #onBuyTalent(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item || item.system.purchased) return;
    if ((item.system.aptitudes?.length ?? 0) !== 2 || !(item.system.tier >= 1)) {
      ui.notifications.warn("Set a tier and exactly two aptitudes on the talent before buying.");
      return;
    }
    const cost = talentCost(aptitudeMatches(item.system.aptitudes, this.actor.system.aptitudes), item.system.tier);
    const upd = this.#chargeXP({}, { type: "talent", label: item.name, detail: `Tier ${item.system.tier}`, cost });
    if (!upd) return;
    await item.update({ "system.purchased": true });
    await this.actor.update(upd);
  }

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor"],
    position: { width: 1000, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleUntrained: DarkHeresyActorSheet.#onToggleUntrained,
      rollCharacteristic: DarkHeresyActorSheet.#onRollCharacteristic,
      rollSkill: DarkHeresyActorSheet.#onRollSkill,
      createItem: DarkHeresyActorSheet.#onCreateItem,
      editItem: DarkHeresyActorSheet.#onEditItem,
      deleteItem: DarkHeresyActorSheet.#onDeleteItem,
      toggleFavourite: DarkHeresyActorSheet.#onToggleFavourite,
      toggleSkillFavourite: DarkHeresyActorSheet.#onToggleSkillFavourite,
      toggleEquipped: DarkHeresyActorSheet.#onToggleEquipped,
      rollAttack: DarkHeresyActorSheet.#onRollAttack,
      addInjury: DarkHeresyActorSheet.#onAddInjury,
      removeInjury: DarkHeresyActorSheet.#onRemoveInjury,
      rollAffliction: DarkHeresyActorSheet.#onRollAffliction,
      addAffliction: DarkHeresyActorSheet.#onAddAffliction,
      removeAffliction: DarkHeresyActorSheet.#onRemoveAffliction,
      setMode: DarkHeresyActorSheet.#onSetMode,
      adjustFatigue: DarkHeresyActorSheet.#onAdjustFatigue,
      addSpecialty: DarkHeresyActorSheet.#onAddSpecialty,
      removeSpecialty: DarkHeresyActorSheet.#onRemoveSpecialty,
      buyCharacteristic: DarkHeresyActorSheet.#onBuyCharacteristic,
      buySkill: DarkHeresyActorSheet.#onBuySkill,
      buySpecialty: DarkHeresyActorSheet.#onBuySpecialty,
      buyTalent: DarkHeresyActorSheet.#onBuyTalent
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
      id: t.id, name: t.name, desc: firstLine(t.system.description), favourite: t.system.favourite
    }));
    const LOC = { head: "Head", body: "Body", rightArm: "R Arm", leftArm: "L Arm", rightLeg: "R Leg", leftLeg: "L Leg" };
    context.weapons = items.filter((i) => i.type === "weapon").map((w) => {
      const s = w.system;
      const flags = weaponClassFlags(s.weaponClass);
      const parts = [
        BDH.weaponClasses[s.weaponClass] ?? s.weaponClass,
        [s.damage, BDH.damageTypes[s.damageType]].filter(Boolean).join(" "),
        `Pen ${s.penetration}`
      ];
      if (flags.usesRange) parts.push(`Rng ${s.range}m`);
      if (flags.usesAmmo) parts.push(`RoF ${s.rateOfFire.single}/${s.rateOfFire.short}/${s.rateOfFire.long}`);
      return {
        id: w.id, name: w.name, equipped: s.equipped, summary: parts.join(" · "),
        usesAmmo: flags.usesAmmo, clip: `${s.clip.value}/${s.clip.max}`
      };
    });
    context.armour = items.filter((i) => i.type === "armour").map((a) => ({
      id: a.id, name: a.name, equipped: a.system.equipped, additive: a.system.additive,
      ap: Object.entries(a.system.locations).filter(([, v]) => v > 0).map(([k, v]) => `${LOC[k]} ${v}`).join(", ") || "—"
    }));
    context.forceFields = items.filter((i) => i.type === "forceField").map((f) => ({
      id: f.id, name: f.name, equipped: f.system.equipped, pr: f.system.protectionRating, overload: f.system.overload
    }));
    context.gear = items.filter((i) => i.type === "gear").map((g) => ({
      id: g.id, name: g.name, desc: firstLine(g.system.description),
      craft: BDH.craftsmanship[g.system.craftsmanship] ?? g.system.craftsmanship, quantity: g.system.quantity
    }));
    context.carriedWeight = items.reduce((sum, i) => {
      const w = i.system.weight ?? 0;
      if (i.type === "gear") return sum + w * (i.system.quantity ?? 1);
      if (i.type === "weapon" || i.type === "armour" || i.type === "forceField") return sum + w;
      return sum;
    }, 0);
    const sys = this.document.system;
    const tb = sys.characteristics.toughness.bonus;
    const equippedArmour = items.filter((i) => i.type === "armour" && i.system.equipped).map((a) => a.system);
    const prot = computeArmour(equippedArmour, tb);
    const LOCLBL = { head: "Head", body: "Body", rightArm: "R Arm", leftArm: "L Arm", rightLeg: "R Leg", leftLeg: "L Leg" };
    context.armourRow = HIT_LOCATIONS.map((loc) => ({ key: loc, label: LOCLBL[loc], tb, ap: prot[loc] }));
    const eff = items.find((i) => i.type === "forceField" && i.system.equipped);
    context.forceFieldPR = eff ? eff.system.protectionRating : null;
    context.combatWeapons = items.filter((i) => i.type === "weapon" && i.system.equipped).map((w) => {
      const flags = weaponClassFlags(w.system.weaponClass);
      return {
        id: w.id, name: w.name,
        attackChar: (w.system.weaponClass === "melee" ? BDH.characteristics.weaponSkill : BDH.characteristics.ballisticSkill).short,
        summary: `${w.system.damage} ${BDH.damageTypes[w.system.damageType] ?? ""} · Pen ${w.system.penetration}`,
        usesAmmo: flags.usesAmmo, clip: `${w.system.clip.value}/${w.system.clip.max}`
      };
    });
    context.favTalents = items.filter((i) => i.type === "talent" && i.system.favourite)
      .map((t) => ({ id: t.id, name: t.name, desc: firstLine(t.system.description) }));
    context.favTraits = items.filter((i) => i.type === "trait" && i.system.favourite)
      .map((t) => ({ id: t.id, name: t.name, desc: firstLine(t.system.description) }));
    const favSkills = [];
    for (const [key, s] of Object.entries(sys.skills)) {
      if (BDH.skills[key].specialist) {
        (s.specialties ?? []).forEach((sp, i) => {
          if (sp.favourite) favSkills.push({ key, specialty: i, label: `${game.i18n.localize(BDH.skills[key].label)} (${sp.name})`, total: sp.total });
        });
      } else if (s.favourite) {
        favSkills.push({ key, specialty: null, label: game.i18n.localize(BDH.skills[key].label), total: s.total });
      }
    }
    context.favSkills = favSkills;
    context.specialtyRankChoices = { known: "Known +0", trained: "Trained +10", experienced: "Experienced +20", veteran: "Veteran +30" };
    context.injuries = sys.injuries.map((inj, i) => ({ index: i, description: inj.description }));
    const cor = corruptionTrack(sys.corruption);
    const ins = insanityTrack(sys.insanity);
    context.corruption = { value: sys.corruption, tier: cor.tier, penalty: cor.penalty, nextAt: nextTestAt(sys.corruption) };
    context.insanity = { value: sys.insanity, tier: ins.tier, penalty: ins.penalty, nextAt: nextTestAt(sys.insanity) };
    const mapNamed = (a) => a.map((e, i) => ({ index: i, name: e.name, description: e.description }));
    context.mutations = mapNamed(sys.afflictions.mutations);
    context.malignancies = mapNamed(sys.afflictions.malignancies);
    context.mentalDisorders = mapNamed(sys.afflictions.mentalDisorders);
    context.cybernetics = items.filter((i) => i.type === "cybernetic").map((c) => ({
      id: c.id, name: c.name, desc: firstLine(c.system.description), installed: c.system.installed
    }));
    context.psychicPowers = items.filter((i) => i.type === "psychicPower").map((p) => ({
      id: p.id, name: p.name, desc: firstLine(p.system.description)
    }));
    context.advancementMode = this._advancementMode;
    context.isCustom = this._advancementMode === "custom";
    context.isSimple = this._advancementMode === "simple";
    context.aptitudeChoices = Object.fromEntries(BDH.aptitudes.map((a) => [a, a]));
    context.experience = {
      total: sys.experience.total, spent: sys.experience.spent,
      free: sys.experience.total - sys.experience.spent
    };
    context.charChoices = Object.fromEntries(Object.keys(BDH.characteristics).map((k) => [k, BDH.characteristics[k].short]));
    context.rankChoices = { untrained: "Untrained −20", known: "Known +0", trained: "Trained +10", experienced: "Experienced +20", veteran: "Veteran +30" };
    const initKey = sys.initiative.characteristic;
    context.initBonus = sys.characteristics[initKey].bonus;
    context.initShort = BDH.characteristics[initKey].short;
    // Simple-mode cost data (cheap; the template reads it only when isSimple).
    const apts = sys.aptitudes;
    context.characteristics = context.characteristics.map((c) => {
      if (c.key === "influence") return { ...c, noAdvance: true };
      const owned = (sys.characteristics[c.key].advance ?? 0) / 5;
      const matches = aptitudeMatches(BDH.characteristics[c.key].aptitudes, apts);
      return { ...c, owned, advDots: [0, 1, 2, 3, 4].map((i) => i < owned), nextCost: characteristicCost(matches, owned) };
    });
    context.skills = context.skills.map((s) => {
      const matches = aptitudeMatches(BDH.skills[s.key].aptitudes, apts);
      if (s.specialist) {
        return { ...s, addCost: skillCost(matches, "untrained"), specialties: s.specialties.map((sp) => ({ ...sp, nextCost: skillCost(matches, sp.rank) })) };
      }
      return { ...s, nextCost: skillCost(matches, s.rank) };
    });
    context.talents = context.talents.map((t) => {
      const tsys = items.get(t.id).system;
      const valid = (tsys.aptitudes?.length === 2) && tsys.tier >= 1;
      const cost = valid ? talentCost(aptitudeMatches(tsys.aptitudes, apts), tsys.tier) : null;
      return { ...t, cost, valid, purchased: tsys.purchased ?? false };
    });
    context.advancementLog = sys.advancementLog;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Gear quantity: a no-name input that updates the embedded item directly (so it isn't part of the actor form submit).
    for (const input of this.element.querySelectorAll(".bdh-qty")) {
      input.addEventListener("change", (event) => {
        const id = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(id);
        if (item) item.update({ "system.quantity": Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)) });
      });
    }
    for (const input of this.element.querySelectorAll(".bdh-injury")) {
      input.addEventListener("change", (event) => {
        const idx = Number(event.currentTarget.dataset.index);
        const injuries = foundry.utils.deepClone(this.actor.system.injuries);
        if (injuries[idx]) {
          injuries[idx].description = event.currentTarget.value;
          this.actor.update({ "system.injuries": injuries });
        }
      });
    }
    for (const input of this.element.querySelectorAll(".bdh-aff-input")) {
      input.addEventListener("change", (event) => {
        const row = event.currentTarget.closest("[data-array]");
        const arr = row?.dataset.array;
        const idx = Number(row?.dataset.index);
        const field = event.currentTarget.dataset.field;
        const list = foundry.utils.deepClone(this.actor.system.afflictions[arr]);
        if (list[idx]) {
          list[idx][field] = event.currentTarget.value;
          this.actor.update({ [`system.afflictions.${arr}`]: list });
        }
      });
    }
    for (const input of this.element.querySelectorAll(".bdh-spec-input")) {
      input.addEventListener("change", (event) => {
        const el = event.currentTarget;
        const key = el.dataset.skill;
        const idx = Number(el.dataset.specialty);
        const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
        if (list[idx]) {
          list[idx][el.dataset.field] = el.value;
          this.actor.update({ [`system.skills.${key}.specialties`]: list });
        }
      });
    }
  }
}
