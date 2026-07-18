import { describe, it, expect } from "vitest";
import { makePsychicRuleset } from "../scripts/helpers/psychic-ruleset.mjs";

describe("makePsychicRuleset('bc')", () => {
  const rs = makePsychicRuleset("bc");
  it("castOptions: PR 3 bound → Fettered 2, Unfettered 3 (selected), Push 4..6", () => {
    const o = rs.castOptions(3, "bound");
    expect(o.map((x) => [x.state, x.statePR])).toEqual([
      ["fettered", 2], ["normal", 3], ["pushed", 4], ["pushed", 5], ["pushed", 6],
    ]);
    expect(o.find((x) => x.state === "normal").selected).toBe(true);
  });
  it("castOptions: daemonic has no Fettered and pushes to +4", () => {
    const o = rs.castOptions(3, "daemonic");
    expect(o.some((x) => x.state === "fettered")).toBe(false);
    expect(o[o.length - 1].statePR).toBe(7);
  });
  it("castOptions: PR 1 keeps Fettered AND Unfettered as distinct states at PR 1", () => {
    const o = rs.castOptions(1, "bound");
    expect(o[0]).toMatchObject({ state: "fettered", statePR: 1 });
    expect(o[1]).toMatchObject({ state: "normal", statePR: 1 });
  });
  it("focusModifier: flat +5 × effective PR", () => {
    expect(rs.focusModifier("fettered", 2, 3, 4)).toBe(20);
    expect(rs.focusModifier("pushed", 5, 3, 5)).toBe(25);
  });
  it("delegates BC trigger/modifier/maxPush", () => {
    expect(rs.phenomenaTriggers("bound", "fettered", true)).toBe(false);
    expect(rs.phenomenaModifier("daemonic", "pushed", 4)).toBe(40);
    expect(rs.maxPush("unbound")).toBe(5);
  });
});

describe("makePsychicRuleset('dh2')", () => {
  const rs = makePsychicRuleset("dh2");
  it("castOptions: PR 3 bound → rungs 1..5, states fettered/fettered/normal/pushed/pushed, normal selected", () => {
    const o = rs.castOptions(3, "bound");
    expect(o.map((x) => [x.state, x.statePR])).toEqual([
      ["fettered", 1], ["fettered", 2], ["normal", 3], ["pushed", 4], ["pushed", 5],
    ]);
    expect(o.find((x) => x.state === "normal").selected).toBe(true);
  });
  it("focusModifier: +10/pt fettered, −10/pt pushed, 0 normal (bonus-independent)", () => {
    expect(rs.focusModifier("fettered", 1, 3, 3)).toBe(20);
    expect(rs.focusModifier("normal", 3, 3, 5)).toBe(0);
    expect(rs.focusModifier("pushed", 5, 3, 5)).toBe(-20);
  });
  it("delegates DH2 trigger/modifier/maxPush", () => {
    expect(rs.phenomenaTriggers("bound", "pushed", true)).toBe(false);
    expect(rs.phenomenaModifier("daemonic", "pushed", 3)).toBe(30);
    expect(rs.maxPush("unbound")).toBe(4);
  });
});
