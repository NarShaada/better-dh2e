// scripts/data/item/trait-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class TraitModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      favourite: new fields.BooleanField({ required: true, initial: false })
    };
  }
}
