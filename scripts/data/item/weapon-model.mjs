// scripts/data/item/weapon-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class WeaponModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      weaponClass: new fields.StringField({ required: true, choices: Object.keys(BDH.weaponClasses), initial: "melee" }),
      weaponType:  new fields.StringField({ required: true, choices: Object.keys(BDH.weaponTypes), initial: "lowTech" }),
      range:       new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      reload:      new fields.StringField({ required: true, choices: Object.keys(BDH.reload), initial: "full" }),
      clip: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      rateOfFire: new fields.SchemaField({
        single: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        short:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        long:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      damage:      new fields.StringField({ required: true, initial: "1d10" }),
      damageType:  new fields.StringField({ required: true, choices: Object.keys(BDH.damageTypes), initial: "impact" }),
      penetration: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      special:     new fields.StringField({ required: true, initial: "" }),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "common" }),
      weight:        new fields.NumberField({ required: true, initial: 0, min: 0 }),
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null })
      })),
      mods: new fields.ArrayField(new fields.SchemaField({
        name:      new fields.StringField({ required: true, initial: "" }),
        attackMod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        damageMod: new fields.StringField({ required: true, initial: "" }),
        penMod:    new fields.NumberField({ required: true, integer: true, initial: 0 }),
        special:   new fields.StringField({ required: true, initial: "" })
      })),
      equipped: new fields.BooleanField({ required: true, initial: false }),
      hordeEquipped: new fields.BooleanField({ required: true, initial: false })
    };
  }
}
