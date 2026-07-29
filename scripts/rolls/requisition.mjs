// scripts/rolls/requisition.mjs — the Requisition test (p.141) and the item it can produce.
//
// Deliberately NOT in attack.mjs: that file is ~1650 lines and its bindCardButtons already
// dispatches every card kind in the system. Requisition binds its own buttons through a second
// renderChatMessageHTML hook so the feature stays self-contained.
import { BDH } from "../config.mjs";
import { evaluateTest, parseModifier } from "./test-logic.mjs";
import { makeRequisitionRuleset } from "../helpers/requisition-ruleset.mjs";
import { buildSourceIndex } from "../helpers/requisition-sources.mjs";
import { promptTest } from "./roll-test.mjs";
import { escapeHtml } from "../helpers/html-escape.mjs";

const NS = "better-dh2e";
const CARD = "systems/better-dh2e/templates/chat/requisition-card.hbs";
const { renderTemplate } = foundry.applications.handlebars;

/** The active ruleset. Only "dh2" exists; the setting arrives with the Black Crusade branch. */
function ruleset() {
  return makeRequisitionRuleset("dh2");
}

/** Gather pickable items from the world Items directory and every visible Item compendium.
 *  Pack indexes are lazy, so this awaits getIndex() once per pack. */
export async function collectRequisitionSources() {
  const entries = [];
  for (const item of game.items ?? []) {
    entries.push({ name: item.name, uuid: item.uuid, type: item.type, source: "World",
                   availability: item.system?.availability });
  }
  for (const pack of game.packs ?? []) {
    if (pack.documentName !== "Item") continue;
    if (pack.visible === false) continue;   // hidden from this user by ownership/config
    // `availability` is not indexed by default — ask for it so picking an item can prefill.
    // A pack that fails to index is skipped rather than aborting the whole picker, but say so:
    // silently dropping a compendium looks identical to it not being installed.
    const index = await pack.getIndex({ fields: ["system.availability"] }).catch((err) => {
      console.warn(`better-dh2e | Requisition: skipping compendium "${pack.metadata?.label ?? pack.collection}" — its index could not be read.`, err);
      return null;
    });
    if (!index) continue;
    for (const e of index) {
      entries.push({ name: e.name, uuid: e.uuid ?? pack.getUuid(e._id), type: e.type,
                     source: pack.metadata?.label, availability: e.system?.availability });
    }
  }
  return buildSourceIndex(entries);
}

/** Open the Requisition dialog and resolve it. */
export async function rollRequisition(actor) {
  const rs = ruleset();
  const sources = await collectRequisitionSources();
  const byLabel = new Map(sources.map((s) => [s.label, s]));

  const characteristics = Object.entries(BDH.characteristics).map(([key, c]) => ({
    key, label: c.label, value: actor.system.characteristics[key]?.total ?? 0,
    selected: key === rs.characteristic
  }));

  const choice = await promptTest({
    title: game.i18n.localize("BDH.Requisition.Title"),
    characteristics,
    fields: [
      { kind: "text", name: "itemLabel", label: game.i18n.localize("BDH.Requisition.Item"),
        datalist: sources.map((s) => s.label), placeholder: "…" },
      { kind: "select", name: "availability", label: game.i18n.localize("BDH.Requisition.Availability"),
        options: Object.entries(BDH.availability).map(([value, label]) => ({ value, label, selected: value === "average" })) },
      { kind: "select", name: "craftsmanship", label: game.i18n.localize("BDH.Requisition.Craftsmanship"),
        options: Object.entries(BDH.craftsmanship).map(([value, label]) => ({ value, label, selected: value === "normal" })) }
    ]
  });
  if (!choice) return;

  // A typed name that matches nothing stays a freeform label: the roll still happens, but with no
  // uuid there is nothing to add to the sheet afterwards.
  const typedLabel = choice.fieldValues?.itemLabel || null;
  const picked = typedLabel ? (byLabel.get(typedLabel) ?? null) : null;

  await resolveRequisition(actor, {
    characteristicKey: choice.characteristicKey ?? rs.characteristic,
    modifier: choice.modifier,
    // A picked item supplies its own availability; the dropdown still wins if the player changed
    // it, which p.141 leaves to the GM for alternative craftsmanship.
    availability: choice.fieldValues?.availability ?? "average",
    craftsmanship: choice.fieldValues?.craftsmanship ?? "normal",
    itemUuid: picked?.uuid ?? null,
    itemLabel: typedLabel
  });
}

/** Roll (or skip, for Ubiquitous) and post the card. Also the Fate-reroll entry point. */
export async function resolveRequisition(actor, choice) {
  const rs = ruleset();
  const total = rs.totalModifier({ availability: choice.availability, craftsmanship: choice.craftsmanship });
  const base = actor.system.characteristics[choice.characteristicKey]?.total ?? 0;
  const typed = parseModifier(choice.modifier);
  const label = `${game.i18n.localize("BDH.Requisition.Title")} — ${choice.itemLabel ?? game.i18n.localize("BDH.Requisition.General")}`;

  let roll = null;
  let result = null;
  if (!total.automatic) {
    roll = await new Roll("1d100").evaluate();
    result = evaluateTest({ base, modifier: total.modifier + typed, roll: roll.total });
  }
  const success = total.automatic || result.success;

  const content = await renderTemplate(CARD, {
    label,
    automatic: total.automatic,
    success,
    target: result?.target ?? "",
    roll: result?.roll ?? "",
    degrees: result?.degrees ?? 0,
    modifierLabel: result ? `${result.modifier >= 0 ? "+" : ""}${result.modifier}` : "",
    parts: total.parts.map((p) => ({ label: p.label, value: Math.abs(p.value), sign: p.value < 0 ? "−" : "+" })),
    gmDiscretion: choice.availability === "unique",
    canAdd: success && !!choice.itemUuid,
    itemLabel: choice.itemLabel ?? ""
  });

  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [NS]: {
      kind: "requisition",
      itemUuid: choice.itemUuid, itemLabel: choice.itemLabel, craftsmanship: choice.craftsmanship,
      added: false,
      reroll: { kind: "requisition", actorUuid: actor.uuid, choice,
                success, dosBonus: 0 }
    } }
  };
  // Ubiquitous makes no roll, so there is nothing to attach for the dice display.
  if (roll) messageData.rolls = [roll];
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
}

/** Bind the Add button. Registered from better-dh2e.mjs on renderChatMessageHTML. */
export function bindRequisitionButtons(message, html) {
  const f = message?.flags?.[NS];
  if (f?.kind !== "requisition") return;
  const btn = html.querySelector('[data-bdh="requisitionAdd"]');
  if (!btn) return;
  const actor = fromUuidSync(f.reroll?.actorUuid);
  // Mutating someone else's sheet is not on offer, and an already-used button must not fire twice.
  if (f.added || !actor?.isOwner) { btn.remove(); return; }
  btn.addEventListener("click", () => {
    // Disable synchronously, before the first await: creating the item and stamping the `added`
    // flag is a round trip, and the re-render that would remove this button only arrives after it.
    // A disabled button dispatches no click, so the second half of a double-click is dropped here.
    btn.disabled = true;
    return addRequisitionedItem(message);
  });
}

/** Copy the requisitioned item onto the actor, stamped with the craftsmanship asked for. */
async function addRequisitionedItem(message) {
  // Re-read the flag now rather than trusting the value bindRequisitionButtons saw: the card may
  // have been used from another client, or by a macro, since this button was bound.
  if (message.getFlag(NS, "added")) return;
  const f = message.flags[NS];
  const actor = await fromUuid(f.reroll?.actorUuid);
  if (!actor?.isOwner) return;
  const source = await fromUuid(f.itemUuid);
  if (!source) { ui.notifications.warn(game.i18n.localize("BDH.Requisition.Gone")); return; }

  const data = source.toObject();
  // Only stamp craftsmanship where the type actually has the field — writing it onto, say, a
  // weaponMod would put a junk key in system data that the DataModel then rejects.
  if (data.system && "craftsmanship" in data.system) data.system.craftsmanship = f.craftsmanship;
  await actor.createEmbeddedDocuments("Item", [data]);
  await message.setFlag(NS, "added", true);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${escapeHtml(game.i18n.format("BDH.Requisition.Acquired", { actor: actor.name, item: data.name }))}</header></div>`
  });
}
