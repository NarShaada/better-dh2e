#!/usr/bin/env node
// ONE-OFF migration: Foundry "dark-heresy" (v4.4.0) world -> "better-dh2e" world.
// NOT shipped system code. Usage:
//   node migrate-world.mjs <srcWorldDir> <outWorldDir>
// Run from a dir where classic-level is installed (e.g. /tmp/dhread).
import { ClassicLevel } from "classic-level";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) {
  console.error("usage: node migrate-world.mjs <srcWorldDir> <outWorldDir>");
  process.exit(1);
}

// ---------- helpers ----------
function randomId(n = 16) {
  return randomBytes(12).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, n).padEnd(n, "0");
}
function stripHtml(s) {
  if (s == null) return "";
  return String(s).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
}
function joinDesc(a, b) {
  const parts = [a, b].map(x => (x == null ? "" : String(x))).filter(x => x.trim() !== "");
  return parts.join("<hr>");
}
function num(v, d = 0) {
  if (v == null) return d;
  if (typeof v === "number") return Number.isFinite(v) ? v : d;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : d;
}
function craft(c) {
  const v = String(c ?? "").toLowerCase();
  if (v === "common" || v === "") return "normal";
  if (v === "poor" || v === "good" || v === "best") return v;
  return "normal";
}
const AVAIL_MAP = {
  common: "common", average: "average", scarce: "scarce", rare: "rare",
  "very-rare": "veryRare", "extremely-rare": "extremelyRare",
  "near-unique": "nearUnique", unique: "unique",
  plentiful: "plentiful", abundant: "abundant", ubiquitous: "ubiquitous",
};
function avail(a) {
  return AVAIL_MAP[String(a ?? "").toLowerCase()] ?? "common";
}

const VALID_APTITUDES = new Set([
  "Weapon Skill", "Ballistic Skill", "Strength", "Toughness", "Agility",
  "Intelligence", "Perception", "Willpower", "Fellowship", "Offence",
  "Finesse", "Defence", "Psyker", "Knowledge", "Leadership", "Social",
  "Tech", "Fieldcraft", "General",
]);
function normAptitude(n) {
  let s = String(n ?? "").trim();
  if (s === "Offense") s = "Offence";
  if (s === "Strenght") s = "Strength";
  return s;
}

const CHAR_KEYS = ["weaponSkill", "ballisticSkill", "strength", "toughness", "agility", "intelligence", "perception", "willpower", "fellowship", "influence"];
const SKILL_KEYS = ["acrobatics", "athletics", "awareness", "charm", "command", "commerce", "commonLore", "deceive", "dodge", "forbiddenLore", "inquiry", "interrogation", "intimidate", "linguistics", "logic", "medicae", "navigate", "operate", "parry", "psyniscience", "scholasticLore", "scrutiny", "security", "sleightOfHand", "stealth", "survival", "techUse", "trade"];
const SPECIALIST_KEYS = new Set(["commonLore", "forbiddenLore", "linguistics", "navigate", "operate", "scholasticLore", "trade"]);

function skillRank(adv) {
  if (adv === -20) return "untrained";
  if (adv === 0) return "known";
  if (adv === 10) return "trained";
  if (adv === 20) return "experienced";
  if (adv === 30) return "veteran";
  if (adv >= 30) return "veteran";
  if (adv >= 20) return "experienced";
  if (adv >= 10) return "trained";
  if (adv >= 0) return "known";
  return "untrained";
}
function specRank(adv) {
  if (adv === 0) return "known";
  if (adv === 10) return "trained";
  if (adv === 20) return "experienced";
  if (adv === 30) return "veteran";
  if (adv >= 30) return "veteran";
  if (adv >= 20) return "experienced";
  if (adv >= 10) return "trained";
  return "known";
}

// ---------- quality parser ----------
const QUALITY_STEMS = [
  ["tearing", "tearing"], ["proven", "proven"], ["primitive", "primitive"],
  ["razor", "razorSharp"], ["felling", "felling"], ["accurate", "accurate"],
  ["storm", "storm"], ["twin", "twinLinked"], ["unreliab", "unreliable"],
  ["reliab", "reliable"], ["relib", "reliable"], ["unwield", "unwieldy"],
  ["flexible", "flexible"], ["unbalanced", "unbalanced"], ["balanced", "balanced"],
  ["shock", "shocking"], ["blast", "blast"], ["concuss", "concussive"],
  ["corros", "corrosive"], ["crippl", "crippling"], ["defens", "defensive"],
  ["flame", "flame"], ["gravit", "graviton"], ["halluc", "hallucinogenic"],
  ["haywire", "haywire"], ["inaccur", "inaccurate"], ["indirect", "indirect"],
  ["lance", "lance"], ["melta", "melta"], ["maximal", "maximal"],
  ["overheat", "overheats"], ["scatter", "scatter"], ["snare", "snare"],
  ["spray", "spray"], ["sanctif", "sanctified"], ["toxic", "toxic"],
  ["vengeful", "vengeful"], ["recharge", "recharge"], ["smoke", "smoke"],
  ["power", "powerField"], ["force", "force"],
];
function parseQualities(special) {
  const text = String(special ?? "");
  if (!text.trim()) return [];
  // tokens: split on , ; / and whitespace, but keep "(n)" attached enough to extract numbers nearby
  const raw = text.split(/[,;/]/).map(s => s.trim()).filter(Boolean);
  const found = new Map();
  for (const chunk of raw) {
    const lc = chunk.toLowerCase();
    for (const [stem, key] of QUALITY_STEMS) {
      // Match the stem at a word boundary (start of a word) to avoid false
      // positives like "lance" inside "balanced". The stem is a prefix of the
      // actual quality word, so anchoring to a word start is sufficient.
      const re = new RegExp("(?:^|[^a-z])" + stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const m0 = lc.match(re);
      if (m0) {
        // find a number associated: "blast 3" / "blast (3)" / "blast(3)"
        const idx = m0.index + m0[0].length;
        const after = lc.slice(idx);
        const m = after.match(/\(?\s*(\d+)\s*\)?/);
        const value = m ? Number(m[1]) : 0;
        if (!found.has(key) || (found.get(key) === 0 && value !== 0)) found.set(key, value);
      }
    }
  }
  return [...found.entries()].map(([key, value]) => ({ key, value }));
}

// ---------- weapon enum maps (old data -> valid better-dh2e keys) ----------
const WTYPE = {
  las: "las", shock: "shock", chain: "chain", flame: "flame", bolt: "bolt",
  plasma: "plasma", melta: "melta", power: "power", exotic: "exotic",
  solidprojectile: "solidProjectile", sp: "solidProjectile", solid: "solidProjectile",
  lowtech: "lowTech", primitive: "lowTech", lowtechprimitive: "lowTech",
};
const RELOAD = {
  h: "half", half: "half", full: "full", free: "free", "": "full",
  "2 full": "twoFull", "2full": "twoFull", "3 full": "threeFull", "3full": "threeFull",
};
const WCLASS = new Set(["melee", "thrown", "pistol", "basic", "heavy"]);
const DMGT = new Set(["energy", "explosive", "rending", "impact"]);

// ---------- item mapping ----------
const unknownFallbacks = [];
const qualitySamples = [];
// `ctx` (optional) carries per-actor state. For armour we use ctx.nonAdditiveEquipped
// (a boolean holder { done }) so that exactly one non-additive armour per actor is
// equipped; additive armour is always equipped. World-level / orphan items pass no
// ctx -> they are left unequipped (and the "first non-additive" logic per call is moot).
function mapItem(old, ctx = null) {
  const t = old.type;
  const s = old.system || {};
  // PRESERVE the full source document: spread every top-level field
  // (_id, name, img, effects, _stats, folder, sort, ownership, prototypeToken,
  // etc.). We override only `type` + `system` + strip dark-heresy flags below.
  const flags = { ...(old.flags || {}) };
  delete flags["dark-heresy"];
  const base = { ...old, flags };

  switch (t) {
    case "talent":
      return { ...base, type: "talent", system: {
        tier: Math.min(Math.max(num(s.tier, 0) + 1, 1), 3),
        prerequisites: s.prerequisites || "",
        aptitudes: [], favourite: false, purchased: true,
        description: joinDesc(s.description, s.benefit),
      }};
    case "gear":
    case "drug":
      return { ...base, type: "gear", system: {
        craftsmanship: craft(s.craftsmanship), availability: avail(s.availability),
        weight: num(s.weight), quantity: 1,
        description: joinDesc(s.description, s.shortDescription),
      }};
    case "ammunition":
      return { ...base, type: "gear", system: {
        craftsmanship: craft(s.craftsmanship), availability: avail(s.availability),
        weight: num(s.weight), quantity: num(s.quantity, 1) || 1,
        description: joinDesc(s.description, "Ammunition"),
      }};
    case "weapon": {
      const qualities = parseQualities(s.special);
      qualitySamples.push({ name: old.name, special: s.special || "", qualities });
      return { ...base, type: "weapon", system: {
        weaponClass: WCLASS.has(s.class) ? s.class : "basic",
        weaponType: WTYPE[String(s.type || "").toLowerCase().replace(/[^a-z]/g, "")] || "lowTech",
        range: num(s.range), reload: RELOAD[String(s.reload || "").toLowerCase().trim()] || "full",
        clip: { value: num(s.clip?.value), max: num(s.clip?.max) },
        rateOfFire: { single: num(s.rateOfFire?.single), short: num(s.rateOfFire?.burst), long: num(s.rateOfFire?.full) },
        damage: s.damage || "", damageType: DMGT.has(s.damageType) ? s.damageType : "impact",
        penetration: num(s.penetration), special: s.special || "",
        craftsmanship: craft(s.craftsmanship), availability: avail(s.availability),
        weight: num(s.weight), qualities, mods: [], equipped: true,
      }};
    }
    case "armour": {
      const additive = !!s.isAdditive;
      // Equip rule: additive armour always equipped; for non-additive, equip only
      // the FIRST one per actor (tracked via ctx) to honour the "one at a time" rule.
      let equipped;
      if (additive) {
        equipped = true;
      } else if (ctx && ctx.nonAdditiveEquipped) {
        equipped = !ctx.nonAdditiveEquipped.done;
        if (equipped) ctx.nonAdditiveEquipped.done = true;
      } else {
        equipped = false;
      }
      return { ...base, type: "armour", system: {
        locations: {
          head: num(s.part?.head), body: num(s.part?.body),
          rightArm: num(s.part?.rightArm), leftArm: num(s.part?.leftArm),
          rightLeg: num(s.part?.rightLeg), leftLeg: num(s.part?.leftLeg),
        },
        additive, craftsmanship: craft(s.craftsmanship),
        availability: avail(s.availability), weight: num(s.weight),
        equipped, maxAgility: num(s.maxAgility),
      }};
    }
    case "cybernetic":
      return { ...base, type: "cybernetic", system: {
        craftsmanship: craft(s.craftsmanship), availability: avail(s.availability),
        installed: (s.installed === "installed" || s.installed === true),
        description: stripHtml(s.description),
      }};
    case "weaponModification":
      return { ...base, type: "weaponMod", system: {
        attackMod: 0, damageMod: "", penMod: 0,
        special: s.upgrades || "", description: joinDesc(s.description, s.upgrades),
      }};
    case "specialAbility":
      return { ...base, type: "trait", system: {
        favourite: false, description: joinDesc(s.description, s.benefit),
      }};
    case "psychicPower":
      return { ...base, type: "psychicPower", system: {
        description: joinDesc(stripHtml(s.description), stripHtml(s.shortDescription)),
      }};
    default:
      unknownFallbacks.push({ name: old.name, oldType: t });
      return { ...base, type: "gear", system: {
        craftsmanship: "normal", availability: "common", weight: 0, quantity: 1,
        description: stripHtml(s.description || ""),
      }};
  }
}

// ---------- LevelDB I/O ----------
async function readAll(dir) {
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [k, v] of db.iterator()) out.push([k, v]);
  await db.close();
  return out;
}
async function writeAll(dir, entries) {
  fs.mkdirSync(dir, { recursive: true });
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const ops = entries.map(([key, value]) => ({ type: "put", key, value }));
  if (ops.length) await db.batch(ops);
  await db.close();
  return entries.length;
}

// ---------- main ----------
const SRC_DATA = path.join(SRC, "data");
const OUT_DATA = path.join(OUT, "data");
fs.mkdirSync(OUT_DATA, { recursive: true });

const counts = {};
const report = { actors: [] };

// world.json
const worldJson = JSON.parse(fs.readFileSync(path.join(SRC, "world.json"), "utf8"));
const newWorld = {
  title: worldJson.title,
  id: worldJson.id,
  background: worldJson.background,
  system: "better-dh2e",
  coreVersion: "14.363",
  compatibility: { minimum: "13", verified: "14.363" },
  description: "",
  flags: {},
};
fs.writeFileSync(path.join(OUT, "world.json"), JSON.stringify(newWorld, null, 2));

// copy asset folders verbatim
for (const folder of ["assets", "scenes"]) {
  const src = path.join(SRC, folder);
  if (fs.existsSync(src) && fs.statSync(src).isDirectory()) {
    fs.cpSync(src, path.join(OUT, folder), { recursive: true });
  }
}

// pass-through dirs
const PASSTHROUGH = ["journal", "tables", "cards", "combats", "playlists", "folders", "users", "messages", "fog", "scenes", "macros"];
for (const dir of PASSTHROUGH) {
  const srcDir = path.join(SRC_DATA, dir);
  if (!fs.existsSync(srcDir)) { counts[dir] = 0; continue; }
  const entries = await readAll(srcDir);
  counts[dir] = await writeAll(path.join(OUT_DATA, dir), entries);
}

// settings: drop dark-heresy.*
{
  const entries = await readAll(path.join(SRC_DATA, "settings"));
  const kept = entries.filter(([, v]) => !String(v?.key ?? "").startsWith("dark-heresy"));
  counts.settings = await writeAll(path.join(OUT_DATA, "settings"), kept);
  counts["settings(dropped dark-heresy)"] = entries.length - kept.length;
}

// effects (world-level): item mapping on top-level item docs, pass effects keys through
for (const dir of ["effects", "items"]) {
  const srcDir = path.join(SRC_DATA, dir);
  if (!fs.existsSync(srcDir)) { counts[dir] = 0; continue; }
  const entries = await readAll(srcDir);
  const out = [];
  for (const [k, v] of entries) {
    if (k.startsWith(`!${dir}!`) && v && v.type && v.system !== undefined && !k.includes(".effects")) {
      // top-level item doc
      out.push([k, mapItem(v)]);
    } else {
      out.push([k, v]); // effects keys pass through
    }
  }
  counts[dir] = await writeAll(path.join(OUT_DATA, dir), out);
}

// actors (main work)
{
  const entries = await readAll(path.join(SRC_DATA, "actors"));
  const actorDocs = entries.filter(([k]) => k.startsWith("!actors!"));
  const embItems = entries.filter(([k]) => k.startsWith("!actors.items!"));
  const effectKeys = entries.filter(([k]) => k.startsWith("!actors.effects!") || k.startsWith("!actors.items.effects!"));

  // group embedded items by actorId (key: !actors.items!<actorId>.<itemId>)
  const itemsByActor = new Map();
  for (const [k, v] of embItems) {
    const tail = k.slice("!actors.items!".length);
    const actorId = tail.split(".")[0];
    if (!itemsByActor.has(actorId)) itemsByActor.set(actorId, []);
    itemsByActor.get(actorId).push([k, v]);
  }

  const out = [];
  const droppedItemIds = new Set();

  for (const [k, actor] of actorDocs) {
    const actorId = k.slice("!actors!".length);
    const old = actor.system || {};
    const myItems = itemsByActor.get(actorId) || [];

    // collect aptitudes & malignancies
    const aptSet = [];
    const aptSeen = new Set();
    const malignancies = [];
    for (const [, it] of myItems) {
      if (it.type === "aptitude") {
        const nm = normAptitude(it.name);
        if (VALID_APTITUDES.has(nm) && !aptSeen.has(nm)) { aptSeen.add(nm); aptSet.push(nm); }
      } else if (it.type === "malignancy") {
        malignancies.push({ name: it.name, description: stripHtml(it.system?.description) });
      }
    }

    // experience.spent: spentOther + char costs + skill costs + spec costs + talent costs
    let spent = num(old.experience?.spentOther, 0);
    const oc = old.characteristics || {};
    for (const ck of Object.keys(oc)) spent += num(oc[ck]?.cost, 0);
    const os = old.skills || {};
    for (const sk of Object.keys(os)) {
      spent += num(os[sk]?.cost, 0);
      const specs = os[sk]?.specialities || {};
      for (const sp of Object.keys(specs)) spent += num(specs[sp]?.cost, 0);
    }
    for (const [, it] of myItems) {
      if (it.type === "talent") spent += num(it.system?.cost, 0);
    }

    // characteristics
    const characteristics = {};
    for (const ck of CHAR_KEYS) {
      const c = oc[ck] || {};
      characteristics[ck] = { base: num(c.base, 0), advance: num(c.advance, 0), unnatural: num(c.unnatural, 0) };
    }

    // skills
    const skills = {};
    for (const sk of SKILL_KEYS) {
      const old1 = os[sk] || {};
      if (SPECIALIST_KEYS.has(sk)) {
        const specObj = old1.specialities || {};
        const specialties = [];
        for (const name of Object.keys(specObj)) {
          const sd = specObj[name] || {};
          // only output specialties that have been taken (advance > -20) -- but spec defaults to -20 raw entries.
          // Spec says: each entry of old specialities becomes a specialty. Filter to those advance>-20 (i.e. acquired).
          if (num(sd.advance, -20) > -20) {
            specialties.push({ id: randomId(16), name: sd.label || name, rank: specRank(num(sd.advance, 0)), favourite: false });
          }
        }
        skills[sk] = { specialties };
      } else {
        skills[sk] = { rank: skillRank(num(old1.advance, -20)), favourite: false };
      }
    }

    // initiative
    let initChar = old.initiative?.characteristic || "agility";
    if (!CHAR_KEYS.includes(initChar)) initChar = "agility";

    const sys = {
      characteristics,
      skills,
      wounds: { value: num(old.wounds?.value, 0), max: num(old.wounds?.max, 0), critical: num(old.wounds?.critical, 0) },
      fatigue: { value: num(old.fatigue?.value, 0), maxOverride: null },
      fate: { value: num(old.fate?.value, 0), max: num(old.fate?.max, 0) },
      corruption: Number(old.corruption) || 0,
      insanity: Number(old.insanity) || 0,
      psyRating: Number(old.psy?.rating) || 0,
      experience: { total: Number(old.experience?.value) || 0, spent },
      size: Number(old.size) || 4,
      initiative: { characteristic: initChar },
      aptitudes: aptSet,
      afflictions: { mutations: [], malignancies, mentalDisorders: [] },
      injuries: [],
      notes: "",
      advancementLog: [],
    };

    if (actor.type === "acolyte") {
      sys.bio = {
        homeWorld: old.bio?.homeWorld || "",
        background: old.bio?.background || "",
        role: old.bio?.role || "",
        elite: old.bio?.elite || "",
      };
    } else if (actor.type === "npc") {
      sys.faction = "";
      sys.threatLevel = 0;
    }

    const flags = { ...(actor.flags || {}) };
    delete flags["dark-heresy"];

    // record dropped item ids (aptitude/malignancy folded into the actor)
    for (const [, it] of myItems) {
      if (it.type === "aptitude" || it.type === "malignancy") {
        droppedItemIds.add(it._id);
      }
    }

    // PRESERVE the full source actor document: spread every top-level field
    // (_id, name, type, img, prototypeToken, folder, sort, ownership, _stats,
    // effects, etc.). Override only the transformed fields below.
    //
    // The source `actor.items` is the inline embedded-items array, which in this
    // v14 world is an array of item _id STRINGS that reference the separate
    // `!actors.items!<actorId>.<id>` documents. We keep it (so Foundry resolves
    // the embedded items) but filter out the ids of the aptitude/malignancy
    // items we are dropping, keeping inline + separate keys in sync.
    let inlineItems = Array.isArray(actor.items) ? actor.items : [];
    if (inlineItems.length && typeof inlineItems[0] === "string") {
      inlineItems = inlineItems.filter(id => !droppedItemIds.has(id));
    } else {
      // Defensive: if some source ever stores inline full item objects, convert
      // them the same way and drop aptitude/malignancy.
      inlineItems = inlineItems
        .filter(it => it && it.type !== "aptitude" && it.type !== "malignancy")
        .map(it => mapItem(it));
    }

    const newActor = {
      ...actor,
      flags,
      system: sys,
      items: inlineItems,
    };
    out.push([k, newActor]);

    // report
    const newTypeCounts = {};
    for (const [, it] of myItems) {
      if (it.type === "aptitude" || it.type === "malignancy") continue;
      const mapped = mapItemTypeName(it.type);
      newTypeCounts[mapped] = (newTypeCounts[mapped] || 0) + 1;
    }
    const specialistWithSpecs = SKILL_KEYS.filter(sk => SPECIALIST_KEYS.has(sk) && (skills[sk].specialties?.length || 0) > 0).length;
    report.actors.push({
      name: actor.name, type: actor.type,
      skills: SKILL_KEYS.length,
      specialistWithSpecs,
      aptitudes: aptSet.length,
      embeddedByType: newTypeCounts,
      _actorId: actorId,
      _sample: sys,
    });
  }

  // embedded items: drop aptitude/malignancy, map the rest.
  // Iterate per-actor so each actor gets its own armour-equip context (one
  // non-additive armour equipped per actor). Keys are grouped in itemsByActor.
  for (const [, list] of itemsByActor) {
    const ctx = { nonAdditiveEquipped: { done: false } };
    for (const [k, it] of list) {
      if (it.type === "aptitude" || it.type === "malignancy") continue;
      out.push([k, mapItem(it, ctx)]);
    }
  }

  // effects: pass through, but drop effects belonging to dropped aptitude/malignancy items
  let droppedEffects = 0;
  for (const [k, v] of effectKeys) {
    // key form: !actors.items.effects!<actorId>.<itemId>.<effectId>
    if (k.startsWith("!actors.items.effects!")) {
      const tail = k.slice("!actors.items.effects!".length);
      const parts = tail.split(".");
      const itemId = parts[1];
      if (droppedItemIds.has(itemId)) { droppedEffects++; continue; }
    }
    out.push([k, v]);
  }

  counts.actors = await writeAll(path.join(OUT_DATA, "actors"), out);
  counts["actors(droppedEffects)"] = droppedEffects;
}

function mapItemTypeName(t) {
  switch (t) {
    case "drug": case "ammunition": return "gear";
    case "weaponModification": return "weaponMod";
    case "specialAbility": return "trait";
    case "talent": case "gear": case "weapon": case "armour":
    case "cybernetic": case "psychicPower": return t;
    default: return "gear";
  }
}

// ---------- write report data to stdout marker ----------
console.log("MIGRATION_DONE");
console.log(JSON.stringify({ counts, report, unknownFallbacks, qualitySamples }));
