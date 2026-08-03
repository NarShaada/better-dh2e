// scripts/data/item/armour-mod-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

/** An armour upgrade (Enemies Within, p. 49). Deliberately DESCRIPTION-ONLY.
 *
 *  weaponMod carries attackMod/damageMod/penMod because those modify the parent WEAPON's stats.
 *  No armour upgrade modifies the parent ARMOUR's stats as a flat value — the closest, Ceramite
 *  Plating, doubles AP against one damage type, which is a condition and not a field. Strip that
 *  axis from weaponMod and what remains is `special`, i.e. description. So there is nothing here
 *  to automate: any numeric part is wired onto the armour's own `bonuses`/`grants`, one level up,
 *  which already apply exactly while the armour is equipped.
 *
 *  `craftsmanship` is omitted on purpose: the book does not grade upgrades by it, and the
 *  Requisition dialog asks for target craftsmanship independently, so the field would never be read. */
export class ArmourModModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),   // description
      /** Free text, not an enum — the book's values vary ("Any armour", "Power armour",
       *  "Carapace and power armour", "Any armour, helmet, or backpack"). */
      usedWith:     new fields.StringField({ required: true, initial: "" }),
      weight:       new fields.NumberField({ required: true, initial: 0, min: 0 }),
      availability: new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "average" })
    };
  }
}
