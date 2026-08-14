// scripts/data/item/base-item-model.mjs
import { normalizeCraftsmanship } from "../../helpers/craftsmanship-data.mjs";
import { applyCarryInvariant } from "../../helpers/carry-state.mjs";

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

  /** A stashed item is off the character's person, so it must not read as equipped. Applying it
   *  here means nothing downstream — attack rolls, armour AP, grants, item bonuses — needs to
   *  know the stashed state exists. Harmless for item types that have neither field. */
  prepareDerivedData() {
    super.prepareDerivedData();
    applyCarryInvariant(this);
  }
}

/** Shared schema fragment: optional bonus entries (cybernetics/gear/armour/traits).
 *  kind: "skill" | "characteristic" (flat value) | "unnatural" (raises the characteristic's unnatural bonus). */
export function bonusesField() {
  return new fields.ArrayField(new fields.SchemaField({
    kind:        new fields.StringField({ required: true, initial: "skill", choices: ["skill", "characteristic", "unnatural"] }),
    key:         new fields.StringField({ required: true, blank: true, initial: "" }),
    amount:      new fields.NumberField({ required: true, integer: true, initial: 0 }),
    situational: new fields.BooleanField({ required: true, initial: false })
  }));
}

/** Shared schema fragment: derived-stat modifiers (cybernetics + traits). */
export function statModsField() {
  return new fields.ArrayField(new fields.SchemaField({
    stat:   new fields.StringField({ required: true, blank: true, initial: "",
      choices: ["moveAll", "moveHalf", "moveFull", "moveCharge", "moveRun", "wounds", "size", "fatigue", "carry", "initiative"] }),
    amount: new fields.NumberField({ required: true, integer: true, initial: 0 })
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
