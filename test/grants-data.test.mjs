import { describe, it, expect } from "vitest";
import { grantHostType, isGrantHostActive, canGrant, grantDiff, grantPlan } from "../scripts/helpers/grants-data.mjs";

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
