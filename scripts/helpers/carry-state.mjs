// scripts/helpers/carry-state.mjs — PURE. The three carry states and what they weigh.
import { magazineWeight } from "./weapon-effects.mjs";

/** Item types whose weight counts against the carrying limit. */
const WEIGHT_BEARING = new Set(["gear", "weapon", "armour", "forceField"]);

/** `stashed` wins over `equipped`: a stashed item is off your person, so nothing that reads
 *  `system.equipped` needs to know the stashed state exists. Mutates and returns the object.
 *  Harmless for item types that have neither field. Called from BaseItemModel.prepareDerivedData. */
export function applyCarryInvariant(sys) {
  if (sys?.stashed && "equipped" in sys) sys.equipped = false;
  return sys;
}

/** Next state in the carry cycle.
 *  Equippable: unequipped → equipped → stashed → unequipped.
 *  Non-equippable (gear): not stashed → stashed.
 *  `stashed` always wins over `equipped` on input, so an inconsistent document
 *  (both flags set) resolves rather than propagating the inconsistency. */
export function nextCarryState(state, { equippable } = {}) {
  const stashed = !!state?.stashed;
  const equipped = !stashed && !!state?.equipped;
  if (!equippable) return { equipped: false, stashed: !stashed };
  if (stashed) return { equipped: false, stashed: false };
  if (equipped) return { equipped: false, stashed: true };
  return { equipped: true, stashed: false };
}

/** Total weight of the items an actor has on their person. Stashed items contribute
 *  nothing; a weapon's spare magazines travel with the weapon, so a stashed gun takes
 *  its ammunition out of the total too. */
export function carriedWeight(items) {
  return (items ?? []).reduce((sum, i) => {
    const sys = i?.system ?? {};
    if (!WEIGHT_BEARING.has(i?.type) || sys.stashed) return sum;
    const w = Number(sys.weight) || 0;
    if (i.type === "gear") return sum + w * (Number(sys.quantity ?? 1) || 0);
    if (i.type === "weapon") return sum + w + magazineWeight(sys);
    return sum + w;
  }, 0);
}
