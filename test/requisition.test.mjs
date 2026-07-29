// test/requisition.test.mjs
// requisition.mjs destructures foundry.applications.handlebars at MODULE SCOPE, so the stub must be
// installed before the dynamic import — same constraint as test/attack-effective-weapon.test.mjs.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedRolls, capturedMessages,
  primeDice, primeDialog, registerUuid, makeActor, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let collectRequisitionSources, rollRequisition, resolveRequisition, bindRequisitionButtons;
let canReroll, rerollFromFate, canAddDoS, addDoSFromFate;

// Two packs carry a "Bolt Pistol" on purpose: buildSourceIndex disambiguates a shared name by
// appending its source, and the dialog's picker is keyed on that DISAMBIGUATED label. Without a
// collision in the fixture nothing would prove the label survives the round trip back to a uuid.
const PACKS = [
  {
    label: "DH2e Weapons",
    entries: [
      { _id: "w1", name: "Bolt Pistol", type: "weapon", system: { availability: "veryRare" } },
      { _id: "t1", name: "Ambidextrous", type: "talent", system: {} }
    ]
  },
  {
    label: "Homebrew",
    entries: [{ _id: "w2", name: "Bolt Pistol", type: "weapon", system: { availability: "rare" } }]
  }
];
const WORLD = [{ id: "i1", name: "Medikit", type: "gear", uuid: "Item.i1", system: { availability: "scarce" } }];

beforeAll(async () => {
  installFoundryStub({ items: WORLD, packs: PACKS });
  ({ collectRequisitionSources, rollRequisition, resolveRequisition, bindRequisitionButtons } =
    await import("../scripts/rolls/requisition.mjs"));
  ({ canReroll, rerollFromFate, canAddDoS, addDoSFromFate } =
    await import("../scripts/rolls/fate.mjs"));
});
beforeEach(() => resetCaptures());

/** The stub's renderTemplate resolves to JSON.stringify(cardData). */
const lastCard = () => JSON.parse(capturedMessages().at(-1).content);
const lastFlags = () => capturedMessages().at(-1)?.flags?.[NS];

const actor = () => makeActor({
  name: "Acolyte",
  uuid: "Actor.a1",
  system: { characteristics: { influence: { total: 40 } } }
});

describe("collectRequisitionSources", () => {
  it("merges world items and compendium entries, dropping non-acquirable types", async () => {
    const out = await collectRequisitionSources();
    // The talent is gone; the two Bolt Pistols are told apart by their pack.
    expect(out.map((x) => x.label)).toEqual([
      "Bolt Pistol (DH2e Weapons)", "Bolt Pistol (Homebrew)", "Medikit"
    ]);
  });

  it("carries availability through from a pack index", async () => {
    const out = await collectRequisitionSources();
    expect(out.find((x) => x.label === "Bolt Pistol (DH2e Weapons)").availability).toBe("veryRare");
  });

  it("derives a compendium uuid from the pack when the index carries none", async () => {
    const out = await collectRequisitionSources();
    expect(out.find((x) => x.label === "Bolt Pistol (Homebrew)").uuid).toBe("Compendium.Homebrew.w2");
  });
});

describe("resolveRequisition — rolled", () => {
  it("rolls 1d100 and applies availability + craftsmanship + typed modifier", async () => {
    primeDice([35]);
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+10",
      availability: "rare", craftsmanship: "good", itemUuid: null, itemLabel: null
    });
    expect(capturedRolls()).toEqual(["1d100"]);
    // Influence 40, modifier -20 (Rare) + -20 (Good) + 10 (typed) = -30 -> target 10, roll 35 -> fail.
    const card = lastCard();
    expect(card.target).toBe(10);
    expect(card.roll).toBe(35);
    expect(card.success).toBe(false);
    expect(card.automatic).toBe(false);
  });

  it("shows the breakdown parts with signs", async () => {
    primeDice([5]);
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+0",
      availability: "scarce", craftsmanship: "poor", itemUuid: null, itemLabel: null
    });
    expect(lastCard().parts).toEqual([
      { label: "Scarce", value: 10, sign: "−" },
      { label: "Poor", value: 10, sign: "+" }
    ]);
  });

  it("offers Add only on success with a resolvable item", async () => {
    primeDice([5]);
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+0",
      availability: "average", craftsmanship: "normal", itemUuid: "Item.i1", itemLabel: "Medikit"
    });
    expect(lastCard().success).toBe(true);
    expect(lastCard().canAdd).toBe(true);
  });

  it("withholds Add on a failure", async () => {
    primeDice([99]);
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+0",
      availability: "average", craftsmanship: "normal", itemUuid: "Item.i1", itemLabel: "Medikit"
    });
    expect(lastCard().canAdd).toBe(false);
  });

  it("withholds Add when the typed name resolved to nothing", async () => {
    primeDice([5]);
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+0",
      availability: "average", craftsmanship: "normal", itemUuid: null, itemLabel: "Nonsense Gun"
    });
    expect(lastCard().success).toBe(true);
    expect(lastCard().canAdd).toBe(false);
  });

  it("flags Unique as GM discretion — the -60 is a floor, not the whole rule", async () => {
    primeDice([5]);
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+0",
      availability: "unique", craftsmanship: "normal", itemUuid: null, itemLabel: null
    });
    expect(lastCard().gmDiscretion).toBe(true);
  });

  it("stores the whole choice on the reroll flags so a Fate reroll can replay it", async () => {
    primeDice([5]);
    const choice = {
      characteristicKey: "influence", modifier: "+0",
      availability: "rare", craftsmanship: "best", itemUuid: "Item.i1", itemLabel: "Medikit"
    };
    await resolveRequisition(actor(), choice);
    const f = lastFlags();
    expect(f.kind).toBe("requisition");
    expect(f.reroll.kind).toBe("requisition");
    expect(f.reroll.choice).toEqual(choice);
    expect(f.added).toBe(false);
  });
});

describe("resolveRequisition — Ubiquitous", () => {
  it("does not roll and reports automatic success", async () => {
    await resolveRequisition(actor(), {
      characteristicKey: "influence", modifier: "+0",
      availability: "ubiquitous", craftsmanship: "normal", itemUuid: "Item.i1", itemLabel: "Medikit"
    });
    expect(capturedRolls()).toEqual([]);
    expect(lastCard().automatic).toBe(true);
    expect(lastCard().success).toBe(true);
    expect(lastCard().canAdd).toBe(true);
  });
});

// rollRequisition is the dialog half: it turns what the player typed into the `choice` that
// resolveRequisition consumes. The stub's DialogV2 replays whatever primeDialog queued.
describe("rollRequisition — turning the dialog into a choice", () => {
  /** The shape promptTest's ok-callback returns. */
  const answer = (fieldValues) => ({
    modifier: "+0", characteristicKey: "influence", situationalIds: [], fieldValues
  });
  const choiceOf = () => lastFlags().reroll.choice;

  it("resolves a picked label to that item's uuid", async () => {
    primeDialog([answer({ itemLabel: "Medikit", availability: "average", craftsmanship: "normal" })]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(lastFlags().itemUuid).toBe("Item.i1");
    expect(lastFlags().itemLabel).toBe("Medikit");
  });

  it("round-trips a disambiguated duplicate label to the right pack's uuid", async () => {
    // "Bolt Pistol" exists in two packs, so the picker only ever offers the suffixed labels. The
    // lookup map must be keyed the same way buildSourceIndex labelled them, or picking either one
    // would silently fall through to freeform.
    primeDialog([answer({ itemLabel: "Bolt Pistol (Homebrew)", availability: "average", craftsmanship: "normal" })]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(lastFlags().itemUuid).toBe("Compendium.Homebrew.w2");
    expect(lastFlags().itemLabel).toBe("Bolt Pistol (Homebrew)");
  });

  it("picks the OTHER pack's uuid for the other half of the same duplicate name", async () => {
    primeDialog([answer({ itemLabel: "Bolt Pistol (DH2e Weapons)", availability: "average", craftsmanship: "normal" })]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(lastFlags().itemUuid).toBe("Compendium.DH2e Weapons.w1");
  });

  it("keeps an unmatched typed name as a freeform label with no uuid", async () => {
    // The bare "Bolt Pistol" is deliberately NOT a label any more — the duplicate suffixed both.
    primeDialog([answer({ itemLabel: "Bolt Pistol", availability: "average", craftsmanship: "normal" })]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(lastFlags().itemUuid).toBeNull();
    expect(lastFlags().itemLabel).toBe("Bolt Pistol");
    expect(capturedRolls()).toEqual(["1d100"]);   // still a real test, just nothing to add afterwards
  });

  it("treats an empty item field as no item at all", async () => {
    primeDialog([answer({ itemLabel: "", availability: "average", craftsmanship: "normal" })]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(lastFlags().itemLabel).toBeNull();
    expect(lastFlags().itemUuid).toBeNull();
    expect(lastCard().canAdd).toBe(false);
  });

  it("falls back to Average / Normal when the selects yield no value", async () => {
    primeDialog([answer({})]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(choiceOf().availability).toBe("average");
    expect(choiceOf().craftsmanship).toBe("normal");
    expect(lastCard().parts).toEqual([
      { label: "Average", value: 0, sign: "+" },
      { label: "Normal", value: 0, sign: "+" }
    ]);
  });

  it("carries the picked characteristic and typed modifier into the roll", async () => {
    primeDialog([{ modifier: "-10", characteristicKey: "fellowship", situationalIds: [],
                   fieldValues: { itemLabel: "", availability: "average", craftsmanship: "normal" } }]);
    primeDice([5]);
    await rollRequisition(actor());
    expect(choiceOf().characteristicKey).toBe("fellowship");
    // Fellowship is 40 in the fixture; -10 typed, nothing from Average/Normal.
    expect(lastCard().target).toBe(30);
  });

  it("posts nothing when the dialog is dismissed", async () => {
    primeDialog([null]);
    await rollRequisition(actor());
    expect(capturedMessages()).toEqual([]);
    expect(capturedRolls()).toEqual([]);
  });
});

describe("the Add button", () => {
  const cardHtml = () => makeCardHtml({ buttons: ["requisitionAdd"] });
  const button = (html) => html.querySelector('[data-bdh="requisitionAdd"]');
  const message = (over = {}) => ({
    flags: { [NS]: { kind: "requisition", itemUuid: "Item.src", itemLabel: "Bolt Pistol",
                     craftsmanship: "good", added: false,
                     reroll: { kind: "requisition", actorUuid: "Actor.a1" }, ...over } },
    getFlag: function (ns, k) { return this.flags[ns]?.[k]; },
    setFlag: async function (ns, k, v) { this.flags[ns][k] = v; }
  });

  it("stamps the requested craftsmanship onto the created item", async () => {
    const created = [];
    const a = makeActor({ uuid: "Actor.a1", isOwner: true,
      createEmbeddedDocuments: async (_t, docs) => { created.push(...docs); return docs; } });
    registerUuid("Actor.a1", a);
    registerUuid("Item.src", { toObject: () => ({ name: "Bolt Pistol", type: "weapon", system: { craftsmanship: "normal" } }) });

    const html = cardHtml();
    bindRequisitionButtons(message(), html);
    await html.click("requisitionAdd");

    expect(created).toHaveLength(1);
    expect(created[0].system.craftsmanship).toBe("good");
  });

  it("skips the stamp for a type with no craftsmanship field", async () => {
    const created = [];
    const a = makeActor({ uuid: "Actor.a1", isOwner: true,
      createEmbeddedDocuments: async (_t, docs) => { created.push(...docs); return docs; } });
    registerUuid("Actor.a1", a);
    registerUuid("Item.src", { toObject: () => ({ name: "Mono", type: "weaponMod", system: { penMod: 2 } }) });

    const html = cardHtml();
    bindRequisitionButtons(message(), html);
    await html.click("requisitionAdd");

    expect(created[0].system).not.toHaveProperty("craftsmanship");
  });

  it("marks the message added, so a re-render cannot offer the button twice", async () => {
    const a = makeActor({ uuid: "Actor.a1", isOwner: true });
    registerUuid("Actor.a1", a);
    registerUuid("Item.src", { toObject: () => ({ name: "Bolt Pistol", type: "weapon", system: { craftsmanship: "normal" } }) });

    const msg = message();
    const html = cardHtml();
    bindRequisitionButtons(msg, html);
    await html.click("requisitionAdd");

    expect(msg.flags[NS].added).toBe(true);
  });

  it("removes the button for a card that was already used before this render", () => {
    registerUuid("Actor.a1", makeActor({ uuid: "Actor.a1", isOwner: true }));
    const html = cardHtml();
    bindRequisitionButtons(message({ added: true }), html);
    expect(button(html)).toBeNull();
  });

  // The removal above only covers a card that was ALREADY flagged when the button was bound.
  // The live hazard is a second click landing inside the create -> setFlag round trip, while the
  // button is still on screen and the flag still reads false.
  it("creates exactly one item when the button is clicked twice before the first add resolves", async () => {
    const created = [];
    const a = makeActor({ uuid: "Actor.a1", isOwner: true,
      createEmbeddedDocuments: async (_t, docs) => { created.push(...docs); return docs; } });
    registerUuid("Actor.a1", a);
    registerUuid("Item.src", { toObject: () => ({ name: "Bolt Pistol", type: "weapon", system: { craftsmanship: "normal" } }) });

    const msg = message();
    const html = cardHtml();
    bindRequisitionButtons(msg, html);
    // Both clicks are dispatched before either add settles — awaiting them in turn would let the
    // `added` flag land in between and prove nothing about the race.
    await Promise.all([html.click("requisitionAdd"), html.click("requisitionAdd")]);

    expect(created).toHaveLength(1);
    expect(msg.flags[NS].added).toBe(true);
    expect(button(html).disabled).toBe(true);
  });

  it("re-checks the flag at click time, so a stale card cannot add the item a second time", async () => {
    const created = [];
    const a = makeActor({ uuid: "Actor.a1", isOwner: true,
      createEmbeddedDocuments: async (_t, docs) => { created.push(...docs); return docs; } });
    registerUuid("Actor.a1", a);
    registerUuid("Item.src", { toObject: () => ({ name: "Bolt Pistol", type: "weapon", system: { craftsmanship: "normal" } }) });

    const msg = message();
    const html = cardHtml();
    bindRequisitionButtons(msg, html);
    // Someone else's client (or a macro) got there first, after this button was bound.
    msg.flags[NS].added = true;
    await html.click("requisitionAdd");

    expect(created).toEqual([]);
  });

  it("removes the button for a non-owner", () => {
    registerUuid("Actor.a1", makeActor({ uuid: "Actor.a1", isOwner: false }));
    const html = cardHtml();
    bindRequisitionButtons(message(), html);
    expect(button(html)).toBeNull();
  });

  it("ignores a card that is not a requisition", () => {
    const html = cardHtml();
    bindRequisitionButtons({ flags: { [NS]: { kind: "attack" } } }, html);
    expect(button(html)).not.toBeNull();   // untouched, not removed
  });
});

// Fate can act on a requisition card's reroll flags three ways: a straight reroll, and (in theory,
// since the flags carry `success`/`dosBonus` just like any other kind) a +1 DoS spend. Requisition's
// quantity is chosen manually (p.141 leaves sourcing detail to the GM), so a degrees-of-success bonus
// has nothing to attach to — only the reroll path is meaningful here.
describe("Fate integration", () => {
  const requisitionMessage = (over = {}) => ({
    flags: { [NS]: { reroll: { kind: "requisition", actorUuid: "Actor.a1", success: true, dosBonus: 0, ...over } } }
  });

  it("replays the stored choice, so a rerolled card keeps its item and Add button", async () => {
    const a = makeActor({ uuid: "Actor.a1", isOwner: true, system: { fate: { value: 2 }, characteristics: { influence: { total: 40 } } } });
    registerUuid("Actor.a1", a);
    primeDice([5]);
    const choice = { characteristicKey: "influence", modifier: "+0", availability: "average",
                     craftsmanship: "good", itemUuid: "Item.i1", itemLabel: "Medikit" };
    await rerollFromFate({ flags: { [NS]: { reroll: { kind: "requisition", actorUuid: "Actor.a1", choice } } } });
    const card = lastCard();
    expect(card.canAdd).toBe(true);
    expect(lastFlags().reroll.choice).toEqual(choice);
  });

  it("actually spends the Fate point on a requisition reroll — it must not be a silent no-op", async () => {
    const a = makeActor({ uuid: "Actor.a1", isOwner: true, system: { fate: { value: 2 }, characteristics: { influence: { total: 40 } } } });
    registerUuid("Actor.a1", a);
    primeDice([5]);
    const choice = { characteristicKey: "influence", modifier: "+0", availability: "average",
                     craftsmanship: "normal", itemUuid: "Item.i1", itemLabel: "Medikit" };
    await rerollFromFate({ flags: { [NS]: { reroll: { kind: "requisition", actorUuid: "Actor.a1", choice } } } });
    // Before the fix, the function fell through every `if` after decrementing Fate: the point was
    // spent but nothing else happened. Here it must both spend the point AND post a fresh
    // requisition card that replaced/followed the "spends a Fate point" notice.
    expect(a.system.fate.value).toBe(1);
    const messages = capturedMessages();
    expect(messages.length).toBeGreaterThanOrEqual(2);
    expect(messages.at(0).content).toContain("spends a Fate point to reroll");
    expect(lastFlags().kind).toBe("requisition");
    expect(lastCard().canAdd).toBe(true);
  });

  it("still lets the owner reroll a requisition card (canReroll only needs ownership + Fate)", () => {
    const a = makeActor({ uuid: "Actor.a1", isOwner: true, system: { fate: { value: 1 } } });
    registerUuid("Actor.a1", a);
    expect(canReroll(requisitionMessage())).toBe(true);
  });

  it("offers no +1 DoS on a requisition card — quantity is manual by design", () => {
    const a = makeActor({ uuid: "Actor.a1", isOwner: true, system: { fate: { value: 2 } } });
    registerUuid("Actor.a1", a);
    expect(canAddDoS(requisitionMessage())).toBe(false);
  });

  it("still offers +1 DoS on an ordinary test card", () => {
    const a = makeActor({ uuid: "Actor.a1", isOwner: true, system: { fate: { value: 2 } } });
    registerUuid("Actor.a1", a);
    expect(canAddDoS({ flags: { [NS]: { reroll: { kind: "test", actorUuid: "Actor.a1", success: true, dosBonus: 0 } } } })).toBe(true);
  });

  it("refuses to spend Fate for +1 DoS on a requisition card even if called directly (defense in depth)", async () => {
    // canAddDoS hides the button, but addDoSFromFate is the function that actually spends the
    // point — a stale context menu, a macro, or a race could still invoke it directly. It must
    // refuse on its own, not merely rely on the UI condition check upstream.
    const a = makeActor({ uuid: "Actor.a1", isOwner: true, system: { fate: { value: 2 } } });
    registerUuid("Actor.a1", a);
    await addDoSFromFate(requisitionMessage());
    expect(a.system.fate.value).toBe(2);
    expect(capturedMessages()).toEqual([]);
  });
});
