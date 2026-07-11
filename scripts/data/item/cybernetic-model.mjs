// scripts/data/item/cybernetic-model.mjs
import { BaseItemModel, bonusesField, grantsField, statModsField } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class CyberneticModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "rare" }),
      installed:     new fields.BooleanField({ required: true, initial: false }),
      bonuses:       bonusesField(),
      statMods:      statModsField(),
      grants:        grantsField()
    };
  }
}
