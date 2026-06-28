// scripts/sheets/actor-sheet.mjs
import { buildCharacteristics, buildSkills, fatiguePercent } from "../helpers/sheet-data.mjs";
import { woundsShown, woundsStored, reverseWoundsEnabled } from "../helpers/wounds-display.mjs";
import { rollCharacteristic, rollSkill } from "../rolls/roll-test.mjs";
import { rollAttack } from "../rolls/attack.mjs";
import { clearStunned } from "../rolls/conditions.mjs";
import { rollManifest } from "../rolls/manifest.mjs";
import { corruptionTrack, insanityTrack, nextTestAt } from "../helpers/affliction-data.mjs";
import { rollAfflictionTest } from "../rolls/roll-test.mjs";
import { BDH } from "../config.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";
import { computeArmour, HIT_LOCATIONS } from "../helpers/combat-data.mjs";
import { aptitudeMatches, characteristicCost, skillCost, talentCost, psyRatingCost, RANK_ORDER, purchasedOnAcquire } from "../helpers/advancement-costs.mjs";
import { carryLimits } from "../helpers/encumbrance-data.mjs";

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
    if (m === "custom" && !game.user.isGM && game.settings.get("better-dh2e", "lockCustomMode")) {
      ui.notifications.warn("Custom mode is locked to the GM.");
      return;
    }
    if (m === "simple" && this.actor.type === "npc") return; // NPCs don't earn XP — Custom only.
    this._advancementMode = this._advancementMode === m ? "none" : m;
    this.render();
  }

  /** Action: nudge current fatigue by +/-1 (play mode). */
  static async #onAdjustFatigue(event, target) {
    const delta = Number(target.dataset.delta);
    const next = Math.max(0, (this.actor.system.fatigue.value ?? 0) + delta);
    await this.actor.update({ "system.fatigue.value": next });
  }

  /** Action: nudge current Fate by +/-1 (clamped to [0, max]). */
  static async #onAdjustFate(event, target) {
    const delta = Number(target.dataset.delta);
    const max = this.actor.system.fate.max ?? 0;
    const next = Math.min(max, Math.max(0, (this.actor.system.fate.value ?? 0) + delta));
    await this.actor.update({ "system.fate.value": next });
  }

  /** Action: spend a Fate point (Play mode) — recover 1d5 wounds or clear all fatigue. */
  static async #onSpendFate(event, target) {
    const sys = this.actor.system;
    if ((sys.fate?.value ?? 0) < 1) { ui.notifications.warn("No Fate points to spend."); return; }
    const hasCrit = (sys.wounds?.critical ?? 0) >= 1;
    const isStunned = this.actor.statuses?.has?.("stunned") ?? false;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: "Spend a Fate Point" },
      content: `<p>You have <b>${sys.fate.value}</b> Fate.</p>`
        + (hasCrit ? `<p class="bdh-warn">Can't recover wounds while you have a critical injury.</p>` : ``),
      buttons: [
        { action: "wounds", label: "Recover 1d5 Wounds" },
        { action: "fatigue", label: "Remove All Fatigue" },
        ...(isStunned ? [{ action: "stun", label: "Recover from Stun" }] : [])
      ],
      rejectClose: false
    }).catch(() => null);
    if (!choice) return;

    const fate = this.actor.system.fate?.value ?? 0;
    if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });

    if (choice === "wounds") {
      if ((this.actor.system.wounds?.critical ?? 0) >= 1) {
        ui.notifications.warn("Can't recover wounds while you have a critical injury.");
        return;
      }
      const roll = await new Roll("1d5").evaluate();
      const cur = this.actor.system.wounds?.value ?? 0;
      const healed = Math.min(cur, roll.total);
      await this.actor.update({ "system.fate.value": fate - 1, "system.wounds.value": cur - healed });
      const messageData = { speaker, content: `<div class="bdh-card"><header class="bdh-card-head">${this.actor.name} spends a Fate point — recovers ${healed} wound${healed === 1 ? "" : "s"} (1d5: ${roll.total}).</header></div>`, rolls: [roll] };
      ChatMessage.applyRollMode(messageData, "roll");
      await ChatMessage.create(messageData);
    } else if (choice === "fatigue") {
      await this.actor.update({ "system.fate.value": fate - 1, "system.fatigue.value": 0 });
      await ChatMessage.create({ speaker, content: `<div class="bdh-card"><header class="bdh-card-head">${this.actor.name} spends a Fate point — removes all fatigue.</header></div>` });
    } else if (choice === "stun") {
      if (!this.actor.statuses?.has?.("stunned")) return;   // no longer stunned
      await this.actor.update({ "system.fate.value": fate - 1 });
      await clearStunned(this.actor);
      await ChatMessage.create({ speaker, content: `<div class="bdh-card"><header class="bdh-card-head">${this.actor.name} spends Fate to recover from Stun.</header></div>` });
    }
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
    const data = { name, type };
    // Talents/psychic powers created in Custom advancement are free/owned; in Simple they await a Buy.
    const purchased = purchasedOnAcquire(type, this._advancementMode);
    if (purchased !== null) data.system = { purchased };
    const [created] = await this.actor.createEmbeddedDocuments("Item", [data]);
    created?.sheet.render(true);
  }

  /** Drag-drop create must match the ＋-button path: stamp `purchased` on a dropped talent/psychic power
   *  to the current advancement mode (Custom = owned, Simple/Play = unpaid). The ActorSheetV2 default
   *  would create it with the model default (unpaid) regardless of mode. Same-actor drops are reorders. */
  async _onDropItem(event, item) {
    if (item.parent === this.actor) return super._onDropItem(event, item);
    const itemData = item.toObject();
    const purchased = purchasedOnAcquire(itemData.type, this._advancementMode);
    if (purchased !== null) itemData.system = { ...itemData.system, purchased };
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /** Action: open an owned item's sheet for editing. */
  static #onEditItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item?.getFlag("better-dh2e", "grantedBy")) {
      ui.notifications.info("This item is granted — edit it on the cybernetic/armour that grants it.");
      return;
    }
    item?.sheet.render(true);
  }

  /** Action: delete an owned item (granted items can't be deleted here — remove them from the granting item). */
  static async #onDeleteItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item?.getFlag("better-dh2e", "grantedBy")) {
      ui.notifications.warn("This item is granted by a cybernetic/armour — remove it from that item instead.");
      return;
    }
    await item?.delete();
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
    const id = foundry.utils.randomID();
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    list.push({ id, name: "New Specialty", rank: "known", favourite: false });
    if (this._advancementMode === "simple") {
      const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
      const cost = skillCost(matches, "untrained");
      const upd = this.#chargeXP({ [`system.skills.${key}.specialties`]: list },
        { type: "specialty", label: `${game.i18n.localize(CONFIG.BDH.skills[key].label)} (new)`, detail: "→ Known", cost, ref: key, specialtyId: id, toRank: "known" });
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
    if (item.type === "weapon" && this.actor.type === "horde") {
      const cur = item.system.hordeEquipped ? "hordeEquipped" : (item.system.equipped ? "equipped" : "none");
      const nextState = cur === "none" ? "equipped" : cur === "equipped" ? "hordeEquipped" : "none";
      await item.update({ "system.equipped": nextState !== "none", "system.hordeEquipped": nextState === "hordeEquipped" });
      return;
    }
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

  /** Action: full attack roll (dialog → resolution → attack card) for an equipped weapon. */
  static async #onRollAttack(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await rollAttack(this.actor, id);
  }

  /** Action: cast a psychic power (manifest flow → cast card). */
  static async #onCastPower(event, target) {
    const power = this.actor.items.get(target.dataset.itemId);
    if (!power) return;
    if (!power.system.purchased) {   // unpaid powers (added in Simple, not yet bought) can't be cast in any mode
      ui.notifications.warn("Buy this power before casting it.");
      return;
    }
    await rollManifest(this.actor, power.id);
  }

  /** Action: buy a psychic power (Simple) — charge its XP cost once, then it can be cast. */
  static async #onBuyPower(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId ?? target.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item || item.system.purchased) return;
    const cost = item.system.cost ?? 0;
    const upd = this.#chargeXP({}, { type: "power", label: item.name, detail: "Psychic power", cost, ref: item.id, specialtyId: "", toRank: "" });
    if (!upd) return;
    await item.update({ "system.purchased": true });
    await this.actor.update(upd);
  }

  /** Action: reload a weapon — refill its clip to max. */
  static async #onReloadWeapon(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item) await item.update({ "system.clip.value": item.system.clip.max });
  }

  /** Action: add a Lasting Injury or Characteristic Damage entry via a type-picker dialog. */
  static async #onAddInjury(event, target) {
    const { DialogV2 } = foundry.applications.api;
    const charOptions = Object.keys(BDH.characteristics)
      .map((k) => `<option value="${k}">${game.i18n.localize(BDH.characteristics[k].label)}</option>`)
      .join("");
    const content = `
      <div class="bdh-add-injury">
        <div class="form-group"><label>Type</label>
          <select name="type">
            <option value="injury">Lasting Injury</option>
            <option value="charDamage">Characteristic Damage</option>
          </select>
        </div>
        <div class="form-group bdh-cd-field" style="display:none"><label>Characteristic</label>
          <select name="characteristic">${charOptions}</select>
        </div>
        <div class="form-group bdh-cd-field" style="display:none"><label>Damage (points)</label>
          <input type="number" name="amount" value="1" min="1" step="1"/>
        </div>
      </div>`;

    const render = (ev, dialog) => {
      const root = dialog.element;
      const sel = root.querySelector('[name="type"]');
      const fields = root.querySelectorAll('.bdh-cd-field');
      if (!sel) return;
      const toggle = () => { for (const f of fields) f.style.display = sel.value === "charDamage" ? "" : "none"; };
      sel.addEventListener("change", toggle);
      toggle();
    };

    const result = await DialogV2.prompt({
      window: { title: "Add Crit / Characteristic Damage" },
      position: { width: 360 },
      content,
      render,
      ok: {
        label: "Add",
        callback: (ev, button) => {
          const f = new foundry.applications.ux.FormDataExtended(button.form).object;
          if (f.type === "charDamage") {
            // Clamp to a minimum of 1 (matches the input's min) so an emptied field can't create a dead "−0" row.
            return { type: "charDamage", characteristic: f.characteristic, amount: Math.max(1, Math.floor(Number(f.amount) || 0)), description: "" };
          }
          return { type: "injury", description: "", characteristic: "", amount: 0 };
        },
      },
      rejectClose: false,
    });
    if (!result) return; // cancelled
    const injuries = foundry.utils.deepClone(this.actor.system.injuries);
    injuries.push(result);
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
      { type: "characteristic", label, detail: `+5 (advance ${owned + 1})`, cost, ref: key, specialtyId: "", toRank: String(owned + 1) });
    if (upd) await this.actor.update(upd);
  }

  /** Action: buy the next psy rating (Simple) — 200 × new level; first rating is Custom-only. */
  static async #onBuyPsyRating(event, target) {
    const pr = this.actor.system.psyRating ?? 0;
    if (pr < 1) return;
    const next = pr + 1;
    const cost = psyRatingCost(next);
    const upd = this.#chargeXP({ "system.psyRating": next },
      { type: "psyRating", label: "Psy Rating", detail: `→ ${next}`, cost, ref: "", specialtyId: "", toRank: String(next) });
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
    const upd = this.#chargeXP({ [`system.skills.${key}.rank`]: next }, { type: "skill", label, detail: `→ ${next}`, cost, ref: key, specialtyId: "", toRank: next });
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
    const upd = this.#chargeXP({ [`system.skills.${key}.specialties`]: list }, { type: "specialty", label, detail: `→ ${next}`, cost, ref: key, specialtyId: sp.id, toRank: next });
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
    const upd = this.#chargeXP({}, { type: "talent", label: item.name, detail: `Tier ${item.system.tier}`, cost, ref: item.id, specialtyId: "", toRank: "" });
    if (!upd) return;
    await item.update({ "system.purchased": true });
    await this.actor.update(upd);
  }

  /** Action: add the picked aptitude to the actor (Custom mode). */
  static async #onAddAptitude(event, target) {
    const pick = target.closest(".bdh-apt-add")?.querySelector(".bdh-apt-pick")?.value;
    if (!pick) return;
    const list = this.actor.system.aptitudes ?? [];
    if (list.includes(pick)) return;
    await this.actor.update({ "system.aptitudes": [...list, pick] });
  }

  /** Action: remove an aptitude from the actor. */
  static async #onRemoveAptitude(event, target) {
    const apt = target.dataset.aptitude;
    await this.actor.update({ "system.aptitudes": (this.actor.system.aptitudes ?? []).filter((a) => a !== apt) });
  }

  /** Action: refund an advancement-log entry (Simple). Any order for chars/talents; stepped advances newest-first per target. */
  static async #onRefund(event, target) {
    const idx = Number(target.dataset.logIndex);
    const sys = this.actor.system;
    const log = foundry.utils.deepClone(sys.advancementLog);
    const entry = log[idx];
    if (!entry) return;
    const extra = {};
    if (entry.type === "characteristic") {
      const cur = sys.characteristics[entry.ref]?.advance ?? 0;
      if (cur < 5 || cur / 5 !== Number(entry.toRank)) { ui.notifications.warn("Refund this characteristic's later advances first."); return; }
      extra[`system.characteristics.${entry.ref}.advance`] = cur - 5;
    } else if (entry.type === "skill") {
      if (sys.skills[entry.ref]?.rank !== entry.toRank) { ui.notifications.warn("Refund this skill's later advances first."); return; }
      extra[`system.skills.${entry.ref}.rank`] = RANK_ORDER[RANK_ORDER.indexOf(entry.toRank) - 1];
    } else if (entry.type === "specialty") {
      const list = foundry.utils.deepClone(sys.skills[entry.ref]?.specialties ?? []);
      const sidx = list.findIndex((s) => s.id === entry.specialtyId);
      if (sidx < 0) { ui.notifications.warn("That specialty no longer exists."); return; }
      if (entry.toRank === "known") {
        if (list[sidx].rank !== "known") { ui.notifications.warn("Refund this specialty's advances first."); return; }
        list.splice(sidx, 1);
      } else {
        if (list[sidx].rank !== entry.toRank) { ui.notifications.warn("Refund this specialty's later advances first."); return; }
        list[sidx].rank = RANK_ORDER[RANK_ORDER.indexOf(entry.toRank) - 1];
      }
      extra[`system.skills.${entry.ref}.specialties`] = list;
    } else if (entry.type === "psyRating") {
      const cur = sys.psyRating ?? 0;
      if (cur !== Number(entry.toRank)) { ui.notifications.warn("Refund later Psy Rating advances first."); return; }
      extra["system.psyRating"] = cur - 1;
    } else if (entry.type === "talent" || entry.type === "power") {
      const item = this.actor.items.get(entry.ref);
      if (item) await item.update({ "system.purchased": false });
    }
    log.splice(idx, 1);
    await this.actor.update({
      ...extra,
      "system.experience.spent": Math.max(0, sys.experience.spent - entry.cost),
      "system.advancementLog": log
    });
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
      reloadWeapon: DarkHeresyActorSheet.#onReloadWeapon,
      addInjury: DarkHeresyActorSheet.#onAddInjury,
      removeInjury: DarkHeresyActorSheet.#onRemoveInjury,
      rollAffliction: DarkHeresyActorSheet.#onRollAffliction,
      addAffliction: DarkHeresyActorSheet.#onAddAffliction,
      removeAffliction: DarkHeresyActorSheet.#onRemoveAffliction,
      setMode: DarkHeresyActorSheet.#onSetMode,
      adjustFatigue: DarkHeresyActorSheet.#onAdjustFatigue,
      adjustFate: DarkHeresyActorSheet.#onAdjustFate,
      spendFate: DarkHeresyActorSheet.#onSpendFate,
      addSpecialty: DarkHeresyActorSheet.#onAddSpecialty,
      removeSpecialty: DarkHeresyActorSheet.#onRemoveSpecialty,
      buyCharacteristic: DarkHeresyActorSheet.#onBuyCharacteristic,
      buySkill: DarkHeresyActorSheet.#onBuySkill,
      buySpecialty: DarkHeresyActorSheet.#onBuySpecialty,
      buyTalent: DarkHeresyActorSheet.#onBuyTalent,
      buyPower: DarkHeresyActorSheet.#onBuyPower,
      buyPsyRating: DarkHeresyActorSheet.#onBuyPsyRating,
      refund: DarkHeresyActorSheet.#onRefund,
      addAptitude: DarkHeresyActorSheet.#onAddAptitude,
      removeAptitude: DarkHeresyActorSheet.#onRemoveAptitude,
      castPower: DarkHeresyActorSheet.#onCastPower
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
        { id: "afflictions", label: "BDH.Sheet.Afflictions" },
        { id: "psychic", label: "BDH.Sheet.Psychic" },
        { id: "notes", label: "BDH.Sheet.Notes" },
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
    context.woundsShown = woundsShown(system.wounds?.value ?? 0, system.wounds?.max ?? 0, reverseWoundsEnabled());
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
      desc: firstLine(t.system.description), granted: !!t.getFlag("better-dh2e", "grantedBy")
    }));
    context.traits = items.filter((i) => i.type === "trait").map((t) => ({
      id: t.id, name: t.name, desc: firstLine(t.system.description), favourite: t.system.favourite,
      granted: !!t.getFlag("better-dh2e", "grantedBy")
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
        id: w.id, name: w.name, equipped: s.equipped, hordeEquipped: s.hordeEquipped, summary: parts.join(" · "),
        usesAmmo: flags.usesAmmo, clip: `${s.clip.value}/${s.clip.max}`,
        granted: !!w.getFlag("better-dh2e", "grantedBy")
      };
    });
    context.armour = items.filter((i) => i.type === "armour").map((a) => ({
      id: a.id, name: a.name, equipped: a.system.equipped, additive: a.system.additive,
      ap: Object.entries(a.system.locations).filter(([, v]) => v > 0).map(([k, v]) => `${LOC[k]} ${v}`).join(", ") || "—",
      granted: !!a.getFlag("better-dh2e", "grantedBy")
    }));
    context.forceFields = items.filter((i) => i.type === "forceField").map((f) => ({
      id: f.id, name: f.name, equipped: f.system.equipped, pr: f.system.protectionRating, overload: f.system.overload,
      granted: !!f.getFlag("better-dh2e", "grantedBy")
    }));
    context.gear = items.filter((i) => i.type === "gear").map((g) => ({
      id: g.id, name: g.name, desc: firstLine(g.system.description),
      craft: BDH.craftsmanship[g.system.craftsmanship] ?? g.system.craftsmanship, quantity: g.system.quantity,
      granted: !!g.getFlag("better-dh2e", "grantedBy")
    }));
    context.carriedWeight = items.reduce((sum, i) => {
      const w = i.system.weight ?? 0;
      if (i.type === "gear") return sum + w * (i.system.quantity ?? 1);
      if (i.type === "weapon" || i.type === "armour" || i.type === "forceField") return sum + w;
      return sum;
    }, 0);
    const encSum = (this.document.system.characteristics.strength.bonus ?? 0) + (this.document.system.characteristics.toughness.bonus ?? 0) + (this.document.system.carryMod ?? 0);
    const limits = carryLimits(encSum);
    context.carryLimit = limits.carry;
    context.liftLimit = limits.lift;
    context.pushLimit = limits.push;
    context.overEncumbered = context.carriedWeight > limits.carry;
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
    context.hasTalents = items.some((i) => i.type === "talent");
    context.hasTraits = items.some((i) => i.type === "trait");
    context.favPowers = items.filter((i) => i.type === "psychicPower" && i.system.favourite)
      .map((p) => ({ id: p.id, name: p.name, desc: firstLine(p.system.description), purchased: p.system.purchased ?? false }));
    context.hasPowers = items.some((i) => i.type === "psychicPower");
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
    context.injuries = sys.injuries.map((inj, i) => ({
      index: i,
      type: inj.type ?? "injury",
      isCharDamage: inj.type === "charDamage",
      description: inj.description,
      characteristic: inj.characteristic,
      characteristicLabel: inj.characteristic
        ? game.i18n.localize(BDH.characteristics[inj.characteristic]?.label ?? inj.characteristic)
        : "",
      amount: inj.amount ?? 0,
    }));
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
    context.castable = (this.document.system.psyRating ?? 0) >= 1;
    context.psychicPowers = items.filter((i) => i.type === "psychicPower").map((p) => {
      const s = p.system;
      const focusLabel = (CONFIG.BDH.characteristics[s.focusTest] && game.i18n.localize(CONFIG.BDH.characteristics[s.focusTest].label))
        ?? (CONFIG.BDH.skills[s.focusTest] && game.i18n.localize(CONFIG.BDH.skills[s.focusTest].label)) ?? s.focusTest;
      const bits = [
        CONFIG.BDH.psychicTypes[s.type] ?? s.type,
        CONFIG.BDH.disciplines[s.discipline] ?? s.discipline,
        `${focusLabel}${s.focusModifier ? ` ${s.focusModifier > 0 ? "+" : ""}${s.focusModifier}` : ""}${s.opposed ? " (opposed)" : ""}`,
        CONFIG.BDH.psychicActions[s.action] ?? s.action,
        s.sustained ? "Sustained" : null,
      ].filter(Boolean);
      return {
        id: p.id, name: p.name, summary: bits.join(" · "), desc: firstLine(s.description),
        favourite: s.favourite ?? false, purchased: s.purchased ?? false, cost: s.cost ?? 0,
      };
    });
    context.canUseCustom = game.user.isGM || !game.settings.get("better-dh2e", "lockCustomMode");
    if (!context.canUseCustom && this._advancementMode === "custom") this._advancementMode = "none";
    context.advancementMode = this._advancementMode;
    context.isCustom = this._advancementMode === "custom";
    context.isSimple = this._advancementMode === "simple";
    context.isPlay = !context.isCustom && !context.isSimple;
    // Fate pips for the top bar: one per max, the first `value` filled.
    const fv = this.document.system.fate?.value ?? 0, fm = this.document.system.fate?.max ?? 0;
    context.fatePips = Array.from({ length: fm }, (_, i) => ({ on: i < fv }));
    const pr = this.document.system.psyRating ?? 0;
    context.showPsyker = pr > 0;
    context.psykerClassChoices = CONFIG.BDH.psykerClasses;
    context.psykerClassLabel = CONFIG.BDH.psykerClasses[this.document.system.psykerClass] ?? "—";
    context.canBuyPsyRating = context.isSimple && pr >= 1;
    context.psyRatingNextCost = psyRatingCost(pr + 1);
    context.isNpc = this.document.type === "npc";
    context.isHorde = this.document.type === "horde";
    context.availableAptitudes = BDH.aptitudes.filter((a) => !(this.document.system.aptitudes ?? []).includes(a));
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
    // The Custom-mode dropdown edits the stored BASE size; the display shows the EFFECTIVE size
    // (base + any installed-cybernetic size mod). Binding the dropdown to the derived value would
    // write base+mod back to source and double-apply the mod on the next derive.
    const baseSize = this.actor._source.system.size ?? 4;
    const effSize = this.actor.system.size ?? 4;
    context.sizeOptions = Object.entries(BDH.sizes).map(([n, name]) => ({
      value: Number(n), label: `${name} (${n})`, selected: Number(n) === baseSize,
    }));
    context.canEditSize = context.isCustom && !context.isHorde;
    context.sizeName = BDH.sizes[effSize] ?? "Average";
    context.sizeValue = effSize;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    // Gear quantity: a no-name input that updates the embedded item directly (so it isn't part of the actor form submit).
    for (const input of this.element.querySelectorAll(".bdh-wounds-value")) {
      input.addEventListener("change", (event) => {
        const max = this.actor.system.wounds?.max ?? 0;
        const typed = Math.floor(Number(event.currentTarget.value) || 0);
        this.actor.update({ "system.wounds.value": woundsStored(typed, max, reverseWoundsEnabled()) });
      });
    }
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
    for (const input of this.element.querySelectorAll(".bdh-chardmg-amount")) {
      input.addEventListener("change", (event) => {
        const idx = Number(event.currentTarget.dataset.index);
        const injuries = foundry.utils.deepClone(this.actor.system.injuries);
        if (injuries[idx]) {
          injuries[idx].amount = Math.max(0, Math.floor(Number(event.currentTarget.value) || 0));
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
