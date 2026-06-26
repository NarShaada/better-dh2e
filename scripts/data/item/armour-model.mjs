// scripts/data/item/armour-model.mjs
import { BaseItemModel, bonusesField, grantsField } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

const apField = () => new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });

export class ArmourModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      locations: new fields.SchemaField({
        head: apField(), body: apField(), rightArm: apField(), leftArm: apField(), rightLeg: apField(), leftLeg: apField()
      }),
      additive:      new fields.BooleanField({ required: true, initial: false }),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "average" }),
      weight:        new fields.NumberField({ required: true, initial: 0, min: 0 }),
      equipped:      new fields.BooleanField({ required: true, initial: false }),
      maxAgility:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      bonuses:       bonusesField(),
      grants:        grantsField()
    };
  }
}
