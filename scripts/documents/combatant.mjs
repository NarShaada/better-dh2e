// scripts/documents/combatant.mjs — per-actor initiative formula.
//
// Foundry v13 puts _getInitiativeFormula() on Combatant (client/documents/combatant.mjs), taking NO
// argument — it reads `this.actor` internally. Combat itself has no such hook (grep confirms 0 hits
// in client/documents/combat.mjs), so this override MUST live on the Combatant subclass, not Combat.
import { initiativeFormula } from "../helpers/derived.mjs";

/** Build a Combatant subclass chaining the configured class. */
export function makeDHCombatant(Base) {
  return class DHCombatant extends Base {
    /** Per-combatant initiative formula — the system-wide CONFIG.Combat.initiative.formula can't vary
     *  by combatant. The `cfg` guard is what makes a vehicle combatant safe: VehicleModel has no
     *  `initiative` field, so it falls through to Foundry's own implementation. */
    _getInitiativeFormula() {
      const cfg = this.actor?.system?.initiative;
      return cfg ? initiativeFormula(cfg.dice) : super._getInitiativeFormula();
    }
  };
}
