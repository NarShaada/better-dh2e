// scripts/data/item/base-item-model.mjs
import { normalizeCraftsmanship } from "../../helpers/craftsmanship-data.mjs";

const fields = foundry.data.fields;

export class BaseItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.StringField({ required: true, initial: "" })
    };
  }

  /** Runs before validation on every construction (incl. the strict re-init a combat update triggers).
   *  Classic-DH / legacy items store craftsmanship "common" (renamed "normal" here); the
   *  choices-constrained field would otherwise THROW and cascade into Foundry's
   *  "You may only push instances of Combat" error, breaking the initiative tracker. Coerce so
   *  such worlds self-heal on load. Harmless for item types without a craftsmanship field. */
  static migrateData(source) {
    if (source && "craftsmanship" in source) source.craftsmanship = normalizeCraftsmanship(source.craftsmanship);
    return super.migrateData(source);
  }
}

/** Shared schema fragment: optional skill/characteristic bonus entries (cybernetics/gear/armour). */
export function bonusesField() {
  return new fields.ArrayField(new fields.SchemaField({
    kind:        new fields.StringField({ required: true, initial: "skill", choices: ["skill", "characteristic"] }),
    key:         new fields.StringField({ required: true, blank: true, initial: "" }),
    amount:      new fields.NumberField({ required: true, integer: true, initial: 0 }),
    situational: new fields.BooleanField({ required: true, initial: false })
  }));
}

/** Shared schema fragment: references to real Item documents granted while the host is active (cybernetic/armour). */
export function grantsField() {
  return new fields.ArrayField(new fields.SchemaField({
    uuid: new fields.StringField({ required: true, blank: false }),
    name: new fields.StringField({ required: true, initial: "" }),
    type: new fields.StringField({ required: true, initial: "" })
  }));
}
