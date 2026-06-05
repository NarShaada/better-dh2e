// scripts/data/item/trait-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

export class TraitModel extends BaseItemModel {
  static defineSchema() {
    return { ...super.defineSchema() };
  }
}
