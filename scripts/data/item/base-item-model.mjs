// scripts/data/item/base-item-model.mjs
const fields = foundry.data.fields;

export class BaseItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.StringField({ required: true, initial: "" })
    };
  }
}

/** Shared schema fragment: optional skill/characteristic bonus entries (cybernetics/gear/armour). */
export function bonusesField() {
  return new fields.ArrayField(new fields.SchemaField({
    kind:        new fields.StringField({ required: true, initial: "skill", choices: ["skill", "characteristic"] }),
    key:         new fields.StringField({ required: true, blank: true, initial: "" }),
    amount:      new fields.NumberField({ required: true, integer: true, initial: 0 }),
    situational: new fields.BooleanField({ required: true, initial: false }),
    persistent:  new fields.BooleanField({ required: true, initial: false })
  }));
}
