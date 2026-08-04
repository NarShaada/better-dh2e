// scripts/better-dh2e.mjs
import { BDH } from "./config.mjs";
import { battlemapEnabled, classifyMovement } from "./helpers/battlemap-data.mjs";
import { hordesEnabled } from "./helpers/horde-data.mjs";
import { themeChoices, bodyClassesFor, ALL_THEME_CLASSES } from "./helpers/theme-data.mjs";
import { registerTokenPrefix } from "./helpers/token-prefix.mjs";
import { registerDiceTray, injectDiceTray } from "./apps/dice-tray.mjs";
import { bindCardButtons } from "./rolls/attack.mjs";
import { bindRequisitionButtons } from "./rolls/requisition.mjs";
import { canReroll, rerollFromFate, canAddDoS, addDoSFromFate } from "./rolls/fate.mjs";
import { AcolyteModel } from "./data/actor/acolyte-model.mjs";
import { NpcModel } from "./data/actor/npc-model.mjs";
import { HordeModel } from "./data/actor/horde-model.mjs";
import { VehicleModel } from "./data/actor/vehicle-model.mjs";
import { WeaponModel } from "./data/item/weapon-model.mjs";
import { WeaponModModel } from "./data/item/weapon-mod-model.mjs";
import { AmmunitionModel } from "./data/item/ammunition-model.mjs";
import { GearModel } from "./data/item/gear-model.mjs";
import { TalentModel } from "./data/item/talent-model.mjs";
import { TraitModel } from "./data/item/trait-model.mjs";
import { ForceFieldModel } from "./data/item/force-field-model.mjs";
import { CyberneticModel } from "./data/item/cybernetic-model.mjs";
import { PsychicPowerModel } from "./data/item/psychic-power-model.mjs";
import { ArmourModel } from "./data/item/armour-model.mjs";
import { ArmourModModel } from "./data/item/armour-mod-model.mjs";
import { DarkHeresyActor } from "./documents/actor.mjs";
import { DarkHeresyItem } from "./documents/item.mjs";
import { DarkHeresyActorSheet } from "./sheets/actor-sheet.mjs";
import { VehicleSheet } from "./sheets/vehicle-sheet.mjs";
import { DarkHeresyItemSheet } from "./sheets/item-sheet.mjs";
import { makeDHTokenRuler } from "./canvas/token-ruler.mjs";
import { makeDHCombat } from "./documents/combat.mjs";
import { makeDHCombatant } from "./documents/combatant.mjs";
import { initCoverOverlay } from "./canvas/cover-overlay.mjs";
import { initVehicleFacing } from "./canvas/vehicle-facing.mjs";
import { clearAllCover, coverMechanicsEnabled, registerCoverPaintingGuards, registerLegacyCoverMigration, runLegacyCoverMigration } from "./canvas/cover.mjs";
import { toggleCoverVisibility } from "./canvas/cover-overlay.mjs";
import { CoverTemplatesApp } from "./apps/cover-templates-app.mjs";
import { registerGrantHooks } from "./cybernetics/grants.mjs";
import { registerWeaponPartHooks } from "./weapons/parts.mjs";
import { registerFatigueHooks } from "./rolls/conditions.mjs";

Hooks.once("init", () => {
  console.log("Better DH2e | Initializing");

  // Expose config
  CONFIG.BDH = BDH;

  // Chat-card helpers: {{#times n}}…{{/times}} repeats a block n times (DoS pips);
  // {{inc i}} → i+1 (1-based hit numbering in the card lists).
  Handlebars.registerHelper("times", function (n, options) {
    let out = "";
    for (let i = 0; i < (Number(n) || 0); i++) out += options.fn(i);
    return out;
  });
  Handlebars.registerHelper("inc", (v) => (Number(v) || 0) + 1);
  // "eq" is intentionally NOT registered here — Foundry core already registers an identical
  // eq: (v1, v2) => v1 === v2 (client/applications/handlebars.mjs), and the templates in this repo
  // only ever use eq for plain two-argument strict-equality checks (moveCfg.kind, initiative.baseKind).

  // Combat-tracker initiative: 1d10 + the actor's chosen initiative-characteristic bonus (see DarkHeresyActor#getRollData).
  CONFIG.Combat.initiative = { formula: "1d10 + @initiativeBonus", decimals: 0 };

  // Document classes — MUST be set at init. Foundry caches the document-class ↔ collection wiring
  // before "setup", so swapping CONFIG.Combat.documentClass in a later hook leaves a session-fresh
  // Combat bound to a different class identity than the CombatEncounters collection validates against
  // → "You may only push instances of Combat" on Start Combat (a reload rebuilds it consistently and hides it).
  CONFIG.Actor.documentClass = DarkHeresyActor;
  CONFIG.Item.documentClass = DarkHeresyItem;
  if (CONFIG.Combat?.documentClass) CONFIG.Combat.documentClass = makeDHCombat(CONFIG.Combat.documentClass);
  if (CONFIG.Combatant?.documentClass) CONFIG.Combatant.documentClass = makeDHCombatant(CONFIG.Combatant.documentClass);

  // Data models
  CONFIG.Actor.dataModels.acolyte = AcolyteModel;
  CONFIG.Actor.dataModels.npc = NpcModel;
  CONFIG.Actor.dataModels.horde = HordeModel;
  CONFIG.Actor.dataModels.vehicle = VehicleModel;
  CONFIG.Item.dataModels.weapon = WeaponModel;
  CONFIG.Item.dataModels.weaponMod = WeaponModModel;
  CONFIG.Item.dataModels.ammunition = AmmunitionModel;
  CONFIG.Item.dataModels.gear = GearModel;
  CONFIG.Item.dataModels.talent = TalentModel;
  CONFIG.Item.dataModels.trait = TraitModel;
  CONFIG.Item.dataModels.forceField = ForceFieldModel;
  CONFIG.Item.dataModels.cybernetic = CyberneticModel;
  CONFIG.Item.dataModels.psychicPower = PsychicPowerModel;
  CONFIG.Item.dataModels.armour = ArmourModel;
  CONFIG.Item.dataModels.armourMod = ArmourModModel;

  // Sheets (ApplicationV2 registration)
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("better-dh2e", DarkHeresyActorSheet, {
    types: ["acolyte", "npc", "horde"],
    makeDefault: true,
    label: "Better DH2e Actor Sheet"
  });
  foundry.documents.collections.Actors.registerSheet("better-dh2e", VehicleSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "Better DH2e Vehicle Sheet"
  });

  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("better-dh2e", DarkHeresyItemSheet, {
    makeDefault: true,
    label: "Better DH2e Item Sheet"
  });

  game.settings.register("better-dh2e", "lockCustomMode", {
    name: "Lock Custom mode to the GM",
    hint: "When enabled, only the GM can use Custom (free-edit) advancement. Players are limited to Simple mode (proper XP costs).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });

  // Battlemap integration is now a default, always-on feature (v0.2.0). The setting is kept (so stored
  // values stay valid) but hidden from the UI (config: false) and defaults to true; a ready-hook migration
  // flips any world that had it off so nothing stays gated.
  game.settings.register("better-dh2e", "enableBattlemap", {
    name: "Enable battlemap integration",
    scope: "world",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("better-dh2e", "uiTheme", {
    name: "UI theme",
    scope: "client",
    config: true,
    type: String,
    choices: themeChoices(),
    default: "classic",
    onChange: () => applyUiTheme()
  });

  game.settings.register("better-dh2e", "uiChrome", {
    name: "Extend theme to Foundry interface",
    hint: "Applies the chosen theme to Foundry. No effect on Parchment",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => applyUiTheme()
  });

  game.settings.register("better-dh2e", "diceTray", {
    name: "Show the dice tray",
    hint: "Click a die to roll one; hold a die for multiple.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => injectDiceTray(ui.chat?.element)
  });

  game.settings.register("better-dh2e", "tokenPrefixes", {
    name: "NPC token prefixes",
    hint: "Unlinked NPC tokens get random prefixes",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("better-dh2e", "coverMechanics", {
    name: "Cover mechanics",
    hint: "Adds cover templates and cover automation for battlemaps",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      ui.controls?.render?.();                 // show/hide the cover scene-control buttons
      import("./canvas/cover-overlay.mjs").then((m) => m.redrawCoverOverlay());
      // A GM enabling this mid-session may be sitting on a scene that still carries phase-2 pieces or
      // token residue from before the setting existed — canvasReady already fired for this scene, and
      // won't fire again until the next scene change, so run the migration directly.
      runLegacyCoverMigration();
    },
  });

  game.settings.register("better-dh2e", "coverTemplates", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
  });

  game.settings.register("better-dh2e", "reverseWounds", {
    name: "Reverse wounds display",
    hint: "Display wounds as remaining health (full = 9/9) instead of wounds suffered (0/9).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });

  // --- Homerules (kept last as a group) ---
  // Storage key stays "homebrewQualities" so existing worlds keep their choice; only the label changed.
  game.settings.register("better-dh2e", "homebrewQualities", {
    name: "Non-Vanilla Qualities",
    hint: "Qualities from a range of other rpg lines and homebrew",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register("better-dh2e", "enableHordes", {
    name: "Enable Hordes",
    hint: "Enable Horde mechanics adapted from Black Crusade.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
  });
  game.settings.register("better-dh2e", "maleficCorruption", {
    name: "Malefic Daemonology grants Corruption",
    hint: "When enabled, Malefic Daemonology grants Corruption automatically",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  // --- Black Crusade conversion (per-area rule selection; both data variants always stored) ---
  game.settings.register("better-dh2e", "advancementRules", {
    name: "Advancement Rules",
    hint: "Non-destructive — both aptitudes and alignment stay stored on every character.",
    scope: "world",
    config: true,
    type: String,
    choices: { dh2: "Dark Heresy 2", bc: "Black Crusade" },
    default: "dh2",
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });
  game.settings.register("better-dh2e", "sheetHeaderStyle", {
    name: "Sheet Header Style",
    hint: "Non-destructive — both headers stay stored on every character.",
    scope: "world",
    config: true,
    type: String,
    choices: { dh2: "Dark Heresy 2", bc: "Black Crusade" },
    default: "dh2",
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });

  game.settings.register("better-dh2e", "psychicRules", {
    name: "Psychic Rules",
    scope: "world",
    config: true,
    type: String,
    choices: { dh2: "Dark Heresy 2", bc: "Black Crusade" },
    default: "dh2",
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });

  registerTokenPrefix();

  // Conditions — replace Foundry's default set with our DH2e set.
  // Dead is kept so the combat-tracker "mark defeated" (CONFIG.specialStatusEffects.DEFEATED) still works.
  CONFIG.statusEffects = [
    { id: "dead",    name: "Dead",    img: "icons/svg/skull.svg" },
    { id: "run",     name: "Run",     img: "icons/svg/wing.svg" },
    { id: "stunned", name: "Stunned", img: "icons/svg/daze.svg" },
    { id: "prone",   name: "Prone",   img: "icons/svg/falling.svg" },
    { id: "toxic",   name: "Toxic",   img: "icons/svg/poison.svg" },
    { id: "onFire",   name: "On Fire",  img: "icons/svg/fire.svg" },
    { id: "helpless", name: "Helpless", img: "icons/svg/paralysis.svg" },
    // mystery-man, not blind.svg — Unaware is about not seeing the attack coming, and the
    // eye-with-a-slash belongs to the actual Blinded condition below.
    { id: "unaware",  name: "Unaware",  img: "icons/svg/mystery-man.svg" },
    { id: "pinned",   name: "Pinned",   img: "icons/svg/net.svg" },
    { id: "inCover",  name: "In Cover", img: "icons/svg/shield.svg" },
    { id: "weaponJammed", name: "Weapon Jammed", img: "icons/svg/clockwork.svg" },
    // The remaining conditions and special damage states (printed pages 242-244). These are MARKERS
    // only: the GM toggles them from the token HUD and applies the effects at the table. They are
    // deliberately absent from condition-data.mjs, which drives to-hit/evade maths — an entry
    // there would invite a modifier being hung on a pure marker later.
    // Seventeen compendium items reference them (Photon Flash Grenade, Bleeder Rounds, the Snare
    // weapons, Bionic Senses, Die Hard …), so without these the text had nothing to point at.
    { id: "blinded",     name: "Blinded",     img: "icons/svg/blind.svg" },
    { id: "deafened",    name: "Deafened",    img: "icons/svg/deaf.svg" },
    { id: "bloodLoss",   name: "Blood Loss",  img: "icons/svg/blood.svg" },
    // Snare already applies Helpless, which is what the quality's own entry (page 149) calls for.
    // This marks WHY, and that the escape is a Full Action Strength or Agility test at -10 x X.
    { id: "immobilised", name: "Immobilised", img: "icons/svg/anchor.svg" },
    { id: "unconscious", name: "Unconscious", img: "icons/svg/unconscious.svg" },
    // Crippled (X) from the Crippling quality, page 145. A marker, like the rest: the rule keys
    // off spending more than a Half Action, and this system does not model action economy, so
    // the combat tracker posts an end-of-turn reminder and the GM adjudicates.
    { id: "crippled",    name: "Crippled",    img: "icons/svg/degen.svg" },
  ];

  console.log("Better DH2e | Initialized");
});

// Token drag-ruler subclass: shows movement mode (Half/Full/Charge/Run) on the label when battlemap is enabled.
// Registered at "setup" — CONFIG.Token.rulerClass isn't reliably populated at "init".
Hooks.once("setup", () => {
  const Base = CONFIG.Token?.rulerClass ?? foundry.canvas?.placeables?.tokens?.TokenRuler;
  if (Base) CONFIG.Token.rulerClass = makeDHTokenRuler(Base);
});

/** Swap the theme classes on <body>. Pure CSS switch — no re-render needed; live chat cards re-skin instantly. */
function applyUiTheme() {
  document.body.classList.remove(...ALL_THEME_CLASSES);
  const classes = bodyClassesFor(
    game.settings.get("better-dh2e", "uiTheme"),
    game.settings.get("better-dh2e", "uiChrome")
  );
  if (classes.length) document.body.classList.add(...classes);
}

Hooks.once("ready", () => {
  applyUiTheme();
  initCoverOverlay();
  registerCoverPaintingGuards();
  registerLegacyCoverMigration();
  initVehicleFacing();
  registerGrantHooks();
  registerWeaponPartHooks();
  registerFatigueHooks();
  registerDiceTray();
  // Battlemap integration is default-on now — flip any existing world that still had it off so its
  // token/grid automation isn't stuck disabled (the setting is hidden as of v0.2.0).
  if (game.user.isGM && game.settings.get("better-dh2e", "enableBattlemap") !== true) {
    game.settings.set("better-dh2e", "enableBattlemap", true);
  }
});

Hooks.on("renderChatMessageHTML", (message, html) => bindCardButtons(message, html));
// Requisition binds its own card button in a second hook so the feature stays out of attack.mjs.
Hooks.on("renderChatMessageHTML", (message, html) => bindRequisitionButtons(message, html));

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

Hooks.on("getActorContextOptions", (html, options) => {
  const idOf = (li) => li?.dataset?.entryId ?? li?.getAttribute?.("data-entry-id") ?? li?.[0]?.dataset?.entryId;
  options.push({
    name: "Make a Horde",
    icon: '<i class="fas fa-users"></i>',
    condition: (li) => {
      const actor = game.actors.get(idOf(li));
      return game.user.isGM && actor?.type === "npc" && hordesEnabled();
    },
    callback: async (li) => {
      const npc = game.actors.get(idOf(li));
      if (!npc) return;
      const data = npc.toObject();
      delete data._id;
      data.type = "horde";
      data.name = `${npc.name} (Horde)`;
      if (data.prototypeToken?.name === npc.name) data.prototypeToken.name = data.name;   // keep a tracking token name in sync
      await getDocumentClass("Actor").create(data);   // HordeModel drops the inherited wounds, defaults magnitude to 0
    }
  });
});

// Keep a default (tracking) prototype-token name in sync when the actor is renamed; leave customised token names alone.
Hooks.on("preUpdateActor", (actor, change) => {
  if (typeof change.name === "string" && change.name !== actor.name && actor.prototypeToken?.name === actor.name) {
    foundry.utils.setProperty(change, "prototypeToken.name", change.name);
  }
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

// Cover scene controls — attached to the Token controls group (proven to render across v13/v14).
// GM: open the template manager, clear all cover. Everyone: toggle cover overlay visibility (per-client).
Hooks.on("getSceneControlButtons", (controls) => {
  if (!coverMechanicsEnabled()) return;
  const group = controls.tokens ?? Object.values(controls)[0];
  if (!group?.tools) return;
  if (game.user.isGM) {
    group.tools.bdhCoverTemplates = {
      name: "bdhCoverTemplates", title: "Cover Templates", icon: "fa-solid fa-shield-halved", button: true,
      onClick: () => new CoverTemplatesApp().render(true),
    };
    group.tools.bdhCoverClear = {
      name: "bdhCoverClear", title: "Clear All Cover", icon: "fa-solid fa-broom", button: true,
      onClick: () => confirmClearCover(),
    };
  }
  group.tools.bdhCoverVisibility = {
    name: "bdhCoverVisibility", title: "Toggle Cover Visibility", icon: "fa-solid fa-eye", button: true,
    onClick: () => toggleCoverVisibility(),
  };
});

async function confirmClearCover() {
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Clear All Cover" },
    content: "<p>Delete <b>every</b> cover piece on this scene? This cannot be undone.</p>",
    rejectClose: false,
  });
  if (!ok) return;
  const n = await clearAllCover(canvas.scene);
  ui.notifications.info(`Removed ${n} cover piece${n === 1 ? "" : "s"}.`);
}

