// scripts/data/item/trait-model.mjs — traits are inherent, so their bonuses/statMods/grants are always
// active while owned (same shapes as cybernetics; see [[item-bonuses]] / [[cybernetics]]).
import { BaseItemModel, bonusesField, grantsField, statModsField } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class TraitModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      favourite: new fields.BooleanField({ required: true, initial: false }),
      bonuses:   bonusesField(),
      statMods:  statModsField(),
      grants:    grantsField()
    };
  }
}
