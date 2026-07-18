// scripts/data/item/talent-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class TalentModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      tier:          new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 3 }),
      prerequisites: new fields.StringField({ required: true, initial: "" }),
      aptitudes:     new fields.ArrayField(new fields.StringField({ choices: BDH.aptitudes })),
      alignment:     new fields.StringField({ required: true, choices: Object.keys(BDH.alignments), initial: "unaligned" }),
      favourite:     new fields.BooleanField({ required: true, initial: false }),
      purchased:     new fields.BooleanField({ required: true, initial: false })
    };
  }
}
