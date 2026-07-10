// scripts/data/actor/vehicle-model.mjs — a Vehicle is NOT a character: no characteristics/skills/wounds.
// Integrity + Conditions are stored-only (no automation, like acolyte wounds/crits); the GM marks a
// wreck manually. Crew is a list of seats, each holding an occupant actor + weapons fired with the
// occupant's stats. Driver is always present (seeded here + protected in the sheet).
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

/** One crew seat. `weapons` holds the ids of the vehicle's embedded weapon items assigned here. */
function crewSeatField() {
  return new fields.SchemaField({
    role:      new fields.StringField({ required: true, blank: false, initial: "Crew" }),
    fixed:     new fields.BooleanField({ required: true, initial: false }),   // Driver = true (non-deletable)
    actorUuid: new fields.StringField({ required: true, blank: true, initial: "" }),   // seated actor
    operate:   new fields.StringField({ required: true, blank: true, initial: "" }),   // driver's chosen Operate specialty name
    weapons:   new fields.ArrayField(new fields.StringField({ required: true, blank: false }))
  });
}

export class VehicleModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const ap = () => new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
    return {
      vehicleType:  new fields.StringField({ required: true, choices: Object.keys(BDH.vehicleTypes), initial: "wheeled" }),
      availability: new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "common" }),
      armour: new fields.SchemaField({ front: ap(), left: ap(), right: ap(), rear: ap() }),
      integrity: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      size:            new fields.NumberField({ required: true, integer: true, initial: 7, min: 1, max: 10 }),   // vehicles skew large
      manoeuvrability: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      tacticalSpeed:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),   // metres
      cruisingSpeed:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),   // kph
      carrying:        new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),   // passenger seats (plain number)
      specialRules:    new fields.StringField({ required: true, blank: true, initial: "" }),
      conditions:      new fields.ArrayField(new fields.StringField({ required: true, blank: true })),   // stores criticals, free text
      crew:            new fields.ArrayField(crewSeatField(), {
        initial: () => [{ role: "Driver", fixed: true, actorUuid: "", operate: "", weapons: [] }]
      })
    };
  }
}
