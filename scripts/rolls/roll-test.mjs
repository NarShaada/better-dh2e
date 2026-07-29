// scripts/rolls/roll-test.mjs
// Foundry-coupled roll service: dialog -> d100 -> chat card. Validated by loading in Foundry.
import { parseModifier, evaluateTest } from "./test-logic.mjs";
import { skillTotal, sizeStealthModifier, unnaturalDoSBonus } from "../helpers/derived.mjs";
import { gatherActiveBonusEntries, rollBonusesFor } from "../helpers/item-bonuses.mjs";
import { escapeHtml } from "../helpers/html-escape.mjs";

const NS = "better-dh2e";

const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const CARD = "systems/better-dh2e/templates/chat/test-card.hbs";

/** Build a short " [src +X, …]" note of the item bonuses applied to a roll (empty when none). */
function bonusNote(auto, applied) {
  const parts = [];
  if (auto) parts.push(`Always ${auto >= 0 ? "+" : ""}${auto}`);
  for (const s of applied) parts.push(s.label);
  return parts.length ? ` [${parts.join(", ")}]` : "";
}

/**
 * Show the modifier dialog (plus an optional characteristic picker).
 * @returns {Promise<{modifier:string, characteristicKey:(string|null)}|null>} null if cancelled.
 */
export async function promptTest({ title, characteristics = null, defaultModifier = "+0", situational = [], info = [], fields = [], onRender = null }) {
  let picker = "";
  if (characteristics) {
    const opts = characteristics.map((c) =>
      `<option value="${c.key}"${c.selected ? " selected" : ""}>${game.i18n.localize(c.label)} (${c.value})</option>`
    ).join("");
    picker = `<div class="form-group"><label>${game.i18n.localize("BDH.Roll.Characteristic")}</label>
      <select name="characteristic">${opts}</select></div>`;
  }
  let checks = "";
  if (situational.length) {
    checks = `<div class="form-group bdh-situational"><label>Situational</label><div>` +
      situational.map((s) => `<label class="bdh-sit"><input type="checkbox" name="sit_${s.id}"/> ${s.label}</label>`).join("") +
      `</div></div>`;
  }
  // Read-only breakdown rows (e.g. Manoeuvrability, Untrained −20) shown ABOVE the modifier field —
  // these are inherent to the test and are NOT part of the "on top" modifier the user types.
  const infoRows = info.length
    ? info.map((r) => `<div class="form-group"><label>${r.label}</label><span class="bdh-roll-info">${r.value}</span></div>`).join("")
    : "";
  // Caller-supplied inputs (Requisition's Item / Availability / Craftsmanship). Rendered above the
  // read-only info rows so the breakdown sits directly beneath what produced it.
  // Values are escaped: unlike the other rows these carry user-authored data (item names), and a
  // stray quote would otherwise break out of the attribute.
  const fieldRows = fields.map((f) => {
    if (f.kind === "select") {
      const opts = (f.options ?? []).map((o) =>
        `<option value="${escapeHtml(o.value)}"${o.selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
      return `<div class="form-group"><label>${f.label}</label><select name="${f.name}">${opts}</select></div>`;
    }
    const listId = f.datalist ? `bdh-dl-${f.name}` : null;
    const list = listId
      ? `<datalist id="${listId}">${f.datalist.map((v) => `<option value="${escapeHtml(v)}"></option>`).join("")}</datalist>`
      : "";
    return `<div class="form-group"><label>${f.label}</label>`
      + `<input type="text" name="${f.name}"${listId ? ` list="${listId}"` : ""}`
      + `${f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : ""}/>${list}</div>`;
  }).join("");
  const content = `${picker}${checks}${fieldRows}${infoRows}<div class="form-group"><label>${game.i18n.localize("BDH.Roll.Modifier")}</label>
    <input type="text" name="modifier" value="${defaultModifier}" autofocus/></div>`;

  return DialogV2.prompt({
    window: { title },
    content,
    rejectClose: false,
    // Live wiring between fields (Requisition steering Availability off the picked item). DialogV2
    // renders `content` as an HTML string, so a caller that needs listeners can only get at the
    // nodes here. `render` fires on every render, and re-adding an identical listener to the same
    // node is a no-op, so this stays safe if the dialog re-renders.
    ...(onRender ? { render: (_event, dialog) => onRender(dialog?.element?.querySelector?.("form")) } : {}),
    ok: {
      label: game.i18n.localize("BDH.Roll.Roll"),
      callback: (event, button) => ({
        modifier: button.form.elements.modifier.value,
        characteristicKey: button.form.elements.characteristic?.value ?? null,
        situationalIds: situational.filter((s) => button.form.elements[`sit_${s.id}`]?.checked).map((s) => s.id),
        fieldValues: Object.fromEntries(fields.map((f) => [f.name, button.form.elements[f.name]?.value ?? null]))
      })
    }
  });
}

/** Roll d100 against base+modifier and post the chat card.
 *  `characteristic` is the governing characteristic KEY — its Unnatural bonus adds ceil(unnatural/2)
 *  extra DoS on success (rulebook: any test using an unnatural characteristic). Stored on the reroll
 *  flags so Fate rerolls/boosts keep it. It's tracked separately from the Fate `dosBonus` so it neither
 *  blocks nor is overwritten by the Fate "+1 DoS" button. */
export async function performTest(actor, { label, base, modifier, fixedRoll = null, dosBonus = 0, characteristic = null }) {
  const roll = fixedRoll != null ? { total: fixedRoll } : await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: parseModifier(modifier), roll: roll.total });
  const unnaturalDoS = result.success && characteristic
    ? unnaturalDoSBonus(actor.system?.characteristics?.[characteristic]?.unnatural) : 0;
  const dos = result.success ? result.degrees + unnaturalDoS + dosBonus : 0;
  const modifierLabel = `${result.modifier >= 0 ? "+" : ""}${result.modifier}`;
  // Show the boosted DoS on success; keep the raw degrees-of-failure on a miss.
  const content = await renderTemplate(CARD, { label, ...result, degrees: result.success ? dos : result.degrees, modifierLabel, dosBonus, unnaturalDoS });
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [NS]: { reroll: { kind: "test", actorUuid: actor.uuid, base, modifier, label, roll: roll.total, success: result.success, dosBonus, characteristic } } }
  };
  if (fixedRoll == null) messageData.rolls = [roll];
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
  return result;
}

/** Characteristic test: dialog (modifier only) -> roll. */
export async function rollCharacteristic(actor, key) {
  const cfg = CONFIG.BDH.characteristics[key];
  const label = game.i18n.localize(cfg.label);
  const { auto, situational } = rollBonusesFor(gatherActiveBonusEntries(actor.items), "characteristic", key);
  const choice = await promptTest({ title: label, situational });
  if (!choice) return null;
  const applied = situational.filter((s) => choice.situationalIds.includes(s.id));
  const bonusTotal = auto + applied.reduce((n, s) => n + s.amount, 0);
  const note = bonusNote(auto, applied);
  return performTest(actor, { label: label + note, base: actor.system.characteristics[key].total, modifier: parseModifier(choice.modifier) + bonusTotal, characteristic: key });
}

/** Skill test: dialog includes a characteristic picker defaulting to the skill's governing characteristic. */
export async function rollSkill(actor, key, specialtyIndex = null) {
  const skillCfg = CONFIG.BDH.skills[key];
  const skill = actor.system.skills[key];
  let rank;
  let suffix = "";
  if (skillCfg.specialist) {
    const sp = skill.specialties?.[specialtyIndex];
    if (!sp) return null;
    rank = sp.rank;
    suffix = ` (${sp.name})`;
  } else {
    rank = skill.rank;
  }
  const characteristics = Object.keys(CONFIG.BDH.characteristics).map((ck) => ({
    key: ck,
    label: CONFIG.BDH.characteristics[ck].label,
    value: actor.system.characteristics[ck].total,
    selected: ck === skillCfg.characteristic
  }));
  const label = `${game.i18n.localize(skillCfg.label)}${suffix}`;
  const { auto, situational } = rollBonusesFor(gatherActiveBonusEntries(actor.items), "skill", key);
  const choice = await promptTest({ title: label, characteristics, situational });
  if (!choice) return null;
  const chosen = choice.characteristicKey ?? skillCfg.characteristic;
  const base = skillTotal(actor.system.characteristics[chosen].total, rank);
  const short = CONFIG.BDH.characteristics[chosen].short;
  const sizeStealth = key === "stealth" ? sizeStealthModifier(actor.system?.size ?? 4) : 0;
  const applied = situational.filter((s) => choice.situationalIds.includes(s.id));
  const bonusTotal = auto + applied.reduce((n, s) => n + s.amount, 0);
  const note = bonusNote(auto, applied);
  return performTest(actor, { label: `${label} (${short})${note}`, base, modifier: parseModifier(choice.modifier) + sizeStealth + bonusTotal, characteristic: chosen });
}

/** Malignancy / Trauma test: a Willpower test with the track penalty pre-filled in the dialog. */
export async function rollAfflictionTest(actor, { label, penalty }) {
  const defaultModifier = `${penalty >= 0 ? "+" : ""}${penalty}`;
  const choice = await promptTest({ title: label, defaultModifier });
  if (!choice) return null;
  return performTest(actor, { label, base: actor.system.characteristics.willpower.total, modifier: choice.modifier, characteristic: "willpower" });
}
