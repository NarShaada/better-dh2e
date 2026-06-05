// scripts/rolls/roll-test.mjs
// Foundry-coupled roll service: dialog -> d100 -> chat card. Validated by loading in Foundry.
import { parseModifier, evaluateTest } from "./test-logic.mjs";
import { skillTotal } from "../helpers/derived.mjs";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const CARD = "systems/better-dh2e/templates/chat/test-card.hbs";

/**
 * Show the modifier dialog (plus an optional characteristic picker).
 * @returns {Promise<{modifier:string, characteristicKey:(string|null)}|null>} null if cancelled.
 */
async function promptTest({ title, characteristics = null, defaultModifier = "+0" }) {
  let picker = "";
  if (characteristics) {
    const opts = characteristics.map((c) =>
      `<option value="${c.key}"${c.selected ? " selected" : ""}>${game.i18n.localize(c.label)} (${c.value})</option>`
    ).join("");
    picker = `<div class="form-group"><label>${game.i18n.localize("BDH.Roll.Characteristic")}</label>
      <select name="characteristic">${opts}</select></div>`;
  }
  const content = `${picker}<div class="form-group"><label>${game.i18n.localize("BDH.Roll.Modifier")}</label>
    <input type="text" name="modifier" value="${defaultModifier}" autofocus/></div>`;

  return DialogV2.prompt({
    window: { title },
    content,
    rejectClose: false,
    ok: {
      label: game.i18n.localize("BDH.Roll.Roll"),
      callback: (event, button) => ({
        modifier: button.form.elements.modifier.value,
        characteristicKey: button.form.elements.characteristic?.value ?? null
      })
    }
  });
}

/** Roll d100 against base+modifier and post the chat card. */
export async function performTest(actor, { label, base, modifier }) {
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: parseModifier(modifier), roll: roll.total });
  const modifierLabel = `${result.modifier >= 0 ? "+" : ""}${result.modifier}`;
  const content = await renderTemplate(CARD, { label, ...result, modifierLabel });
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll] };
  // Respect the GM's current roll mode (public / private GM / blind / self); "roll" resolves the core setting.
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
  return result;
}

/** Characteristic test: dialog (modifier only) -> roll. */
export async function rollCharacteristic(actor, key) {
  const cfg = CONFIG.BDH.characteristics[key];
  const label = game.i18n.localize(cfg.label);
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  return performTest(actor, { label, base: actor.system.characteristics[key].total, modifier: choice.modifier });
}

/** Skill test: dialog includes a characteristic picker defaulting to the skill's governing characteristic. */
export async function rollSkill(actor, key) {
  const skillCfg = CONFIG.BDH.skills[key];
  const skill = actor.system.skills[key];
  const characteristics = Object.keys(CONFIG.BDH.characteristics).map((ck) => ({
    key: ck,
    label: CONFIG.BDH.characteristics[ck].label,
    value: actor.system.characteristics[ck].total,
    selected: ck === skillCfg.characteristic
  }));
  const label = game.i18n.localize(skillCfg.label);
  const choice = await promptTest({ title: label, characteristics });
  if (!choice) return null;
  const chosen = choice.characteristicKey ?? skillCfg.characteristic;
  const base = skillTotal(actor.system.characteristics[chosen].total, skill.rank);
  const short = CONFIG.BDH.characteristics[chosen].short;
  return performTest(actor, { label: `${label} (${short})`, base, modifier: choice.modifier });
}

/** Basic weapon attack test: WS for melee, BS otherwise. Reuses the modifier dialog + chat card.
 * (Full hit-location / RoF / damage / evade resolution is a later plan.) */
export async function rollWeaponAttack(actor, weaponId) {
  const weapon = actor.items.get(weaponId);
  if (!weapon) return null;
  const charKey = weapon.system.weaponClass === "melee" ? "weaponSkill" : "ballisticSkill";
  const cfg = CONFIG.BDH.characteristics[charKey];
  const label = `${weapon.name} (${cfg.short})`;
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  return performTest(actor, { label, base: actor.system.characteristics[charKey].total, modifier: choice.modifier });
}

/** Malignancy / Trauma test: a Willpower test with the track penalty pre-filled in the dialog. */
export async function rollAfflictionTest(actor, { label, penalty }) {
  const defaultModifier = `${penalty >= 0 ? "+" : ""}${penalty}`;
  const choice = await promptTest({ title: label, defaultModifier });
  if (!choice) return null;
  return performTest(actor, { label, base: actor.system.characteristics.willpower.total, modifier: choice.modifier });
}
