// test/affliction-data.test.mjs
import { describe, it, expect } from "vitest";
import { corruptionTrack, insanityTrack, nextTestAt } from "../scripts/helpers/affliction-data.mjs";

describe("corruptionTrack", () => {
  it("maps value to tier + penalty", () => {
    expect(corruptionTrack(0)).toEqual({ tier: "Tainted", penalty: 0 });
    expect(corruptionTrack(30)).toEqual({ tier: "Tainted", penalty: 0 });
    expect(corruptionTrack(31)).toEqual({ tier: "Soiled", penalty: -10 });
    expect(corruptionTrack(61)).toEqual({ tier: "Debased", penalty: -20 });
    expect(corruptionTrack(91)).toEqual({ tier: "Profane", penalty: -30 });
  });
});

describe("insanityTrack", () => {
  it("maps value to tier + modifier", () => {
    expect(insanityTrack(5)).toEqual({ tier: "Stable", penalty: 0 });
    expect(insanityTrack(20)).toEqual({ tier: "Unsettled", penalty: 10 });
    expect(insanityTrack(50)).toEqual({ tier: "Disturbed", penalty: 0 });
    expect(insanityTrack(70)).toEqual({ tier: "Unhinged", penalty: -10 });
    expect(insanityTrack(90)).toEqual({ tier: "Deranged", penalty: -20 });
    expect(insanityTrack(100)).toEqual({ tier: "Terminally Insane", penalty: -30 });
  });
});

describe("nextTestAt", () => {
  it("is the next multiple of 10", () => {
    expect(nextTestAt(0)).toBe(10);
    expect(nextTestAt(12)).toBe(20);
    expect(nextTestAt(20)).toBe(30);
  });
});
