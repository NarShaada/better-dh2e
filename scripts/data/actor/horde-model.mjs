// scripts/data/actor/horde-model.mjs — a Horde is an NPC with Magnitude instead of Wounds; Size derives from Magnitude.
import { NpcModel } from "./npc-model.mjs";
import { hordeSize } from "../../helpers/horde-data.mjs";

const fields = foundry.data.fields;

export class HordeModel extends NpcModel {
  static defineSchema() {
    const base = super.defineSchema();   // NpcModel + BaseActorModel fields
    delete base.wounds;                  // a horde has Magnitude, not Wounds
    return {
      ...base,
      magnitude: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    };
  }

  prepareDerivedData() {
    this.size = hordeSize(this.magnitude);   // derive BEFORE super so movement/to-hit use it
    super.prepareDerivedData();
  }
}
