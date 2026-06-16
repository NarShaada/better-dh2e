import { describe, it, expect } from "vitest";
import { PREFIXES, extractPrefix, pickPrefix, stripKnownPrefix } from "../scripts/helpers/token-prefix.mjs";

describe("PREFIXES", () => {
  it("has at least 100 unique single-word non-empty prefixes", () => {
    expect(PREFIXES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(PREFIXES).size).toBe(PREFIXES.length);
    for (const p of PREFIXES) { expect(p).toBeTruthy(); expect(p.includes(" ")).toBe(false); }
  });
});

describe("extractPrefix", () => {
  it("returns the leading prefix when name is '<prefix> <base>'", () => {
    expect(extractPrefix("Filthy Heretic", "Heretic")).toBe("Filthy");
  });
  it("returns '' for the bare base name", () => {
    expect(extractPrefix("Heretic", "Heretic")).toBe("");
  });
  it("returns '' when the name does not end with ' ' + base", () => {
    expect(extractPrefix("Lowly Cultist", "Heretic")).toBe("");
    expect(extractPrefix("MegaHeretic", "Heretic")).toBe("");
  });
  it("handles empty inputs", () => {
    expect(extractPrefix("", "Heretic")).toBe("");
    expect(extractPrefix("Heretic", "")).toBe("");
  });
});

describe("pickPrefix", () => {
  it("never returns a used prefix while some remain", () => {
    const used = new Set(PREFIXES.slice(0, PREFIXES.length - 1)); // all but the last
    expect(pickPrefix(PREFIXES, used)).toBe(PREFIXES[PREFIXES.length - 1]);
  });
  it("uses the injected rng to choose from the available pool", () => {
    const list = ["A", "B", "C"];
    expect(pickPrefix(list, new Set(["A"]), () => 0)).toBe("B"); // pool [B,C], index 0
  });
  it("falls back to any entry when all are used", () => {
    const list = ["A", "B"];
    expect(list).toContain(pickPrefix(list, new Set(["A", "B"]), () => 0));
  });
});

describe("stripKnownPrefix", () => {
  it("removes a known leading prefix", () => {
    expect(stripKnownPrefix("Filthy Heretic", PREFIXES)).toBe("Heretic");
  });
  it("leaves a bare name or an unknown leading word", () => {
    expect(stripKnownPrefix("Heretic", PREFIXES)).toBe("Heretic");
    expect(stripKnownPrefix("Big Heretic", PREFIXES)).toBe("Big Heretic");
  });
});
