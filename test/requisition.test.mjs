// test/requisition.test.mjs
// requisition.mjs destructures foundry.applications.handlebars at MODULE SCOPE, so the stub must be
// installed before the dynamic import — same constraint as test/attack-effective-weapon.test.mjs.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  installFoundryStub, resetCaptures, capturedRolls, capturedMessages,
  primeDice, registerUuid, makeActor, makeCardHtml,
} from "./helpers/foundry-stub.mjs";

const NS = "better-dh2e";

let collectRequisitionSources, resolveRequisition, bindRequisitionButtons;

const PACKS = [{
  label: "DH2e Weapons",
  entries: [
    { _id: "w1", name: "Bolt Pistol", type: "weapon", system: { availability: "veryRare" } },
    { _id: "t1", name: "Ambidextrous", type: "talent", system: {} }
  ]
}];
const WORLD = [{ id: "i1", name: "Medikit", type: "gear", uuid: "Item.i1", system: { availability: "scarce" } }];

beforeAll(async () => {
  installFoundryStub({ items: WORLD, packs: PACKS });
  ({ collectRequisitionSources, resolveRequisition, bindRequisitionButtons } =
    await import("../scripts/rolls/requisition.mjs"));
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
    expect(out.map((x) => x.label)).toEqual(["Bolt Pistol", "Medikit"]);
  });

  it("carries availability through from a pack index", async () => {
    const out = await collectRequisitionSources();
    expect(out.find((x) => x.label === "Bolt Pistol").availability).toBe("veryRare");
  });

  it("derives a compendium uuid from the pack when the index carries none", async () => {
    const out = await collectRequisitionSources();
    expect(out.find((x) => x.label === "Bolt Pistol").uuid).toBe("Compendium.DH2e Weapons.w1");
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

describe("the Add button", () => {
  const cardHtml = () => makeCardHtml({ buttons: ["requisitionAdd"] });
  const button = (html) => html.querySelector('[data-bdh="requisitionAdd"]');
  const message = (over = {}) => ({
    flags: { [NS]: { kind: "requisition", itemUuid: "Item.src", itemLabel: "Bolt Pistol",
                     craftsmanship: "good", added: false,
                     reroll: { kind: "requisition", actorUuid: "Actor.a1" }, ...over } },
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

  it("removes the button once used, so a double-click cannot duplicate the item", () => {
    registerUuid("Actor.a1", makeActor({ uuid: "Actor.a1", isOwner: true }));
    const html = cardHtml();
    bindRequisitionButtons(message({ added: true }), html);
    expect(button(html)).toBeNull();
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
