// scripts/documents/combat.mjs — end-of-turn / end-of-round condition ticks.
import { battlemapEnabled } from "../helpers/battlemap-data.mjs";
import { consumeToxic } from "../rolls/conditions.mjs";

const NS = "better-dh2e";

/** Build a Combat subclass chaining the configured class. */
export function makeDHCombat(Base) {
  return class DHCombat extends Base {
    async _onEndTurn(combatant, context) {
      await super._onEndTurn(combatant, context);
      if (!battlemapEnabled()) return;
      const actor = combatant?.actor;
      if (!actor?.statuses?.has?.("toxic")) return;
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
