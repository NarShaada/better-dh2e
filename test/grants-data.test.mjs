import { describe, it, expect } from "vitest";
import { grantHostType, isGrantHostActive, canGrant, grantDiff, grantPlan, purgeSourcePlan } from "../scripts/helpers/grants-data.mjs";

describe("trait as a grant host", () => {
  it("grantHostType recognises traits", () => {
    expect(grantHostType({ type: "trait" })).toBe("trait");
    expect(grantHostType({ type: "cybernetic" })).toBe("cybernetic");
    expect(grantHostType({ type: "talent" })).toBe(null);
  });
  it("a trait host is always active (inherent)", () => {
    expect(isGrantHostActive({ type: "trait", system: {} })).toBe(true);
    expect(isGrantHostActive({ type: "cybernetic", system: { installed: false } })).toBe(false);
  });
  it("a trait can grant anything but another trait", () => {
    expect(canGrant("trait", "talent")).toBe(true);
    expect(canGrant("trait", "cybernetic")).toBe(true);
    expect(canGrant("trait", "trait")).toBe(false);
  });
});

describe("grantPlan", () => {
  it("partitions into create / update / remove keyed by uuid", () => {
    const existing = [{ id: "a", uuid: "U1" }, { id: "b", uuid: "U2" }];
    const r = grantPlan(["U2", "U3"], existing);
    expect(r.toCreateUuids).toEqual(["U3"]);
    expect(r.toUpdateUuidToId).toEqual({ U2: "b" });
    expect(r.toRemoveIds).toEqual(["a"]);
  });
  it("inactive host (empty desired) removes all, creates/updates none", () => {
    expect(grantPlan([], [{ id: "a", uuid: "U1" }])).toEqual({ toCreateUuids: [], toUpdateUuidToId: {}, toRemoveIds: ["a"] });
  });
  it("handles nullish input", () => {
    expect(grantPlan(undefined, undefined)).toEqual({ toCreateUuids: [], toUpdateUuidToId: {}, toRemoveIds: [] });
  });
});

describe("purgeSourcePlan", () => {
  // A world source "S1" was deleted. HostA granted a copy of it (orphan) and lists it in grants;
  // HostB lists S1 alongside a surviving grant S2; an unrelated granted copy of S2 must be left alone.
  const items = [
    { id: "hostA", isHost: true, grants: [{ uuid: "S1" }] },
    { id: "copyA", grantedUuid: "S1" },
    { id: "hostB", isHost: true, grants: [{ uuid: "S1" }, { uuid: "S2" }] },
    { id: "copyS2", grantedUuid: "S2" },
  ];
  it("deletes orphaned copies of the dead source and drops the dead uuid from every host", () => {
    const r = purgeSourcePlan(items, "S1");
    expect(r.orphanIds).toEqual(["copyA"]);
    expect(r.hostGrantUpdates).toEqual([
      { id: "hostA", grants: [] },
      { id: "hostB", grants: [{ uuid: "S2" }] },
    ]);
  });
  it("leaves surviving grants and their copies untouched", () => {
    const r = purgeSourcePlan(items, "S2");
    expect(r.orphanIds).toEqual(["copyS2"]);
    expect(r.hostGrantUpdates).toEqual([{ id: "hostB", grants: [{ uuid: "S1" }] }]);
  });
  it("never treats a granted copy as a host, even if it carries a grants array", () => {
    const copyHost = [{ id: "c", grantedUuid: "S1", isHost: false, grants: [{ uuid: "S1" }] }];
    expect(purgeSourcePlan(copyHost, "S1")).toEqual({ orphanIds: ["c"], hostGrantUpdates: [] });
  });
  it("no match / nullish input yields empty plan", () => {
    expect(purgeSourcePlan(items, "S9")).toEqual({ orphanIds: [], hostGrantUpdates: [] });
    expect(purgeSourcePlan(undefined, "S1")).toEqual({ orphanIds: [], hostGrantUpdates: [] });
  });
});

describe("grantHostType", () => {
  it("identifies cybernetic and armour hosts, null otherwise", () => {
    expect(grantHostType({ type: "cybernetic" })).toBe("cybernetic");
    expect(grantHostType({ type: "armour" })).toBe("armour");
    expect(grantHostType({ type: "gear" })).toBe(null);
    expect(grantHostType(undefined)).toBe(null);
  });
});

describe("isGrantHostActive", () => {
  it("cybernetic active when installed; armour active when equipped", () => {
    expect(isGrantHostActive({ type: "cybernetic", system: { installed: true } })).toBe(true);
    expect(isGrantHostActive({ type: "cybernetic", system: { installed: false } })).toBe(false);
    expect(isGrantHostActive({ type: "armour", system: { equipped: true } })).toBe(true);
    expect(isGrantHostActive({ type: "armour", system: { equipped: false } })).toBe(false);
    expect(isGrantHostActive({ type: "gear", system: {} })).toBe(false);
  });
});

describe("canGrant", () => {
  it("cybernetic grants anything except cybernetic", () => {
    expect(canGrant("cybernetic", "armour")).toBe(true);
    expect(canGrant("cybernetic", "gear")).toBe(true);
    expect(canGrant("cybernetic", "cybernetic")).toBe(false);
  });
  it("armour grants anything except armour and cybernetic", () => {
    expect(canGrant("armour", "gear")).toBe(true);
    expect(canGrant("armour", "weapon")).toBe(true);
    expect(canGrant("armour", "armour")).toBe(false);
    expect(canGrant("armour", "cybernetic")).toBe(false);
  });
  it("non-hosts grant nothing", () => {
    expect(canGrant("gear", "weapon")).toBe(false);
  });
});

describe("grantDiff", () => {
  it("creates desired-not-present, removes present-not-desired, leaves matches", () => {
    const existing = [{ id: "a", uuid: "U1" }, { id: "b", uuid: "U2" }];
    const r = grantDiff(["U2", "U3"], existing);
    expect(r.toCreateUuids).toEqual(["U3"]);
    expect(r.toRemoveIds).toEqual(["a"]);
  });
  it("empty desired removes everything", () => {
    expect(grantDiff([], [{ id: "a", uuid: "U1" }])).toEqual({ toCreateUuids: [], toRemoveIds: ["a"] });
  });
  it("handles nullish input", () => {
    expect(grantDiff(undefined, undefined)).toEqual({ toCreateUuids: [], toRemoveIds: [] });
  });
});
