// test/actor-model-defaults.test.mjs
//
// Item 2 of the custom-init-movement review: the existing derived.test.mjs coverage for
// movementBaseValue/initiativeBase/initiativeFormula only ever exercises a HAND-WRITTEN config
// object, so it guards the pure helper's math but not the SHIPPED SCHEMA INITIALS in
// scripts/data/actor/base-actor-model.mjs. If someone silently changed, say, movementBase's
// `multiplier` initial from 1 to 2, every existing character's movement would double on next load
// and nothing in derived.test.mjs would catch it.
//
// This file reads the REAL initials off BaseActorModel.defineSchema() and asserts they are inert
// (i.e. reproduce today's un-configured behaviour). base-actor-model.mjs needs a `foundry` global at
// import time (`const fields = foundry.data.fields;` at module scope), so we install a minimal stub
// BEFORE dynamically importing it — a static import would throw at collection time. The stub only
// needs to support the five field types base-actor-model.mjs actually constructs: String/Number/
// Boolean/ArrayField as inert constructors that stash `options.initial`, and SchemaField additionally
// exposing the passed field-map as `.fields` so we can walk it back out. foundry.abstract.TypeDataModel
// is stubbed as an empty base class (BaseActorModel extends it, but we only ever call the static
// defineSchema() — prepareDerivedData, which needs a real `this.parent`, is never invoked here).
import { describe, it, expect, beforeAll } from "vitest";
import { movement, movementBaseValue, initiativeBase, initiativeFormula } from "../scripts/helpers/derived.mjs";

class FakeField {
  constructor(options = {}) {
    this.initial = options.initial;
  }
}
class StringField extends FakeField {}
class NumberField extends FakeField {}
class BooleanField extends FakeField {}
class ArrayField extends FakeField {}
class SchemaField extends FakeField {
  constructor(fieldsObj, options = {}) {
    super(options);
    this.fields = fieldsObj;   // the raw {key: Field} map passed in — lets us walk initials back out
  }
}

/** Pull { key: field.initial } off a SchemaField built by the stub above. */
function initialsOf(schemaField) {
  const out = {};
  for (const [key, field] of Object.entries(schemaField.fields)) out[key] = field.initial;
  return out;
}

let movementBaseInitials, initiativeInitials;

beforeAll(async () => {
  globalThis.foundry = {
    data: { fields: { StringField, NumberField, BooleanField, ArrayField, SchemaField } },
    abstract: { TypeDataModel: class {} },
  };
  const { BaseActorModel } = await import("../scripts/data/actor/base-actor-model.mjs");
  const schema = BaseActorModel.defineSchema();
  movementBaseInitials = initialsOf(schema.movementBase);
  initiativeInitials = initialsOf(schema.initiative);
});

describe("BaseActorModel schema initials are inert (guard against a silent schema-initial change)", () => {
  it("movementBase's shipped initials reproduce movement(agilityBonus, size) exactly, for every existing character", () => {
    for (const [ab, size] of [[3, 4], [0, 4], [5, 6], [2, 3]]) {
      expect(movement(movementBaseValue(movementBaseInitials, ab), size)).toEqual(movement(ab, size));
    }
  });

  it("initiative's shipped initials return the characteristic bonus unchanged", () => {
    expect(initiativeBase(initiativeInitials, 4)).toBe(4);
  });

  it("initiative's shipped dice initial builds the system-default formula", () => {
    expect(initiativeFormula(initiativeInitials.dice)).toBe("1d10 + @initiativeBonus");
  });
});
