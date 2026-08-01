// test/sustain-data.test.mjs
import { describe, it, expect } from "vitest";
import { BDH } from "../scripts/config.mjs";
import { SUSTAIN_RANK, normalizeSustain, longestSustainAction } from "../scripts/helpers/sustain-data.mjs";

describe("BDH.sustainActions", () => {
  it("registers exactly no/free/half/full", () => {
    expect(Object.keys(BDH.sustainActions)).toEqual(["no", "free", "half", "full"]);
  });

  it("omits reaction — the book never prints a Reaction sustain cost", () => {
    expect(BDH.sustainActions.reaction).toBeUndefined();
    expect(BDH.psychicActions.reaction).toBe("Reaction");   // still present for the CAST action
  });

  it("labels read as full action names for the turn-start reminder", () => {
    expect(BDH.sustainActions.half).toBe("Half Action");
  });

  it("ranks every registered key", () => {
    expect(Object.keys(SUSTAIN_RANK).sort()).toEqual(Object.keys(BDH.sustainActions).sort());
  });
});

describe("normalizeSustain", () => {
  it("maps the legacy boolean true to half", () => {
    expect(normalizeSustain(true)).toBe("half");
  });

  it("maps the legacy boolean false to no", () => {
    expect(normalizeSustain(false)).toBe("no");
  });

  it("passes a valid key through", () => {
    expect(normalizeSustain("full")).toBe("full");
    expect(normalizeSustain("no")).toBe("no");
  });

  it("coerces absent and unrecognised values to no rather than throwing", () => {
    expect(normalizeSustain(undefined)).toBe("no");
    expect(normalizeSustain(null)).toBe("no");
    expect(normalizeSustain("reaction")).toBe("no");
    expect(normalizeSustain(7)).toBe("no");
  });
});

describe("longestSustainAction", () => {
  it("returns no for an empty set", () => {
    expect(longestSustainAction([])).toBe("no");
    expect(longestSustainAction(undefined)).toBe("no");
  });

  it("returns the only entry's cost", () => {
    expect(longestSustainAction([{ sustainAction: "half" }])).toBe("half");
  });

  it("returns the costliest across a mixed set", () => {
    expect(longestSustainAction([
      { sustainAction: "free" }, { sustainAction: "full" }, { sustainAction: "half" }
    ])).toBe("full");
  });

  it("normalizes legacy entries while comparing", () => {
    expect(longestSustainAction([{ sustainAction: true }, { sustainAction: "free" }])).toBe("half");
  });
});
