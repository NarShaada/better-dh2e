// test/combatant-initiative.test.mjs
// Guards the per-actor initiative override. This exists because the override originally shipped on
// the Combat subclass, where Foundry never calls it — the feature was dead code and the sheet
// advertised a formula the tracker would not roll. Nothing caught that, so: these tests.
import { describe, it, expect } from "vitest";
import { makeDHCombatant } from "../scripts/documents/combatant.mjs";

/** Stand-in for the core Combatant class that Foundry hands us at init. */
class FakeCombatant {
  constructor(actor) { this.actor = actor; }
  _getInitiativeFormula() { return "CORE_DEFAULT"; }
}
const DHCombatant = makeDHCombatant(FakeCombatant);

const actorWith = (initiative) => ({ system: { initiative } });

describe("DHCombatant#_getInitiativeFormula", () => {
  it("takes NO argument — Foundry v13 calls it zero-arg from Combatant#getInitiativeRoll", () => {
    expect(DHCombatant.prototype._getInitiativeFormula.length).toBe(0);
  });

  it("builds the formula from the actor's configured dice", () => {
    const c = new DHCombatant(actorWith({ dice: "2d10" }));
    expect(c._getInitiativeFormula()).toBe("2d10 + @initiativeBonus");
  });

  it("honours a deliberately blank dice — bonus only, no dice term", () => {
    const c = new DHCombatant(actorWith({ dice: "" }));
    expect(c._getInitiativeFormula()).toBe("@initiativeBonus");
  });

  it("falls back to core for an actor whose model has no initiative field (a vehicle)", () => {
    const vehicle = { system: { integrity: 30 } };   // VehicleModel has no `initiative`
    expect(new DHCombatant(vehicle)._getInitiativeFormula()).toBe("CORE_DEFAULT");
  });

  it("falls back to core for a combatant with no actor at all, without throwing", () => {
    expect(new DHCombatant(null)._getInitiativeFormula()).toBe("CORE_DEFAULT");
    expect(new DHCombatant(undefined)._getInitiativeFormula()).toBe("CORE_DEFAULT");
  });

  it("actually chains the class it was given rather than replacing it", () => {
    expect(new DHCombatant(null)).toBeInstanceOf(FakeCombatant);
  });
});
