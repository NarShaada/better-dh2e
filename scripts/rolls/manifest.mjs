// scripts/rolls/manifest.mjs
// Psychic manifestation cast flow: dialog → PR choice → focus roll → phenomena/perils → cast card.
import { evaluateTest } from "./test-logic.mjs";
import {
  maxPush, manifestState, fetterPushModifier, isDoubles,
  phenomenaTriggers, phenomenaModifier, resolveFocusTarget, substitutePR
} from "../helpers/psychic-manifest.mjs";
import { isPsychicAttack } from "../helpers/psychic-data.mjs";
import { computeHits, locationSequence, hitLocation } from "../helpers/attack-math.mjs";
import { effectivePenetration } from "../helpers/quality-modules.mjs";

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

  const effPR = Number(choice.effPR);
  const circ = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  return resolveManifest(actor, power, { effPR, circ });
}

/**
 * Resolution half of a psychic manifest cast — rolls the focus d100, resolves phenomena/perils,
 * builds the cast card, and creates the ChatMessage. Called by rollManifest and by fate.mjs rerolls.
 * @param {Actor} actor
 * @param {Item}  power   — the psychicPower Item (already looked up)
 * @param {{ effPR: number, circ?: number, targetUuid?: string|null, targetName?: string|null }} opts
 * @returns {Promise<true|null>}
 */
export async function resolveManifest(actor, power, opts) {
  const { effPR, circ = 0, targetUuid: optsTargetUuid, targetName: optsTargetName } = opts;
  const s = power.system;

  const normalPR = actor.system.psyRating ?? 0;
  const psykerClass = actor.system.psykerClass;
  const state = manifestState(effPR, normalPR);
  const pushPts = Math.max(0, effPR - normalPR);

  const focus = resolveFocusTarget(actor.system, s.focusTest);
  const focusMod = (s.focusModifier ?? 0) + fetterPushModifier(effPR, normalPR) + circ;

  // Roll + evaluate
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest({ base: focus.total, modifier: focusMod, roll: roll.total });
  const { success, degrees, target, modifier } = result;
  const dos = success ? degrees : 0;
  const doubles = isDoubles(roll.total);

  // Phenomena (keep the Roll objects so the dice sound/animation plays)
  const phenTriggered = phenomenaTriggers(psykerClass, state, doubles);
  let phenRoll = null, phenMod = 0, phenTotal = null, perilRoll = null;
  const extraRolls = [];
  if (phenTriggered) {
    const pr = await new Roll("1d100").evaluate(); extraRolls.push(pr);
    phenRoll = pr.total;
    phenMod = phenomenaModifier(psykerClass, state, pushPts);
    phenTotal = phenRoll + phenMod;
    if (phenTotal >= 75) { const per = await new Roll("1d100").evaluate(); extraRolls.push(per); perilRoll = per.total; }
  }

  // Target token — opts override lets a reroll re-target the original
  const liveTarget = optsTargetUuid ? null : (game.user.targets.first() ?? null);
  const targetUuid = optsTargetUuid ?? liveTarget?.actor?.uuid ?? null;
  const targetName = optsTargetName ?? liveTarget?.name ?? null;

  // Labels
  const focusLabel = game.i18n.localize(
    CONFIG.BDH.characteristics[focus.key]?.label
    ?? CONFIG.BDH.skills[focus.key]?.label
    ?? focus.key
  );
  const powerTypeLabel = CONFIG.BDH.psychicTypes[s.type] ?? s.type;
  const prLabel = state === "normal" ? `PR ${effPR}` : state === "fettered" ? `Fettered PR ${effPR}` : `Pushed PR ${effPR}`;
  const modifierLabel = `${modifier >= 0 ? "+" : ""}${modifier}`;
  const daemonicNote = (psykerClass === "daemonic" && phenTriggered)
    ? "Daemonic — unaffected by its own phenomena." : "";

  // Reroll payload — stored on both flag shapes so the new card is itself rerollable
  const reroll = { kind: "cast", actorUuid: actor.uuid, powerId: power.id, effPR, circ, targetUuid, targetName };

  // --- Attack-type branch (Bolt / Barrage / Storm / Blast) ---
  let attackFlags = null;
  let isAttack = false;
  let hits = [];
  let qualityLabels = "";
  let attackDamageType = null;

  if (isPsychicAttack(s.type)) {
    isAttack = true;
    const MAP = { bolt: "standard", barrage: "semiAuto", storm: "fullAuto", blast: "standard" };
    const at = CONFIG.BDH.attackTypes[MAP[s.type]];
    const rofCap = (s.type === "barrage" || s.type === "storm") ? effPR : Infinity;
    const nHits = success ? computeHits(at, dos, rofCap) : 0;

    const qualities = [...(s.qualities ?? [])];
    if (s.type === "blast" && (s.blastRadius ?? 0) > 0) qualities.push({ key: "blast", value: s.blastRadius });

    const penBase = Number((await new Roll(substitutePR(String(s.penetration || "0"), effPR) || "0").evaluate()).total) || 0;
    const penetration = effectivePenetration(penBase, { qualities, dos, success, closeRange: false });
    const damage = substitutePR(s.damage || "", effPR);

    const firstLoc = hitLocation(roll.total);
    const locs = success ? locationSequence(firstLoc, nHits) : [];
    hits = locs.map((loc, i) => ({ index: i, location: loc, label: CONFIG.BDH.hitLocationLabels[loc] }));

    qualityLabels = qualities.map((q) => `${CONFIG.BDH.qualities[q.key]?.label ?? q.key}${q.value ? ` (${q.value})` : ""}`).join(", ");
    attackDamageType = s.damageType;

    attackFlags = {
      type: "attack", psychic: true, actorUuid: actor.uuid, weaponName: power.name,
      damage, penetration, damageType: s.damageType, qualities,
      isRanged: true, dos, hits, success, jammed: false, scatterDmg: 0, maximal: false,
      targetUuid, targetName,
    };
  }

  const cardData = {
    casterName: actor.name,
    powerName: power.name,
    success,
    target,
    modifierLabel,
    roll: roll.total,
    powerTypeLabel,
    focusLabel,
    prLabel,
    degrees,
    phenTriggered,
    phenRoll,
    phenMod,
    phenSign: phenMod >= 0 ? "+" : "",
    phenTotal,
    perilRoll,
    daemonicNote,
    opposed: s.opposed && success,
    isAttack,
    hits,
    qualityLabels,
  };

  const content = await renderTemplate(CARD, cardData);

  // Opposed powers (typically Effect) carry resist data so the target can roll an opposing test.
  const opposedFlags = (s.opposed && success) ? {
    opposed: true, opposedBy: s.opposedBy, casterDoS: dos,
    targetUuid, targetName,
    casterName: actor.name, powerName: power.name,
  } : {};

  const messageFlags = attackFlags
    ? { [NS]: { ...attackFlags, ...opposedFlags, reroll } }
    : { [NS]: { type: "cast", ...opposedFlags, reroll } };

  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls: [roll, ...extraRolls],
    content,
    flags: messageFlags,
  };
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
  return true;
}
