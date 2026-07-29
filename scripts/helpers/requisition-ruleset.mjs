// scripts/helpers/requisition-ruleset.mjs — resolves the Requisition Rules setting.
// makeRequisitionRuleset is PURE (config import only) and unit-tested. This module is the ONLY
// place a dh2/bc branch may live — the dialog and card consume the returned ruleset object and
// stay ruleset-agnostic, exactly as advancement-ruleset.mjs and psychic-ruleset.mjs do.
//
// Only "dh2" is implemented. Black Crusade acquisition differs; when it is written it becomes a
// second branch here and gains a `requisitionRules` world setting at the same time. Registering a
// setting whose only other choice throws would be worse than having no setting at all.
import { BDH } from "../config.mjs";

/** Build the ruleset object for "dh2". */
export function makeRequisitionRuleset(key) {
  if (key !== "dh2") throw new Error(`Unknown requisition ruleset "${key}" — only "dh2" is implemented.`);
  return {
    key: "dh2",
    characteristic: "influence",

    /** Requisition modifier for an availability level, or null for Ubiquitous (= Automatic, p.141).
     *  An unknown level yields 0 so a malformed item cannot poison the total with NaN. */
    availabilityModifier(level) {
      const m = BDH.availabilityModifier[level];
      return m === undefined ? 0 : m;
    },

    /** Requisition/Repair modifier for a craftsmanship tier (p.141). Unknown tiers yield 0. */
    craftsmanshipModifier(craft) {
      return BDH.craftsmanshipRequisition[craft] ?? 0;
    },

    /** Fold the two into one modifier plus a labelled breakdown for the dialog's info rows.
     *  Ubiquitous short-circuits to `automatic` — there is no test to modify. */
    totalModifier({ availability, craftsmanship }) {
      const avail = this.availabilityModifier(availability);
      const craft = this.craftsmanshipModifier(craftsmanship);
      if (avail === null) return { automatic: true, modifier: 0, parts: [] };
      return {
        automatic: false,
        modifier: avail + craft,
        parts: [
          { label: BDH.availability[availability] ?? String(availability), value: avail },
          { label: BDH.craftsmanship[craftsmanship] ?? String(craftsmanship), value: craft }
        ]
      };
    }
  };
}
