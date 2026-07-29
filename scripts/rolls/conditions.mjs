// scripts/rolls/conditions.mjs — apply/tick DH2e conditions (ActiveEffect-backed).
import { pickToxic, fatigueKnockoutAction } from "../helpers/condition-data.mjs";

const NS = "better-dh2e";

function stunnedCard(name, rounds) {
  return `<div class="bdh-card"><header class="bdh-card-head">${name} is Stunned for ${rounds} Round${rounds === 1 ? "" : "s"}.</header></div>`;
}

/** Apply (or refresh to the higher of) the Stunned condition for `rounds`, with a chat card. */
export async function applyStunned(actor, rounds) {
  if (!actor || rounds <= 0) return;
  let eff = actor.effects.find((e) => e.statuses?.has?.("stunned"));
  const cur = eff?.flags?.[NS]?.rounds ?? 0;
  const final = Math.max(cur, rounds);
  if (!eff) {
    // Use the same status-toggle path as the token HUD so the token icon renders, then stamp the round counter.
    await actor.toggleStatusEffect("stunned", { active: true });
    eff = actor.effects.find((e) => e.statuses?.has?.("stunned"));
  }
  if (eff && final !== cur) await eff.update({ [`flags.${NS}.rounds`]: final });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: stunnedCard(actor.name, final) });
}

/** Tick a token's Stunned at its turn start: X→X-1; card if >0, clear if 0. */
export async function tickStunned(actor) {
  const stun = actor?.effects.find((e) => e.statuses?.has?.("stunned"));
  if (!stun) return;
  const rounds = (stun.flags?.[NS]?.rounds ?? 1) - 1;
  if (rounds > 0) {
    await stun.update({ [`flags.${NS}.rounds`]: rounds });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: stunnedCard(actor.name, rounds) });
  } else {
    await stun.delete();
  }
}

/** Remove the Stunned condition outright (e.g. spent Fate to recover). */
export async function clearStunned(actor) {
  const stun = actor?.effects.find((e) => e.statuses?.has?.("stunned"));
  if (stun) await stun.delete();
}

/** Knock the actor Prone (idempotent), with a chat card. */
export async function applyProne(actor) {
  if (!actor || actor.statuses?.has?.("prone")) return;
  await actor.toggleStatusEffect("prone", { active: true });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} falls Prone.</header></div>`,
  });
}

/** Set the actor On Fire (idempotent), with a chat card. */
export async function applyOnFire(actor) {
  if (!actor || actor.statuses?.has?.("onFire")) return;
  await actor.toggleStatusEffect("onFire", { active: true });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} is set On Fire!</header></div>` });
}

/** Make the actor Helpless (idempotent), with a chat card. */
export async function applyHelpless(actor) {
  if (!actor || actor.statuses?.has?.("helpless")) return;
  await actor.toggleStatusEffect("helpless", { active: true });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} is Helpless.</header></div>` });
}

/** Apply (or raise) Crippled (X), with a chat card. X is stored on the effect so the end-of-turn
 *  reminder can name it. Higher X wins, mirroring applyStunned's take-higher. */
export async function applyCrippled(actor, x) {
  if (!actor || !(x > 0)) return;
  let eff = actor.effects.find((e) => e.statuses?.has?.("crippled"));
  const cur = eff?.flags?.[NS]?.crippling ?? 0;
  const final = Math.max(cur, x);
  if (!eff) {
    await actor.toggleStatusEffect("crippled", { active: true });
    eff = actor.effects.find((e) => e.statuses?.has?.("crippled"));
  }
  if (eff && final !== cur) await eff.update({ [`flags.${NS}.crippling`]: final });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} is Crippled (${final}).</header>`
      + `<div class="bdh-card-line">Taking more than a Half Action deals ${final} Rending to the wounded location, `
      + `ignoring Armour and Toughness. Lasts until all damage is healed or the encounter ends.</div></div>`
  });
}

/** The Crippled X currently on an actor, or 0. */
export function crippledValue(actor) {
  return actor?.effects.find((e) => e.statuses?.has?.("crippled"))?.flags?.[NS]?.crippling ?? 0;
}

/** Add fatigue (current, clamped >=0). */
export async function addFatigue(actor, n) {
  if (!actor || !n) return;
  await actor.update({ "system.fatigue.value": Math.max(0, (actor.system.fatigue?.value ?? 0) + n) });
}

/**
 * Fatigue past the threshold knocks a character out (page 233).
 *
 * Applied ONCE per crossing and latched: if the GM clears Unconscious by hand while Fatigue is
 * still over the threshold, it must not immediately snap back on. The latch re-arms only when
 * Fatigue drops back to the threshold or below.
 *
 * Death at double the threshold is deliberately NOT automated — that is the GM's call.
 */
export async function checkFatigueThreshold(actor) {
  const value = actor?.system?.fatigue?.value;
  const max = actor?.system?.fatigue?.max;
  if (!actor || !Number.isFinite(value) || !Number.isFinite(max)) return;
  const latched = actor.getFlag(NS, "fatigueKnockout") === true;
  const action = fatigueKnockoutAction(value, max, latched);

  if (action === "apply") {
    await actor.setFlag(NS, "fatigueKnockout", true);
    if (!actor.statuses?.has?.("unconscious")) await actor.toggleStatusEffect("unconscious", { active: true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} collapses — Fatigue ${value} exceeds ${max}.</header>`
        + `<div class="bdh-card-line">Unconscious for 10 − Toughness bonus minutes; on waking, Fatigue drops to the Toughness bonus.</div></div>`
    });
    return;
  }
  if (action === "rearm") await actor.unsetFlag(NS, "fatigueKnockout");
}

/** Watch Fatigue changes for the knockout threshold. Only the acting user writes, so a shared
 *  scene does not fire this once per connected client. */
export function registerFatigueHooks() {
  Hooks.on("updateActor", (actor, change, options, userId) => {
    if (userId !== game.user.id) return;
    // Characteristics matter too: the threshold is Toughness bonus + Willpower bonus, so
    // characteristic damage can drop it under a Fatigue level that never changed.
    if (change?.system?.fatigue?.value === undefined && change?.system?.characteristics === undefined) return;
    checkFatigueThreshold(actor);
  });
}

/** Apply/refresh the Toxic condition, keeping the most potent {potency, damageType}. */
export async function applyToxic(actor, potency, damageType) {
  if (!actor || !(potency > 0)) return;
  let eff = actor.effects.find((e) => e.statuses?.has?.("toxic"));
  const cur = eff?.flags?.[NS];
  const winner = pickToxic(cur?.potency ? { potency: cur.potency, damageType: cur.damageType } : null,
                           { potency, damageType });
  if (!eff) {
    await actor.toggleStatusEffect("toxic", { active: true });   // toggle path → token icon renders
    eff = actor.effects.find((e) => e.statuses?.has?.("toxic"));
  }
  if (eff) await eff.update({ [`flags.${NS}.potency`]: winner.potency, [`flags.${NS}.damageType`]: winner.damageType });
}

/** Start-of-turn On Fire: roll 1d10 and post an Apply-Damage + Willpower-Test card. */
export async function tickOnFire(actor) {
  if (!actor?.statuses?.has?.("onFire")) return;
  const roll = await new Roll("1d10").evaluate();
  // Store the ACTOR uuid (resolveDefender + the handlers expect an actor, matching every other card).
  const flags = { kind: "onFire", damage: roll.total, targetUuid: actor.uuid, targetName: actor.name };
  const content = `<div class="bdh-card"><header class="bdh-card-head">${actor.name} is On Fire and takes ${roll.total} damage</header>`
    + `<div class="bdh-card-actions"><button type="button" data-bdh="onFireApply">Apply Damage</button>`
    + `<button type="button" data-bdh="onFireWP">Willpower Test</button></div></div>`;
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll], flags: { [NS]: flags } });
}

/** Read the Toxic data + clear the condition (one-shot, at end of turn). Returns {potency, damageType} or null. */
export async function consumeToxic(actor) {
  const eff = actor?.effects.find((e) => e.statuses?.has?.("toxic"));
  if (!eff) return null;
  const data = { potency: eff.flags?.[NS]?.potency ?? 1, damageType: eff.flags?.[NS]?.damageType ?? "" };
  await eff.delete();
  return data;
}
