import { describe, it, expect } from "vitest";
import { coverDegradationPlan } from "../scripts/helpers/cover.mjs";

const plan = (pieceAp, confirmedAp, hits) => coverDegradationPlan({ pieceAp, confirmedAp, hits });

describe("coverDegradationPlan", () => {
  it("steps the applied AP down per hit when the prefill is untouched", () => {
    // The worked example from the spec: an AP-5 crate, three rounds of 12.
    const r = plan(5, 5, [12, 12, 12]);
    expect(r.applied).toEqual([5, 4, 3]);
    expect(r.finalAp).toBe(2);
    expect(r.degraded).toBe(3);
    expect(r.destroyed).toBe(false);
  });

  it("keeps a negative override in lockstep with the piece", () => {
    // GM types 3 against the AP-5 crate: the target soaks 3/2/1, the crate still goes 5->4->3.
    const r = plan(5, 3, [12, 12, 12]);
    expect(r.applied).toEqual([3, 2, 1]);
    expect(r.finalAp).toBe(2);
  });

  it("keeps a positive override applying after the piece is destroyed", () => {
    // A +3 talent on an AP-2 crate. The crate dies on hit 2; the talent still helps on hit 3.
    const r = plan(2, 5, [12, 12, 12]);
    expect(r.applied).toEqual([5, 4, 3]);
    expect(r.finalAp).toBe(0);
    expect(r.destroyed).toBe(true);
    expect(r.degraded).toBe(2);
  });

  it("degrades nothing when the confirmed cover is 0", () => {
    const r = plan(5, 0, [12, 12, 12]);
    expect(r.applied).toEqual([0, 0, 0]);
    expect(r.finalAp).toBe(5);
    expect(r.degraded).toBe(0);
  });

  it("degrades nothing when no hit beats the piece's AP", () => {
    const r = plan(5, 5, [4, 5, 1]);
    expect(r.applied).toEqual([5, 5, 5]);
    expect(r.finalAp).toBe(5);
  });

  it("uses a strictly-greater threshold", () => {
    expect(plan(5, 5, [5]).degraded).toBe(0);
    expect(plan(5, 5, [6]).degraded).toBe(1);
  });

  it("destroys a piece whose last point of AP is beaten", () => {
    const r = plan(1, 1, [2]);
    expect(r.applied).toEqual([1]);
    expect(r.finalAp).toBe(0);
    expect(r.destroyed).toBe(true);
  });

  it("stops degrading once destroyed, and later hits get no cover", () => {
    const r = plan(1, 1, [12, 12, 12]);
    expect(r.applied).toEqual([1, 0, 0]);
    expect(r.degraded).toBe(1);
    expect(r.destroyed).toBe(true);
  });

  it("never drives an AP-0 piece negative, even with a positive override", () => {
    // A piece painted at AP 0 offers nothing and cannot be destroyed by degradation.
    const r = plan(0, 3, [12, 12]);
    expect(r.applied).toEqual([3, 3]);
    expect(r.finalAp).toBe(0);
    expect(r.degraded).toBe(0);
    expect(r.destroyed).toBe(false);
  });

  it("handles an empty or missing hit list", () => {
    expect(plan(5, 5, [])).toEqual({ applied: [], finalAp: 5, destroyed: false, degraded: 0 });
    expect(coverDegradationPlan({ pieceAp: 5, confirmedAp: 5 }).applied).toEqual([]);
  });

  it("coerces junk inputs rather than producing NaN", () => {
    const r = plan(undefined, undefined, [null, "12"]);
    expect(r.applied).toEqual([0, 0]);
    expect(r.finalAp).toBe(0);
  });
});
