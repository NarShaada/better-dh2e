// scripts/data/actor/base-actor-model.mjs
import { BDH } from "../../config.mjs";
import { characteristicTotal, characteristicBonus, skillTotal, fatigueMax, movement } from "../../helpers/derived.mjs";
import { effectiveAgilityCap, applyImpairments } from "../../helpers/impairment-data.mjs";

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

/** Build the skills schema: standard skills get rank+favourite; specialist skills get a specialties array of {name, rank, favourite}. */
function skillsSchema() {
  const schema = {};
  for (const key of Object.keys(BDH.skills)) {
    if (BDH.skills[key].specialist) {
      schema[key] = new fields.SchemaField({
        specialties: new fields.ArrayField(new fields.SchemaField({
          id:        new fields.StringField({ required: true, initial: "" }),
          name:      new fields.StringField({ required: true, initial: "" }),
          rank:      new fields.StringField({ required: true, choices: BDH.specialtyRanks, initial: "known" }),
          favourite: new fields.BooleanField({ required: true, initial: false })
        }))
      });
    } else {
      schema[key] = new fields.SchemaField({
        rank:      new fields.StringField({ required: true, choices: Object.keys(BDH.skillRanks), initial: "untrained" }),
        favourite: new fields.BooleanField({ required: true, initial: false })
      });
    }
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
      psykerClass: new fields.StringField({ required: true, choices: Object.keys(BDH.psykerClasses), initial: "bound" }),
      experience: new fields.SchemaField({
        total: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spent: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      advancementLog: new fields.ArrayField(new fields.SchemaField({
        type:        new fields.StringField({ required: true, initial: "" }),
        label:       new fields.StringField({ required: true, initial: "" }),
        detail:      new fields.StringField({ required: true, initial: "" }),
        cost:        new fields.NumberField({ required: true, integer: true, initial: 0 }),
        ref:         new fields.StringField({ required: true, initial: "" }),
        specialtyId: new fields.StringField({ required: true, initial: "" }),
        toRank:      new fields.StringField({ required: true, initial: "" })
      })),
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
    // Fatigue max from UNIMPAIRED Toughness/Willpower bonuses (impairment must not shrink the max).
    this.fatigue.max = this.fatigue.maxOverride ?? fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
    // Impairment: armour Agility cap + fatigue halving (mutates this.characteristics, sets `impaired`).
    const equippedArmour = this.parent.items.filter((i) => i.type === "armour" && i.system.equipped).map((i) => i.system);
    applyImpairments(this.characteristics, this.fatigue.value, effectiveAgilityCap(equippedArmour));
    // Skills + movement use the (possibly impaired) characteristic totals/bonuses.
    for (const [key, skill] of Object.entries(this.skills)) {
      const charTotal = this.characteristics[BDH.skills[key].characteristic].total;
      if (BDH.skills[key].specialist) {
        for (const sp of skill.specialties) sp.total = skillTotal(charTotal, sp.rank);
      } else {
        skill.total = skillTotal(charTotal, skill.rank);
      }
    }
    this.movement = movement(this.characteristics.agility.bonus, this.size);
  }
}
