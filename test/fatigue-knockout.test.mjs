// test/fatigue-knockout.test.mjs
// The Fatigue knockout LADDER is pure and covered in condition-data.test.mjs. What is covered here
// is the wiring: which actor updates registerFatigueHooks bothers to look at, and that
// checkFatigueThreshold then applies/latches Unconscious.
//
// The guard has to watch both sides of the `value > max` comparison. The threshold is Toughness
// bonus + Willpower bonus, and characteristic damage lowers those bonuses — but it is stored as
// `type: "charDamage"` entries in system.injuries, NOT under system.characteristics, so an
// injuries-only update can drop fatigue.max under a Fatigue level that never moved.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { installFoundryStub, resetCaptures, capturedMessages, makeActor } from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";
const ME = "user-1";
const SOMEONE_ELSE = "user-2";

let registerFatigueHooks, checkFatigueThreshold;
let onUpdateActor;

beforeAll(async () => {
  installFoundryStub({ userId: ME });
  // installFoundryStub leaves Hooks as no-ops; capture the handler instead of dropping it.
  globalThis.Hooks = {
    on(event, cb) { if (event === "updateActor") onUpdateActor = cb; },
    once() {}, off() {}, call() {}, callAll() {},
  };
  ({ registerFatigueHooks, checkFatigueThreshold } = await import("../scripts/rolls/conditions.mjs"));
  registerFatigueHooks();
});
beforeEach(() => resetCaptures());

/** The hook fires and forgets, so give its promise chain a macrotask to settle. Every awaited call
 *  inside checkFatigueThreshold resolves immediately in the stub, so one boundary is enough. */
const flush = () => new Promise((r) => setTimeout(r, 0));

const fatigued = (value, max) => makeActor({ name: "Acolyte", system: { fatigue: { value, max } } });

describe("checkFatigueThreshold", () => {
  it("knocks the actor out and latches once Fatigue passes the threshold", async () => {
    const a = fatigued(5, 4);
    await checkFatigueThreshold(a);
    expect(a.statuses.has("unconscious")).toBe(true);
    expect(a.getFlag(NS, "fatigueKnockout")).toBe(true);
    expect(capturedMessages()).toHaveLength(1);
  });

  it("does not re-apply while latched, so a GM clearing Unconscious by hand sticks", async () => {
    const a = fatigued(5, 4);
    await checkFatigueThreshold(a);
    await a.toggleStatusEffect("unconscious", { active: false });
    resetCaptures();

    await checkFatigueThreshold(a);
    expect(a.statuses.has("unconscious")).toBe(false);
    expect(capturedMessages()).toEqual([]);
  });

  it("re-arms once Fatigue is back at or under the threshold", async () => {
    const a = fatigued(5, 4);
    await checkFatigueThreshold(a);
    a.system.fatigue.value = 4;
    await checkFatigueThreshold(a);
    expect(a.getFlag(NS, "fatigueKnockout")).toBeUndefined();
  });
});

describe("registerFatigueHooks — which updates it watches", () => {
  it("knocks out when an injuries update drops fatigue.max under an UNCHANGED Fatigue", async () => {
    // Fatigue 6 against a threshold of 8: fine, nothing to do.
    const a = fatigued(6, 8);
    onUpdateActor(a, { system: { fatigue: { value: 6 } } }, {}, ME);
    await flush();
    expect(a.statuses.has("unconscious")).toBe(false);

    // Characteristic damage lands. prepareDerivedData applies it before deriving fatigue.max, so
    // by the time updateActor fires the threshold has already fallen to 5 — under the Fatigue of 6.
    // The update itself only ever mentions system.injuries.
    a.system.fatigue.max = 5;
    onUpdateActor(a, { system: { injuries: [{ type: "charDamage", characteristic: "toughness", amount: 10 }] } }, {}, ME);
    await flush();

    expect(a.statuses.has("unconscious")).toBe(true);
    expect(a.getFlag(NS, "fatigueKnockout")).toBe(true);
  });

  it("still watches a plain Fatigue change", async () => {
    const a = fatigued(9, 8);
    onUpdateActor(a, { system: { fatigue: { value: 9 } } }, {}, ME);
    await flush();
    expect(a.statuses.has("unconscious")).toBe(true);
  });

  it("still watches a direct characteristic edit, which also moves the threshold", async () => {
    const a = fatigued(6, 5);
    onUpdateActor(a, { system: { characteristics: { willpower: { base: 20 } } } }, {}, ME);
    await flush();
    expect(a.statuses.has("unconscious")).toBe(true);
  });

  it("ignores an update that can move neither side of the comparison", async () => {
    const a = fatigued(9, 8);
    onUpdateActor(a, { system: { wounds: { value: 3 } } }, {}, ME);
    await flush();
    expect(a.statuses.has("unconscious")).toBe(false);
  });

  it("only the acting client writes, so a shared scene fires this once", async () => {
    const a = fatigued(9, 8);
    onUpdateActor(a, { system: { injuries: [{ type: "charDamage" }] } }, {}, SOMEONE_ELSE);
    await flush();
    expect(a.statuses.has("unconscious")).toBe(false);
  });
});
