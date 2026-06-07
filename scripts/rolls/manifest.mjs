// scripts/rolls/manifest.mjs
// Psychic manifestation cast flow: dialog → PR choice → focus roll → phenomena/perils → cast card.
import { evaluateTest } from "./test-logic.mjs";
import {
  maxPush, manifestState, fetterPushModifier, isDoubles,
  phenomenaTriggers, phenomenaModifier, resolveFocusTarget
} from "../helpers/psychic-manifest.mjs";

const NS = "better-dh2e";
const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

const CARD = "systems/better-dh2e/templates/chat/cast-card.hbs";

/**
 * Full psychic manifest roll for an Effect-type power (Attack routing added in Task 4).
 * @param {Actor} actor
 * @param {string} powerId
 * @returns {Promise<true|null>}
 */
export async function rollManifest(actor, powerId) {
  const power = actor.items.get(powerId);
  if (!power || power.type !== "psychicPower") return null;
  const s = power.system;

  const normalPR = actor.system.psyRating ?? 0;
  if (normalPR < 1) {
    ui.notifications.warn("This character has no Psy Rating.");
    return null;
  }

  const psykerClass = actor.system.psykerClass;
  const mp = maxPush(psykerClass);

  // Build effective-PR option list (1 … normalPR + mp, default = normalPR)
  const prOpts = [];
  for (let pr = 1; pr <= normalPR + mp; pr++) {
    const st = manifestState(pr, normalPR);
    const m = fetterPushModifier(pr, normalPR);
    const tag = st === "normal" ? "Normal" : st === "fettered" ? `Fettered +${m}` : `Push ${m}`;
    prOpts.push(`<option value="${pr}"${pr === normalPR ? " selected" : ""}>PR ${pr} — ${tag}</option>`);
  }

  const dialogContent = `
    <div class="form-group"><label>Effective PR</label><select name="effPR">${prOpts.join("")}</select></div>
    <div class="form-group"><label>Circumstance Modifier</label><input type="text" name="modifier" value="+0"/></div>`;

  const choice = await DialogV2.prompt({
    window: { title: `${power.name} — Cast` },
    content: dialogContent,
    rejectClose: false,
    ok: {
      label: "Cast",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    }
  });
  if (!choice) return null;

  // Compute state + modifiers
  const effPR = Number(choice.effPR);
  const state = manifestState(effPR, normalPR);
  const pushPts = Math.max(0, effPR - normalPR);
  const circ = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;

  const focus = resolveFocusTarget(actor.system, s.focusTest);
  const focusMod = (s.focusModifier ?? 0) + fetterPushModifier(effPR, normalPR) + circ;

  // Roll + evaluate
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest({ base: focus.total, modifier: focusMod, roll: roll.total });
  const { success, degrees, target, modifier } = result;
  const dos = success ? degrees : 0;
  const doubles = isDoubles(roll.total);

  // Phenomena
  const phenTriggered = phenomenaTriggers(psykerClass, state, doubles);
  let phenRoll = null, phenMod = 0, phenTotal = null, perilRoll = null;
  if (phenTriggered) {
    phenRoll = (await new Roll("1d100").evaluate()).total;
    phenMod = phenomenaModifier(psykerClass, state, pushPts);
    phenTotal = phenRoll + phenMod;
    if (phenTotal >= 75) perilRoll = (await new Roll("1d100").evaluate()).total;
  }

  // Labels
  const stateLabel = state === "normal" ? "" : state === "fettered" ? "Fettered " : "Pushed ";
  const focusLabel = game.i18n.localize(
    CONFIG.BDH.characteristics[focus.key]?.label
    ?? CONFIG.BDH.skills[focus.key]?.label
    ?? focus.key
  );
  const daemonicNote = (psykerClass === "daemonic" && phenTriggered)
    ? "Daemonic — unaffected by its own phenomena." : "";

  const cardData = {
    casterName: actor.name,
    powerName: power.name,
    success,
    stateLabel,
    effPR,
    focusLabel,
    roll: roll.total,
    target,
    degrees,
    phenTriggered,
    phenRoll,
    phenMod,
    phenSign: phenMod >= 0 ? "+" : "",
    phenTotal,
    perilRoll,
    daemonicNote,
    effectText: s.description ?? "",
    isAttack: false,
  };

  const content = await renderTemplate(CARD, cardData);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [NS]: { type: "cast" } }
  });
  return true;
}
