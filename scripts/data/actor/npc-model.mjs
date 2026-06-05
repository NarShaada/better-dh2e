// scripts/data/actor/npc-model.mjs
import { BaseActorModel } from "./base-actor-model.mjs";

const fields = foundry.data.fields;

export class NpcModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      faction:     new fields.StringField({ required: true, initial: "" }),
      threatLevel: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    };
  }
}
