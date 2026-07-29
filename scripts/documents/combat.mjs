// scripts/documents/combat.mjs — end-of-turn / end-of-round condition ticks.
import { battlemapEnabled } from "../helpers/battlemap-data.mjs";
import { consumeToxic, tickStunned, tickOnFire, crippledValue } from "../rolls/conditions.mjs";

const NS = "better-dh2e";

/** Build a Combat subclass chaining the configured class. */
export function makeDHCombat(Base) {
  return class DHCombat extends Base {
    async _onStartTurn(combatant, context) {
      await super._onStartTurn(combatant, context);
      if (!battlemapEnabled()) return;
      const actor = combatant?.actor;
      if (!actor) return;
      if (actor.statuses?.has?.("run")) await actor.toggleStatusEffect("run", { active: false });
      await tickStunned(actor);
      await tickOnFire(actor);
    }

    async _onEndTurn(combatant, context) {
      await super._onEndTurn(combatant, context);
      if (!battlemapEnabled()) return;
      const actor = combatant?.actor;
      if (!actor) return;

      // Crippled keys off spending more than a Half Action, which this system does not track.
      // Remind the GM as the turn closes so they can charge the Rending damage if it applies.
      const crippling = crippledValue(actor);
      if (crippling > 0) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} ends their turn with Crippled (${crippling}).</header>`
            + `<div class="bdh-card-line">If they took more than a Half Action, they suffer ${crippling} Rending to the wounded location, `
            + `ignoring Armour and Toughness.</div></div>`
        });
      }

      if (!actor.statuses?.has?.("toxic")) return;
      const tox = await consumeToxic(actor);   // {potency, damageType} + clears (one-shot)
      if (!tox) return;
      const flags = {
        kind: "toxicResist",
        potency: tox.potency,
        damageType: tox.damageType,
        targetUuid: actor.uuid,
        targetName: actor.name
      };
      const content = `<div class="bdh-card">`
        + `<header class="bdh-card-head">${actor.name} — Resist Toxic (${tox.potency})</header>`
        + `<div class="bdh-card-actions"><button type="button" data-bdh="toxicResist">Toughness Test</button></div>`
        + `</div>`;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        flags: { [NS]: flags }
      });
    }
  };
}
