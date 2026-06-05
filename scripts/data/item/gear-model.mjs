// scripts/data/item/gear-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class GearModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "common" }),
      weight:   new fields.NumberField({ required: true, initial: 0, min: 0 }),
      quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
    };
  }
}
