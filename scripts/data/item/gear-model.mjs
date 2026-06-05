// scripts/data/item/gear-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class GearModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      craftsmanship: new fields.StringField({
        required: true,
        choices: ["poor", "normal", "good", "best"],
        initial: "normal"
      }),
      quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      weight:   new fields.NumberField({ required: true, initial: 0, min: 0 })
    };
  }
}
