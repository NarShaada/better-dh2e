// Seed a "bdh-test" world (system: better-dh2e) with sample actors/items, written
// directly into Foundry's LevelDB stores. Run ON the remote with Foundry's classic-level:
//   NODE_PATH=/opt/foundryvtt/resources/app/node_modules node /tmp/seed-test-world.cjs
// The world must NOT be active when this runs (LevelDB lock). Fixed _ids => re-runs overwrite.
const { ClassicLevel } = require("classic-level");
const fs = require("fs");
const path = require("path");

const WORLD = "/opt/foundrydata/Data/worlds/bdh-test";
const DATA = path.join(WORLD, "data");
const STATS = { systemId: "better-dh2e", systemVersion: "0.1.0", coreVersion: "13.351", createdTime: 0, modifiedTime: 0, lastModifiedBy: null };

const ch = (base) => ({ base, advance: 0, unnatural: 0 });
const baseDoc = (extra) => ({ effects: [], folder: null, sort: 0, ownership: { default: 0 }, flags: {}, _stats: STATS, ...extra });

const acolyte = baseDoc({
  _id: "bdhAcolyteTest01",
  name: "Daren Vholk (Test Acolyte)",
  type: "acolyte",
  img: "icons/svg/mystery-man.svg",
  items: [],
  system: {
    characteristics: {
      weaponSkill: ch(55), ballisticSkill: ch(40), strength: ch(34),
      toughness: ch(42),  // bonus 4
      agility: ch(30),    // bonus 3
      intelligence: ch(31), perception: ch(28),
      willpower: ch(35),  // fatigue.max = TB4 + WB3 = 7
      fellowship: ch(36), influence: ch(37)
    },
    skills: { awareness: { rank: "trained" }, dodge: { rank: "known" } },
    wounds: { value: 9, max: 12, critical: 0 },
    fatigue: { value: 1 },
    fate: { value: 3, max: 4 },
    size: 4,
    bio: { homeWorld: "Hive World", background: "Adeptus Arbites", role: "Warrior", elite: "" },
    experience: { total: 5000 },
    corruption: 12,
    insanity: 29
  }
});

const npc = baseDoc({
  _id: "bdhNpcTest000001",
  name: "Chaos Cultist (Test NPC)",
  type: "npc",
  img: "icons/svg/mystery-man.svg",
  items: [],
  system: {
    characteristics: { weaponSkill: ch(35), ballisticSkill: ch(30), toughness: ch(30), agility: ch(33) },
    wounds: { value: 8, max: 8, critical: 0 },
    faction: "Chaos", threatLevel: 1
  }
});

const weapon = baseDoc({
  _id: "bdhWeaponTest001",
  name: "Chainsword (Test)",
  type: "weapon",
  img: "icons/svg/sword.svg",
  system: {
    weaponClass: "melee", range: 0,
    rateOfFire: { single: true, burst: 0, full: 0 },
    damage: "1d10+3", damageType: "rending", penetration: "2",
    clip: { value: 0, max: 0 },
    qualities: [{ key: "tearing", value: null }, { key: "balanced", value: null }],
    equipped: true,
    description: "<p>Test weapon.</p>", source: "Test"
  }
});

const gear = baseDoc({
  _id: "bdhGearTest00001",
  name: "Stimm (Test)",
  type: "gear",
  img: "icons/svg/item-bag.svg",
  system: { craftsmanship: "normal", quantity: 2, weight: 0, description: "<p>Remove 1d5 fatigue.</p>", source: "Test" }
});

async function writeStore(name, docs) {
  const db = new ClassicLevel(path.join(DATA, name), { valueEncoding: "json" });
  for (const d of docs) await db.put(`!${name}!${d._id}`, d);
  await db.close();
  console.log(`wrote ${docs.length} -> data/${name}`);
}

(async () => {
  fs.mkdirSync(DATA, { recursive: true });
  const worldJson = {
    title: "BDH Test World",
    id: "bdh-test",
    system: "better-dh2e",
    coreVersion: "13.351",
    compatibility: { minimum: "13", verified: "13" },
    systemVersion: "0.1.0",
    description: "Test world for better-dh2e Plan 1 verification.",
    flags: {}
  };
  fs.writeFileSync(path.join(WORLD, "world.json"), JSON.stringify(worldJson, null, 2));
  console.log("wrote world.json");
  await writeStore("actors", [acolyte, npc]);
  await writeStore("items", [weapon, gear]);
  console.log("DONE");
})().catch((e) => { console.error("ERR", e); process.exit(1); });
