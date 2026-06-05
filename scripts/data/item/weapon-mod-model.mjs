// scripts/data/item/weapon-mod-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class WeaponModModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      attackMod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      damageMod: new fields.StringField({ required: true, initial: "" }),
      penMod:    new fields.NumberField({ required: true, integer: true, initial: 0 }),
      special:   new fields.StringField({ required: true, initial: "" })
    };
  }
}
