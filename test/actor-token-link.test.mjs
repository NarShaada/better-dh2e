import { describe, it, expect, beforeAll } from "vitest";

// DarkHeresyActor extends Foundry's Actor, which does not exist under vitest, so the class is
// imported dynamically against a minimal stub — the same pattern as actor-model-defaults.test.mjs.
let DarkHeresyActor;

beforeAll(async () => {
  globalThis.Actor = class {
    constructor(type) { this.type = type; this._source = {}; }
    updateSource(patch) { Object.assign(this._source, patch); return this._source; }
    _preCreate() { return undefined; }
  };
  ({ DarkHeresyActor } = await import("../scripts/documents/actor.mjs"));
});

/** A DarkHeresyActor of `type` whose _preCreate has been run with `data`. */
function created(type, data = {}) {
  const a = new DarkHeresyActor(type);
  a.type = type;
  a._preCreate(data, {}, {});
  return a._source;
}

describe("DarkHeresyActor._preCreate — prototype token linking", () => {
  it("links a new acolyte, because an unlinked PC splits GM and player views of the same sheet", () => {
    expect(created("acolyte").prototypeToken).toEqual({ actorLink: true });
  });

  it("leaves npc, horde and vehicle unlinked — those are placed in quantity", () => {
    for (const t of ["npc", "horde", "vehicle"]) {
      expect(created(t).prototypeToken).toBeUndefined();
    }
  });

  it("does not override an explicit choice, in either direction", () => {
    expect(created("acolyte", { prototypeToken: { actorLink: false } }).prototypeToken).toBeUndefined();
    expect(created("acolyte", { prototypeToken: { actorLink: true } }).prototypeToken).toBeUndefined();
  });

  it("still defaults when prototypeToken is present but carries no actorLink", () => {
    expect(created("acolyte", { prototypeToken: { name: "Scout" } }).prototypeToken).toEqual({ actorLink: true });
  });
});
