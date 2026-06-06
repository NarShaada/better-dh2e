// scripts/data/actor/base-actor-model.mjs
import { BDH } from "../../config.mjs";
import { characteristicTotal, characteristicBonus, skillTotal, fatigueMax, movement } from "../../helpers/derived.mjs";

const fields = foundry.data.fields;

/** Build the characteristics schema: one object per characteristic with base/advance/unnatural. */
function characteristicsSchema() {
  const schema = {};
  for (const key of Object.keys(BDH.characteristics)) {
    schema[key] = new fields.SchemaField({
      base:      new fields.NumberField({ required: true, integer: true, initial: 25, min: 0 }),
      advance:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      unnatural: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    });
  }
  return new fields.SchemaField(schema);
}

/** Build the skills schema: one object per skill with a rank string. */
function skillsSchema() {
  const schema = {};
  for (const key of Object.keys(BDH.skills)) {
    schema[key] = new fields.SchemaField({
      rank: new fields.StringField({
        required: true,
        choices: Object.keys(BDH.skillRanks),
        initial: "untrained"
      }),
      favourite: new fields.BooleanField({ required: true, initial: false })
    });
  }
  return new fields.SchemaField(schema);
}

/** An array of {name, description} entries (mutations, malignancies, mental disorders). */
function namedListField() {
  return new fields.ArrayField(new fields.SchemaField({
    name:        new fields.StringField({ required: true, initial: "" }),
    description: new fields.StringField({ required: true, initial: "" })
  }));
}

export class BaseActorModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      characteristics: characteristicsSchema(),
      skills: skillsSchema(),
      wounds: new fields.SchemaField({
        value:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:      new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        critical: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      fatigue: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        maxOverride: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null, min: 0 })
      }),
      fate: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      size: new fields.NumberField({ required: true, integer: true, initial: 4, min: 0 }),
      afflictions: new fields.SchemaField({
        mutations:       namedListField(),
        malignancies:    namedListField(),
        mentalDisorders: namedListField()
      }),
      injuries: new fields.ArrayField(new fields.SchemaField({
        description: new fields.StringField({ required: true, initial: "" })
      })),
      notes: new fields.StringField({ required: true, initial: "" }),
      corruption: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      insanity: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      psyRating: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      experience: new fields.SchemaField({
        total: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spent: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      aptitudes: new fields.ArrayField(new fields.StringField({ choices: BDH.aptitudes })),
      initiative: new fields.SchemaField({
        characteristic: new fields.StringField({ required: true, choices: Object.keys(BDH.characteristics), initial: "agility" })
      })
    };
  }

  /** Compute derived characteristic totals/bonuses, skill totals, fatigue max, movement. */
  prepareDerivedData() {
    for (const c of Object.values(this.characteristics)) {
      c.total = characteristicTotal(c);
      c.bonus = characteristicBonus(c);
    }
    for (const [key, skill] of Object.entries(this.skills)) {
      const charKey = BDH.skills[key].characteristic;
      skill.total = skillTotal(this.characteristics[charKey].total, skill.rank);
    }
    this.fatigue.max = this.fatigue.maxOverride ?? fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
    this.movement = movement(this.characteristics.agility.bonus, this.size);
  }
}
