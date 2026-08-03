// scripts/data/item/psychic-power-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";
import { normalizeSustain } from "../../helpers/sustain-data.mjs";

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
      sustained:     new fields.StringField({ required: true, choices: Object.keys(BDH.sustainActions), initial: "no" }),
      duration:      new fields.StringField({ required: true, initial: "" }),
      action:        new fields.StringField({ required: true, choices: Object.keys(BDH.psychicActions), initial: "half" }),
      damage:        new fields.StringField({ required: true, initial: "" }),
      damageType:    new fields.StringField({ required: true, choices: Object.keys(BDH.damageTypes), initial: "energy" }),
      penetration:   new fields.StringField({ required: true, initial: "0" }),
      blastRadius:   new fields.StringField({ required: true, initial: "0" }),
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null })
      }), { initial: [] }),
      cost:          new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      favourite:     new fields.BooleanField({ required: true, initial: false }),
      purchased:     new fields.BooleanField({ required: true, initial: false }),
    };
  }

  /** `sustained` was a BooleanField before the sustain-action enum. A choices-constrained
   *  StringField THROWS when handed a boolean, and that throw cascades into Foundry's "You may
   *  only push instances of Combat" error, breaking the initiative tracker — see the note on
   *  BaseItemModel.migrateData. Coerce so existing worlds self-heal on load. `super` is called so
   *  the inherited craftsmanship normalization still runs. */
  static migrateData(source) {
    if (source && "sustained" in source) source.sustained = normalizeSustain(source.sustained);
    // blastRadius became a string so Holocaust can hold "PR" (Enemies Beyond p. 56). Numeric
    // values from before that change coerce; the shipped corpus only ever held 0 and 2.
    if (source && typeof source.blastRadius === "number") source.blastRadius = String(source.blastRadius);
    return super.migrateData(source);
  }
}
