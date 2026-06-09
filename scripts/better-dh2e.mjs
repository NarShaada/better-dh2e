// scripts/better-dh2e.mjs
import { BDH } from "./config.mjs";
import { battlemapEnabled, classifyMovement } from "./helpers/battlemap-data.mjs";
import { bindCardButtons } from "./rolls/attack.mjs";
import { canReroll, rerollFromFate, canAddDoS, addDoSFromFate } from "./rolls/fate.mjs";
import { AcolyteModel } from "./data/actor/acolyte-model.mjs";
import { NpcModel } from "./data/actor/npc-model.mjs";
import { WeaponModel } from "./data/item/weapon-model.mjs";
import { WeaponModModel } from "./data/item/weapon-mod-model.mjs";
import { GearModel } from "./data/item/gear-model.mjs";
import { TalentModel } from "./data/item/talent-model.mjs";
import { TraitModel } from "./data/item/trait-model.mjs";
import { ForceFieldModel } from "./data/item/force-field-model.mjs";
import { CyberneticModel } from "./data/item/cybernetic-model.mjs";
import { PsychicPowerModel } from "./data/item/psychic-power-model.mjs";
import { ArmourModel } from "./data/item/armour-model.mjs";
import { DarkHeresyActor } from "./documents/actor.mjs";
import { DarkHeresyItem } from "./documents/item.mjs";
import { DarkHeresyActorSheet } from "./sheets/actor-sheet.mjs";
import { DarkHeresyItemSheet } from "./sheets/item-sheet.mjs";
import { makeDHTokenRuler } from "./canvas/token-ruler.mjs";

Hooks.once("init", () => {
  console.log("Better DH2e | Initializing");

  // Expose config
  CONFIG.BDH = BDH;

  // Combat-tracker initiative: 1d10 + the actor's chosen initiative-characteristic bonus (see DarkHeresyActor#getRollData).
  CONFIG.Combat.initiative = { formula: "1d10 + @initiativeBonus", decimals: 0 };

  // Document classes
  CONFIG.Actor.documentClass = DarkHeresyActor;
  CONFIG.Item.documentClass = DarkHeresyItem;

  // Data models
  CONFIG.Actor.dataModels.acolyte = AcolyteModel;
  CONFIG.Actor.dataModels.npc = NpcModel;
  CONFIG.Item.dataModels.weapon = WeaponModel;
  CONFIG.Item.dataModels.weaponMod = WeaponModModel;
  CONFIG.Item.dataModels.gear = GearModel;
  CONFIG.Item.dataModels.talent = TalentModel;
  CONFIG.Item.dataModels.trait = TraitModel;
  CONFIG.Item.dataModels.forceField = ForceFieldModel;
  CONFIG.Item.dataModels.cybernetic = CyberneticModel;
  CONFIG.Item.dataModels.psychicPower = PsychicPowerModel;
  CONFIG.Item.dataModels.armour = ArmourModel;

  // Sheets (ApplicationV2 registration)
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("better-dh2e", DarkHeresyActorSheet, {
    types: ["acolyte", "npc"],
    makeDefault: true,
    label: "Better DH2e Actor Sheet"
  });

  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("better-dh2e", DarkHeresyItemSheet, {
    makeDefault: true,
    label: "Better DH2e Item Sheet"
  });

  game.settings.register("better-dh2e", "lockCustomMode", {
    name: "Lock Custom mode to the GM",
    hint: "When enabled, only the GM can use Custom (free-edit) advancement. Players are limited to Simple mode (proper XP costs). Have players build characters in Custom first, then enable this to avoid XP-counting errors. The GM keeps Custom everywhere.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });

  game.settings.register("better-dh2e", "enableBattlemap", {
    name: "Enable battlemap integration (Experimental)",
    hint: "Opt-in token/grid automation — starts with range auto-measurement on attacks; movement, templates, cover, and conditions arrive in later updates. Off = theatre-of-mind play, fully unaffected.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // Conditions (the first; more arrive with the battlemap condition piece). Always available; auto-applied only when battlemap is on.
  CONFIG.statusEffects.push({ id: "run", name: "Run", img: "icons/svg/wing.svg" });

  console.log("Better DH2e | Initialized");
});

// Token drag-ruler subclass: shows movement mode (Half/Full/Charge/Run) on the label when battlemap is enabled.
// Registered at "setup" — CONFIG.Token.rulerClass isn't reliably populated at "init".
Hooks.once("setup", () => {
  const Base = CONFIG.Token?.rulerClass ?? foundry.canvas?.placeables?.tokens?.TokenRuler;
  if (Base) CONFIG.Token.rulerClass = makeDHTokenRuler(Base);
});

Hooks.on("renderChatMessageHTML", (message, html) => bindCardButtons(message, html));

Hooks.on("getChatMessageContextOptions", (html, options) => {
  const idOf = (li) => li?.dataset?.messageId ?? li?.getAttribute?.("data-message-id") ?? li?.[0]?.dataset?.messageId;
  options.push({
    name: "Spend Fate: Reroll",
    icon: '<i class="fas fa-dice-d10"></i>',
    condition: (li) => canReroll(game.messages.get(idOf(li))),
    callback: (li) => { const m = game.messages.get(idOf(li)); if (m) rerollFromFate(m); }
  });
  options.push({
    name: "Spend Fate: +1 DoS",
    icon: '<i class="fas fa-plus-circle"></i>',
    condition: (li) => canAddDoS(game.messages.get(idOf(li))),
    callback: (li) => { const m = game.messages.get(idOf(li)); if (m) addDoSFromFate(m); }
  });
});

// Battlemap: keep the Run condition in sync with per-turn movement. Runs once, on the mover's client.
Hooks.on("moveToken", async (doc, movement, operation, user) => {
  if ((user?.id ?? user) !== game.user.id || !battlemapEnabled()) return;
  const total = doc.movement?.history?.distance ?? 0;   // cumulative this turn (0 outside combat → skip)
  if (total <= 0) return;
  const rates = doc.actor?.system?.movement;
  if (!rates) return;
  // "run" OR "tooFar" (over-running) both mean the token is running — keep Run on past the max.
  const running = ["run", "tooFar"].includes(classifyMovement(total, rates));
  const hasRun = doc.actor.statuses?.has?.("run") ?? false;
  if (running && !hasRun) await doc.actor.toggleStatusEffect("run", { active: true });
  else if (!running && hasRun) await doc.actor.toggleStatusEffect("run", { active: false });
});

// Battlemap: clear the Run condition when the runner's own turn begins.
Hooks.on("combatTurnChange", async (combat, prior, current) => {
  if (!battlemapEnabled() || !game.users.activeGM?.isSelf) return;
  const actor = combat.combatant?.actor;   // the now-active combatant
  if (actor?.statuses?.has?.("run")) await actor.toggleStatusEffect("run", { active: false });
});
