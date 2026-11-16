// test/attack-card-gating.test.mjs
//
// Who may press the quality chips on a damage card. A chip that WRITES to the target (a condition,
// Fatigue, wounds, characteristic damage) is only usable by someone who owns that target; anyone
// else's click would post the target's test and then fail on the permission-gated write.
//
// Two defects from the 2026-11 audit:
//   - Flame and Snare were missing from the gate, so a player could click them on a GM-owned
//     target: the Agility test was posted as the NPC and the On Fire / Helpless write was refused.
//   - On an UNTARGETED attack there is no bound target to own, and the gate read that as "nobody
//     owns it": Shocking, Concussive and Rad-Phage were stripped for every user, the GM included,
//     although the handlers can resolve the defender from the user's selected token.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import {
  installFoundryStub, resetCaptures, registerUuid, primeDice, capturedMessages, makeActor, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";
const WRITING = ["applyDamage", "shockTest", "concussiveTest", "flameTest", "snareTest", "radPhageTest"];
const READ_ONLY = ["hallucinogenicTest", "toxicTest"];

let bindCardButtons, warnings;
beforeAll(async () => {
  installFoundryStub({ settings: { enableBattlemap: true } });
  ({ bindCardButtons } = await import("../scripts/rolls/attack.mjs"));
});
beforeEach(() => {
  resetCaptures();
  warnings = [];
  ui.notifications.warn = (m) => warnings.push(String(m));
});
afterEach(() => {
  canvas.tokens.controlled = [];
  game.user.character = null;
  game.user.isGM = true;
});

function bind(flags) {
  const html = makeCardHtml({ buttons: [...WRITING, ...READ_ONLY] });
  bindCardButtons({ flags: { [NS]: { type: "damage", qualities: [], ...flags } } }, html);
  return html;
}
const shown = (html) => [...WRITING, ...READ_ONLY].filter((b) => html.querySelector(`[data-bdh="${b}"]`) !== null);

describe("a card with a bound target", () => {
  it("takes every chip that writes to the target away from a user who does not own it — Flame and Snare included", () => {
    const npc = makeActor({ name: "Cultist", isOwner: false });
    registerUuid(npc.uuid, npc);

    expect(shown(bind({ targetUuid: npc.uuid }))).toEqual(READ_ONLY);
  });

  it("leaves them all for an owner of the target", () => {
    const pc = makeActor({ name: "Acolyte", isOwner: true });
    registerUuid(pc.uuid, pc);

    expect(shown(bind({ targetUuid: pc.uuid }))).toEqual([...WRITING, ...READ_ONLY]);
  });
});

// A card remembers its target by uuid; the actor behind it can be deleted afterwards. Such a card
// has nobody to own, exactly like an untargeted one, and its chips must fall back to the user's
// selection the same way. (Found by diffing old against new behaviour: adding Flame and Snare to
// the owner gate also took them from the GM on these cards, where they used to work.)
describe("a card whose bound target no longer exists", () => {
  const GONE = "Actor.deleted-long-ago";
  const QUALITY_CHIPS = ["shockTest", "concussiveTest", "flameTest", "snareTest", "radPhageTest"];

  it("keeps its quality chips, like an untargeted card", () => {
    const visible = shown(bind({ targetUuid: GONE }));
    expect(visible).toEqual(expect.arrayContaining(QUALITY_CHIPS));
  });

  it("resolves a quality chip against the token the user has selected", async () => {
    const selected = makeActor({ name: "Selected", system: { injuries: [] } });
    canvas.tokens.controlled = [{ actor: selected }];
    const html = bind({ targetUuid: GONE });
    primeDice([95, 6, 4]);

    await html.click("radPhageTest");

    expect(selected.system.injuries).toMatchObject([{ type: "charDamage", amount: 10 }]);
  });

  // Buttons that exist FOR one particular actor must not start acting on whoever is selected
  // instead. They were hidden on such a card before, and still are.
  it("still hides Apply Damage — that damage was rolled against the actor that is gone", () => {
    expect(shown(bind({ targetUuid: GONE }))).not.toContain("applyDamage");
  });

  it("still hides the On Fire and Toxic buttons of a card posted for the actor that is gone", () => {
    const html = makeCardHtml({ buttons: ["onFireApply", "onFireWP", "toxicResist"] });
    bindCardButtons({ flags: { [NS]: { kind: "onFire", damage: 6, targetUuid: GONE } } }, html);
    expect(html.querySelector('[data-bdh="onFireApply"]')).toBeNull();
    expect(html.querySelector('[data-bdh="toxicResist"]')).toBeNull();
  });
});

describe("a card with no bound target", () => {
  it("keeps the quality chips, for the GM and for players alike", () => {
    const chips = [...WRITING.filter((b) => b !== "applyDamage"), ...READ_ONLY];
    expect(shown(bind({ targetUuid: null }))).toEqual(chips);
    game.user.isGM = false;
    expect(shown(bind({ targetUuid: null }))).toEqual(chips);
  });

  it("resolves a writing chip against the token the user has selected", async () => {
    const selected = makeActor({ name: "Selected", system: { injuries: [] } });
    canvas.tokens.controlled = [{ actor: selected }];
    const html = bind({ targetUuid: null });
    primeDice([95, 6, 4]);                    // fails the Toughness test, then 2d10 = 10

    await html.click("radPhageTest");

    expect(selected.system.injuries).toMatchObject([{ type: "charDamage", characteristic: "toughness", amount: 10 }]);
  });

  it("refuses a writing chip on a selected token the user does not own, before anything is rolled", async () => {
    const notMine = makeActor({ name: "Cultist", isOwner: false, system: { injuries: [] } });
    canvas.tokens.controlled = [{ actor: notMine }];
    game.user.isGM = false;
    const html = bind({ targetUuid: null });
    primeDice([95, 6, 4]);

    await html.click("radPhageTest");

    expect(capturedMessages()).toEqual([]);
    expect(notMine.system.injuries).toEqual([]);
    expect(warnings).toHaveLength(1);
  });

  it("asks for a selection when nothing is selected", async () => {
    const html = bind({ targetUuid: null });

    await html.click("flameTest");

    expect(capturedMessages()).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
