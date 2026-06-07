// scripts/data/item/psychic-power-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

export class PsychicPowerModel extends BaseItemModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),     // description (the effect body)
      discipline:    new fields.StringField({ required: true, choices: Object.keys(BDH.disciplines), initial: "minor" }),
      type:          new fields.StringField({ required: true, choices: Object.keys(BDH.psychicTypes), initial: "effect" }),
      prerequisite:  new fields.StringField({ required: true, initial: "" }),
      focusTest:     new fields.StringField({ required: true, initial: "willpower" }),
      focusModifier: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      opposed:       new fields.BooleanField({ required: true, initial: false }),
      opposedBy:     new fields.StringField({ required: true, choices: Object.keys(BDH.characteristics), initial: "willpower" }),
      range:         new fields.StringField({ required: true, initial: "" }),
      sustained:     new fields.BooleanField({ required: true, initial: false }),
      duration:      new fields.StringField({ required: true, initial: "" }),
      action:        new fields.StringField({ required: true, choices: Object.keys(BDH.psychicActions), initial: "half" }),
      damage:        new fields.StringField({ required: true, initial: "" }),
      damageType:    new fields.StringField({ required: true, choices: Object.keys(BDH.damageTypes), initial: "energy" }),
      penetration:   new fields.StringField({ required: true, initial: "0" }),
      blastRadius:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      cost:          new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    };
  }
}
