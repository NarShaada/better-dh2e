// test/run-status.test.mjs
//
// The Run condition follows how far a token has moved this turn. The handler used to live inline in
// better-dh2e.mjs and read only `movement.history.distance` — the distance recorded BEFORE the move
// just made — so one 18 m drag left a runner without the Run condition (and the attacker without
// the modifier that goes with it); the condition appeared, if at all, one move late.
import { describe, it, expect, beforeAll } from "vitest";
import { installFoundryStub, makeActor } from "./helpers/foundry-stub.mjs";

let syncRunStatus;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true }, userId: "user-1" });
  ({ syncRunStatus } = await import("../scripts/canvas/run-status.mjs"));
});

const ME = { id: "user-1" };
const RATES = { half: 3, full: 6, charge: 9, run: 18 };

/** A token document in (or out of) a started combat. */
function makeToken({ statuses = [], started = true } = {}) {
  const actor = makeActor({ system: { movement: RATES }, statuses: new Set(statuses) });
  return { actor, combatant: started ? { parent: { started: true } } : null };
}
const moved = ({ history = 0, passed = 0, recorded = true } = {}) => ({
  recorded, history: { distance: history }, passed: { distance: passed }, pending: { distance: 0 },
});

describe("syncRunStatus", () => {
  it("applies Run on a single run-distance move — the first move of the turn", async () => {
    const token = makeToken();
    await syncRunStatus(token, moved({ history: 0, passed: 18 }), ME);
    expect(token.actor.statuses.has("run")).toBe(true);
  });

  it("applies Run when the second leg takes the turn's total into the run band", async () => {
    const token = makeToken();
    await syncRunStatus(token, moved({ history: 8, passed: 4 }), ME);     // 12 m: past Charge (9)
    expect(token.actor.statuses.has("run")).toBe(true);
  });

  it("does not apply Run for a move within the Charge distance", async () => {
    const token = makeToken();
    await syncRunStatus(token, moved({ history: 0, passed: 9 }), ME);
    expect(token.actor.statuses.has("run")).toBe(false);
  });

  it("keeps Run on when the token over-runs its maximum", async () => {
    const token = makeToken({ statuses: ["run"] });
    await syncRunStatus(token, moved({ history: 18, passed: 6 }), ME);
    expect(token.actor.statuses.has("run")).toBe(true);
    expect(token.actor.statusToggles).toEqual([]);   // already on — toggling again would clear it
  });

  it("leaves the condition alone outside a started combat", async () => {
    const token = makeToken({ started: false });
    await syncRunStatus(token, moved({ passed: 18, recorded: false }), ME);
    expect(token.actor.statusToggles).toEqual([]);
  });

  it("ignores another user's move, so only the mover's client writes", async () => {
    const token = makeToken();
    await syncRunStatus(token, moved({ passed: 18 }), { id: "someone-else" });
    expect(token.actor.statusToggles).toEqual([]);
  });

  it("does nothing for a token with no movement rates (a vehicle)", async () => {
    const token = makeToken();
    delete token.actor.system.movement;
    await syncRunStatus(token, moved({ passed: 18 }), ME);
    expect(token.actor.statusToggles).toEqual([]);
  });
});
