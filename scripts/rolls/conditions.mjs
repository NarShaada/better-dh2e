// scripts/rolls/conditions.mjs — apply/tick DH2e conditions (ActiveEffect-backed).
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

/** Add fatigue (current, clamped >=0). */
export async function addFatigue(actor, n) {
  if (!actor || !n) return;
  await actor.update({ "system.fatigue.value": Math.max(0, (actor.system.fatigue?.value ?? 0) + n) });
}
