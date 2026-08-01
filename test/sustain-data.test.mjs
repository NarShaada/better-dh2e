// test/sustain-data.test.mjs
import { describe, it, expect } from "vitest";
import { BDH } from "../scripts/config.mjs";
import {
  SUSTAIN_RANK, normalizeSustain, longestSustainAction,
  currentPR, phenomenaSustainBonus, resolveSustained, reminderLines
} from "../scripts/helpers/sustain-data.mjs";

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

/** Entry factory — keeps the cascade cases readable. */
const e = (name, castEffPR, sustainAction = "half") => ({ powerId: name, name, castEffPR, sustainAction });

describe("currentPR", () => {
  it("applies no penalty when nothing is sustained", () => {
    expect(currentPR(4, 0)).toBe(4);
  });

  it("applies no penalty to a single sustained power — the p. 195 body text, not Table 6-1", () => {
    expect(currentPR(4, 1)).toBe(4);
  });

  it("subtracts the full count once two or more are sustained", () => {
    expect(currentPR(4, 2)).toBe(2);
    expect(currentPR(4, 3)).toBe(1);
  });

  it("can go to zero or below — resolveSustained, not this function, decides what that means", () => {
    expect(currentPR(2, 3)).toBe(-1);
  });
});

describe("phenomenaSustainBonus", () => {
  it("is zero when sustaining nothing or one power", () => {
    expect(phenomenaSustainBonus(0)).toBe(0);
    expect(phenomenaSustainBonus(1)).toBe(0);
  });

  it("is +10 per power beyond the first", () => {
    expect(phenomenaSustainBonus(2)).toBe(10);
    expect(phenomenaSustainBonus(3)).toBe(20);
  });
});

describe("resolveSustained", () => {
  it("returns an empty set unchanged", () => {
    expect(resolveSustained([])).toEqual({ survivors: [], dropped: [] });
    expect(resolveSustained(undefined)).toEqual({ survivors: [], dropped: [] });
  });

  it("never drops a single power, however low its PR", () => {
    const { survivors, dropped } = resolveSustained([e("Fiery Form", 1)]);
    expect(survivors.map((s) => s.name)).toEqual(["Fiery Form"]);
    expect(dropped).toEqual([]);
  });

  it("keeps two powers that survive the penalty", () => {
    const { survivors, dropped } = resolveSustained([e("A", 5), e("B", 4)]);
    expect(survivors.map((s) => s.name)).toEqual(["A", "B"]);
    expect(dropped).toEqual([]);
  });

  it("drops only the weakest of 5/4/3 and lets the survivors climb back", () => {
    const { survivors, dropped } = resolveSustained([e("A", 5), e("B", 4), e("C", 3)]);
    expect(dropped.map((d) => d.name)).toEqual(["C"]);
    expect(survivors.map((s) => currentPR(s.castEffPR, survivors.length))).toEqual([3, 2]);
  });

  it("collapses three powers cast at PR 2 to exactly one survivor at full PR", () => {
    const { survivors, dropped } = resolveSustained([e("A", 2), e("B", 2), e("C", 2)]);
    expect(survivors.map((s) => s.name)).toEqual(["A"]);
    expect(dropped.map((d) => d.name)).toEqual(["C", "B"]);   // in removal order (weakest first) — here every
                                                              // entry ties, so the tie-break makes it newest-first
    expect(currentPR(survivors[0].castEffPR, survivors.length)).toBe(2);
  });

  it("breaks ties toward the newest entry", () => {
    const { dropped } = resolveSustained([e("Old", 2), e("New", 2)]);
    expect(dropped.map((d) => d.name)).toEqual(["New"]);
  });

  it("does not mutate the array it was given", () => {
    const input = [e("A", 2), e("B", 2), e("C", 2)];
    resolveSustained(input);
    expect(input).toHaveLength(3);
  });
});

describe("reminderLines", () => {
  it("says nothing when nothing is sustained", () => {
    expect(reminderLines("Kaelen", [])).toEqual([]);
  });

  it("names the action and the power, with no phenomena line at one power", () => {
    expect(reminderLines("Kaelen", [e("Fiery Form", 4, "half")])).toEqual([
      "Kaelen must spend a Half Action to sustain 1 power: Fiery Form."
    ]);
  });

  it("uses the costliest action and adds the phenomena line at two or more", () => {
    expect(reminderLines("Kaelen", [e("Fiery Form", 4, "half"), e("Weapon Jinx", 4, "full")])).toEqual([
      "Kaelen must spend a Full Action to sustain 2 powers: Fiery Form, Weapon Jinx.",
      "+10 to Psychic Phenomena while sustained."
    ]);
  });
});
