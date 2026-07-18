// scripts/data/actor/acolyte-model.mjs
import { BaseActorModel } from "./base-actor-model.mjs";

const fields = foundry.data.fields;

export class AcolyteModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      bio: new fields.SchemaField({
        homeWorld:  new fields.StringField({ required: true, initial: "" }),
        background: new fields.StringField({ required: true, initial: "" }),
        role:       new fields.StringField({ required: true, initial: "" }),
        elite:      new fields.StringField({ required: true, initial: "" }),
        // Black Crusade header fields (Sheet Header Style = bc). Both sets are always stored.
        race:       new fields.StringField({ required: true, initial: "" }),
        archetype:  new fields.StringField({ required: true, initial: "" }),
        pride:      new fields.StringField({ required: true, initial: "" }),
        disgrace:   new fields.StringField({ required: true, initial: "" }),
        motivation: new fields.StringField({ required: true, initial: "" })
      })
    };
  }
}
