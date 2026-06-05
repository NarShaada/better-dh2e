// scripts/better-dh2e.mjs
import { BDH } from "./config.mjs";
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

Hooks.once("init", () => {
  console.log("Better DH2e | Initializing");

  // Expose config
  CONFIG.BDH = BDH;

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

  console.log("Better DH2e | Initialized");
});
