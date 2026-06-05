// scripts/data/item/force-field-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class ForceFieldModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      protectionRating: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      overload:         new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      craftsmanship:    new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:     new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "rare" }),
      weight:           new fields.NumberField({ required: true, initial: 0, min: 0 }),
      equipped:         new fields.BooleanField({ required: true, initial: false })
    };
  }
}
