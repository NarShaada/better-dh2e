/*
 * Attack-pipeline test fixtures for better-dh2e.
 * Run in the browser as GM, inside the bdh-test world: open the console (F12) and paste this whole file,
 * OR make a Script macro with these contents and execute it.
 * Re-runnable: it deletes its own prior entities (names ending "(Attack Test)" + the scene) first.
 */
(async () => {
  const ch = (b) => ({ base: b, advance: 0, unnatural: 0 });

  for (const a of game.actors.filter((a) => a.name.endsWith("(Attack Test)"))) await a.delete();
  for (const s of game.scenes.filter((s) => s.name === "Attack Test Range")) await s.delete();

  // --- Acolyte: equipped boltgun (ranged) + chainsword (melee) + carapace, good BS/WS ---
  const acolyte = await Actor.create({
    name: "Sgt. Kesh (Attack Test)", type: "acolyte", img: "icons/svg/mystery-man.svg",
    system: {
      characteristics: {
        weaponSkill: ch(55), ballisticSkill: ch(52), strength: ch(45), toughness: ch(40), agility: ch(42),
        intelligence: ch(35), perception: ch(38), willpower: ch(40), fellowship: ch(33), influence: ch(35)
      },
      wounds: { value: 16, max: 16, critical: 0 }, fate: { value: 3, max: 4 }, fatigue: { value: 0 },
      skills: { dodge: { rank: "trained" }, awareness: { rank: "trained" } },
      experience: { total: 6000, spent: 0 },
      aptitudes: ["Ballistic Skill", "Weapon Skill", "Finesse", "Offence", "Agility"]
    },
    items: [
      { name: "Boltgun (Test)", type: "weapon", img: "icons/svg/target.svg",
        system: { weaponClass: "basic", damage: "1d10+5", penetration: 4, range: 90,
                  rateOfFire: { single: 1, short: 2, long: 0 }, clip: { value: 24, max: 24 }, equipped: true } },
      { name: "Autogun (Test)", type: "weapon", img: "icons/svg/target.svg",
        system: { weaponClass: "basic", damage: "1d10+3", penetration: 0, range: 90,
                  rateOfFire: { single: 1, short: 3, long: 10 }, clip: { value: 30, max: 30 }, equipped: true } },
      { name: "Chainsword (Test)", type: "weapon", img: "icons/svg/sword.svg",
        system: { weaponClass: "melee", damage: "1d10+3", penetration: 2, equipped: true } },
      { name: "Carapace Chestplate (Test)", type: "armour", img: "icons/svg/shield.svg",
        system: { locations: { head: 0, body: 6, rightArm: 5, leftArm: 5, rightLeg: 4, leftLeg: 4 }, additive: false, equipped: true } },
      { name: "Nerves of Steel (Test)", type: "talent",
        system: { tier: 2, aptitudes: ["Willpower", "Defence"], favourite: true, purchased: true } }
    ]
  });

  // --- NPC target: armoured (body 4), TB ~3, 12 wounds ---
  const npc = await Actor.create({
    name: "Heretic Gunman (Attack Test)", type: "npc", img: "icons/svg/mystery-man-black.svg",
    system: {
      characteristics: {
        weaponSkill: ch(35), ballisticSkill: ch(33), strength: ch(35), toughness: ch(38), agility: ch(32),
        intelligence: ch(28), perception: ch(30), willpower: ch(30), fellowship: ch(25), influence: ch(20)
      },
      wounds: { value: 12, max: 12, critical: 0 }, faction: "Chaos", threatLevel: 1
    },
    items: [
      { name: "Flak Vest (Test)", type: "armour",
        system: { locations: { head: 0, body: 4, rightArm: 3, leftArm: 3, rightLeg: 3, leftLeg: 3 }, additive: false, equipped: true } }
    ]
  });

  // --- Scene with both tokens placed apart ---
  const scene = await Scene.create({
    name: "Attack Test Range", grid: { type: 1, size: 100 }, width: 2000, height: 1400, padding: 0, backgroundColor: "#3a3326"
  });
  await scene.createEmbeddedDocuments("Token", [
    { name: acolyte.name, actorId: acolyte.id, actorLink: true, x: 400, y: 600, width: 1, height: 1, disposition: 1,  texture: { src: acolyte.img } },
    { name: npc.name,     actorId: npc.id,     actorLink: true, x: 1300, y: 600, width: 1, height: 1, disposition: -1, texture: { src: npc.img } }
  ]);
  await scene.activate();

  ui.notifications.info("Attack-test fixtures ready. Select Kesh's token → target the Heretic (press T) → open Kesh → Stats ▸ Combat → attack with a weapon.");
  console.log("better-dh2e attack-test fixtures created:", { acolyte: acolyte.name, npc: npc.name, scene: scene.name });
})();
