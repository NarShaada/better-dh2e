// scripts/better-dh2e.mjs
import { BDH } from "./config.mjs";
import { battlemapEnabled, classifyMovement } from "./helpers/battlemap-data.mjs";
import { themeChoices, themeBodyClasses, ALL_THEME_CLASSES } from "./helpers/theme-data.mjs";
import { registerTokenPrefix } from "./helpers/token-prefix.mjs";
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
import { makeDHCombat } from "./documents/combat.mjs";
import { registerCoverAutomation } from "./canvas/cover.mjs";

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

  game.settings.register("better-dh2e", "uiTheme", {
    name: "UI theme",
    hint: "Skin for sheets and chat cards. Classic is the original parchment look; Dataslate is a dark gothic-tech theme; Dossier is a refined light theme. Per-player setting — takes effect immediately.",
    scope: "client",
    config: true,
    type: String,
    choices: themeChoices(),
    default: "classic",
    onChange: (value) => applyUiTheme(value)
  });

  game.settings.register("better-dh2e", "tokenPrefixes", {
    name: "NPC token prefixes",
    hint: "When enabled, each newly placed unlinked NPC token gets a random Inquisition-flavour prefix (e.g. Filthy Heretic, Lowly Heretic) so multiple tokens from one stat block are easy to tell apart. Token names only — the actor sheet is untouched. Acolytes and linked NPCs are never prefixed.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("better-dh2e", "coverMechanics", {
    name: "Cover mechanics (battlemap)",
    hint: "Opt-in cover automation: adds Cover Templates / Clear Cover / Toggle-Visibility controls, auto-marks tokens standing in a cover piece as In Cover, and pre-fills the cover AP at Apply Damage. Off = only manual In Cover (toggle the condition + type the AP yourself). Independent of the Experimental battlemap setting.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => {
      ui.controls?.render?.();                 // show/hide the cover scene-control buttons
      import("./canvas/cover-overlay.mjs").then((m) => m.redrawCoverOverlay());
      import("./canvas/cover.mjs").then((m) => m.refreshAllCover(canvas?.scene));
    },
  });

  game.settings.register("better-dh2e", "coverTemplates", {
    scope: "world",
    config: false,
    type: Array,
    default: [],
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
    { id: "unaware",  name: "Unaware",  img: "icons/svg/blind.svg" },
    { id: "pinned",   name: "Pinned",   img: "icons/svg/net.svg" },
    { id: "inCover",  name: "In Cover", img: "icons/svg/shield.svg" },
  ];

  console.log("Better DH2e | Initialized");
});

// Token drag-ruler subclass: shows movement mode (Half/Full/Charge/Run) on the label when battlemap is enabled.
// Registered at "setup" — CONFIG.Token.rulerClass isn't reliably populated at "init".
Hooks.once("setup", () => {
  const Base = CONFIG.Token?.rulerClass ?? foundry.canvas?.placeables?.tokens?.TokenRuler;
  if (Base) CONFIG.Token.rulerClass = makeDHTokenRuler(Base);
  if (CONFIG.Combat?.documentClass) CONFIG.Combat.documentClass = makeDHCombat(CONFIG.Combat.documentClass);
});

/** Swap the theme classes on <body>. Pure CSS switch — no re-render needed; live chat cards re-skin instantly. */
function applyUiTheme(value) {
  document.body.classList.remove(...ALL_THEME_CLASSES);
  const classes = themeBodyClasses(value);
  if (classes.length) document.body.classList.add(...classes);
}

Hooks.once("ready", () => {
  applyUiTheme(game.settings.get("better-dh2e", "uiTheme"));
  registerCoverAutomation();
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

