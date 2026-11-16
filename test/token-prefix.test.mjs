import { describe, it, expect } from "vitest";
import { PREFIXES, extractPrefix, pickPrefix, stripKnownPrefix, applyTokenPrefix } from "../scripts/helpers/token-prefix.mjs";

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

// The prefix list is made of ordinary adjectives, and plenty of NPCs are NAMED with one:
// "Renegade Psyker", "Feral Hound". Stripping any leading word that happens to be on the list
// turned a dropped "Renegade Psyker" into "Vile Psyker". A leading word is only a prefix THIS
// feature added if what follows it is a name the actor actually has.
describe("stripKnownPrefix — only a prefix this feature added", () => {
  it("keeps a first word that is part of the actor's own name", () => {
    expect(stripKnownPrefix("Renegade Psyker", PREFIXES, ["Renegade Psyker"])).toBe("Renegade Psyker");
    expect(stripKnownPrefix("Feral Hound", PREFIXES, ["Feral Hound"])).toBe("Feral Hound");
  });
  it("still strips a prefix sitting in front of the actor's name", () => {
    expect(stripKnownPrefix("Filthy Heretic", PREFIXES, ["Heretic"])).toBe("Heretic");
    expect(stripKnownPrefix("Vile Renegade Psyker", PREFIXES, ["Renegade Psyker"])).toBe("Renegade Psyker");
  });
  it("recognises the prototype token's name as well as the actor's", () => {
    expect(stripKnownPrefix("Renegade Psyker", PREFIXES, ["Psyker Cabal", "Renegade Psyker"])).toBe("Renegade Psyker");
  });
  // Everything that is NOT the actor's own first word is still stripped, exactly as before — the
  // name on a placed token is rarely the bare actor name by the time it is copied.
  it("still strips when the token carries an appended number", () => {
    expect(stripKnownPrefix("Filthy Heretic (2)", PREFIXES, ["Heretic"])).toBe("Heretic (2)");
    expect(stripKnownPrefix("Renegade Psyker (2)", PREFIXES, ["Renegade Psyker"])).toBe("Renegade Psyker (2)");
  });
  it("still strips when the token or the actor has been renamed since", () => {
    expect(stripKnownPrefix("Filthy Heretic Sergeant", PREFIXES, ["Heretic"])).toBe("Heretic Sergeant");
    expect(stripKnownPrefix("Filthy Heretic", PREFIXES, ["Cultist"])).toBe("Heretic");
  });
});

describe("applyTokenPrefix", () => {
  /** An unlinked NPC token about to be created, recording the name it ends up with. */
  function dropping(tokenName, actorName = tokenName, { prototypeName = actorName } = {}) {
    globalThis.game = { settings: { get: () => true } };
    const token = {
      name: tokenName, actorLink: false, actorId: "a1",
      actor: { type: "npc", name: actorName, prototypeToken: { name: prototypeName } },
      parent: { id: "scene", tokens: [] },
      updateSource(data) { Object.assign(this, data); },
    };
    return token;
  }
  const prefixOf = (name, base) => extractPrefix(name, base);

  it("prefixes an NPC whose own name starts with a listed word, without eating that word", () => {
    const token = dropping("Renegade Psyker");
    applyTokenPrefix(token);
    expect(PREFIXES).toContain(prefixOf(token.name, "Renegade Psyker"));
  });

  it("re-prefixes a copy-pasted token instead of stacking a second prefix", () => {
    const token = dropping("Filthy Heretic", "Heretic");
    applyTokenPrefix(token);
    expect(PREFIXES).toContain(prefixOf(token.name, "Heretic"));
  });

  // Keeping the actor's own first word means the picker could now roll that same word.
  it("never picks the word the actor's name already starts with", () => {
    const realRandom = Math.random;
    try {
      for (let i = 0; i < PREFIXES.length; i++) {
        Math.random = () => (i + 0.5) / PREFIXES.length;      // walk the picker across the whole list
        const token = dropping("Hunted Man");
        applyTokenPrefix(token);
        expect(token.name).not.toBe("Hunted Hunted Man");
      }
    } finally { Math.random = realRandom; }
  });

  it("leaves a token alone when its creation is an UNDO — it comes back with the name it had", () => {
    const token = dropping("Filthy Heretic", "Heretic");
    applyTokenPrefix(token, { isUndo: true });
    expect(token.name).toBe("Filthy Heretic");
  });
});
