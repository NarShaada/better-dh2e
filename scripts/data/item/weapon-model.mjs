// scripts/data/item/weapon-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class WeaponModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      weaponClass: new fields.StringField({
        required: true,
        choices: ["melee", "pistol", "basic", "heavy", "thrown"],
        initial: "melee"
      }),
      range: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      rateOfFire: new fields.SchemaField({
        single: new fields.BooleanField({ required: true, initial: true }),
        burst:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        full:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      damage:      new fields.StringField({ required: true, initial: "1d10" }),
      damageType:  new fields.StringField({ required: true, choices: ["impact", "energy", "rending", "explosive"], initial: "impact" }),
      penetration: new fields.StringField({ required: true, initial: "0" }),
      clip: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      // Structured qualities — never free text — so the resolution pipeline (later plan) can trigger reliably.
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null })
      })),
      equipped: new fields.BooleanField({ required: true, initial: false })
    };
  }
}
