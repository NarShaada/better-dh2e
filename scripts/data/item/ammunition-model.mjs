// scripts/data/item/ammunition-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

/** A magazine type. Dropped onto a weapon it is copied into weapon.system.ammo[] with a count;
 *  loading one copies its effects into weapon.system.loadedAmmo. Mirrors WeaponModModel, plus
 *  qualities and an optional damage-type override. */
export class AmmunitionModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      attackMod:  new fields.NumberField({ required: true, integer: true, initial: 0 }),
      damageMod:  new fields.StringField({ required: true, initial: "" }),
      penMod:     new fields.NumberField({ required: true, integer: true, initial: 0 }),
      special:    new fields.StringField({ required: true, initial: "" }),
      // "" = keep the weapon's damage type.
      damageType: new fields.StringField({ required: true, initial: "", blank: true,
                                           choices: ["", ...Object.keys(BDH.damageTypes)] }),
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null })
      }))
    };
  }
}
