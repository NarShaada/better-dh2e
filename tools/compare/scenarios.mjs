// tools/compare/scenarios.mjs — did a change alter behaviour it was not meant to?
//
// Runs IDENTICAL scenarios through two copies of the system — old/ (a git ref) and new/ (the
// working tree) — and diffs everything observable: every Roll formula, every chat message (content,
// flags, roll totals) and the final state of every actor and weapon. Anything it reports as
// different must be something the change set out to do; anything else is a regression.
//
// Do not run this directly — `npm run compare` (tools/compare/run.sh) builds the two copies first.
//   node scenarios.mjs <dir containing old/ and new/> [--corpus=<compendium src dir>] [--verbose]
//
// What it covers: plain tests; the attack → damage → apply → evade pipeline over a grid of weapons,
// attack options, targets and dice; quality chips; spray / suppressing fire / blast; every psychic
// power in the compendium corpus (when one is given); requisition; Fate on ordinary cards; which
// chat-card buttons each kind of user sees; the pure helpers over real item data; and the actor
// sheet's view-model. tools/compare/wiring.mjs covers startup wiring and the sheet actions.
//
// What it cannot cover: it runs under the test stubs (test/helpers), not inside Foundry — so no
// canvas interaction, no real permission enforcement, no multi-client effects, no rendered HTML.
//
// --verbose also writes every scenario's full diff to <dir>/scenarios-result.json.
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const D = process.argv[2];
const VERBOSE = process.argv.includes("--verbose");
const url = (p) => pathToFileURL(`${D}/${p}`).href;

const stub = await import(url("new/test/helpers/foundry-stub.mjs"));
const sheetStub = await import(url("new/test/helpers/sheet-stub.mjs"));
const { makeActor, makeWeapon, makeCardHtml, makeChoice, registerUuid, primeDice, primeDialog, resetCaptures, capturedMessages, capturedRolls, applyDotUpdate } = stub;

const NS = "better-dh2e";
let SETTINGS = {};
const BASE_SETTINGS = { enableBattlemap: true, homebrewQualities: true, enableHordes: true, reverseWounds: false,
  maleficCorruption: true, advancementRules: "dh2", sheetHeaderStyle: "dh2", psychicRules: "dh2", lockCustomMode: false, tokenPrefixes: true };

sheetStub.installSheetStub({});
game.settings.get = (_scope, key) => SETTINGS[key];
ui.notifications.warn = () => {}; ui.notifications.error = () => {}; ui.notifications.info = () => {};
const origWarn = console.warn; console.warn = () => {};

async function load(tree) {
  const m = (p) => import(url(`${tree}/scripts/${p}`));
  return {
    attack: await m("rolls/attack.mjs"), fate: await m("rolls/fate.mjs"), manifest: await m("rolls/manifest.mjs"),
    requisition: await m("rolls/requisition.mjs"), rollTest: await m("rolls/roll-test.mjs"),
    effects: await m("helpers/weapon-effects.mjs"), carry: await m("helpers/carry-state.mjs"), facing: await m("helpers/facing.mjs"),
    prefix: await m("helpers/token-prefix.mjs"), battlemap: await m("helpers/battlemap-data.mjs"), region: await m("canvas/region.mjs"),
    actorSheet: await m("sheets/actor-sheet.mjs"), itemSheet: await m("sheets/item-sheet.mjs"), vehicleSheet: await m("sheets/vehicle-sheet.mjs"),
  };
}
const MODS = { old: await load("old"), new: await load("new") };

// ---------------------------------------------------------------------------------------------
// Fixtures (fixed ids, so the two runs are comparable)
// ---------------------------------------------------------------------------------------------
function withEffects(actor, start = []) {
  actor.effects = [];
  let n = 0;
  const add = (id) => {
    const eff = { id: `${actor.id}-eff-${++n}`, statuses: new Set([id]), flags: {},
      update: async (c) => { applyDotUpdate(eff, c); return eff; },
      delete: async () => { actor.effects.splice(actor.effects.indexOf(eff), 1); actor.statuses.delete(id); } };
    actor.effects.push(eff); actor.statuses.add(id); return eff;
  };
  actor.toggleStatusEffect = async (id, { active } = {}) => {
    actor.statusToggles.push({ id, active });
    const eff = actor.effects.find((e) => e.statuses.has(id));
    if (active && !eff) add(id); else if (!active && eff) await eff.delete();
    return true;
  };
  for (const s of start) add(s);
  return actor;
}
function actor(id, over = {}) {
  const a = makeActor({ id, name: over.name ?? id, ...over,
    system: { fate: { value: 3, max: 3 }, fatigue: { value: 1, max: 8 }, injuries: [], corruption: 12, psyRating: 0, psykerClass: "bound",
      movement: { half: 3, full: 6, charge: 9, run: 18 },
      skills: { dodge: { rank: "known" }, parry: { rank: "trained" }, operate: { specialties: [] } }, ...over.system } });
  withEffects(a, over.startWith ?? []);
  a.created = [];
  a.createEmbeddedDocuments = async (_t, docs) => { a.created.push(...docs); return docs; };
  a.getActiveTokens = () => (a.token ? [a.token] : []);
  registerUuid(a.uuid, a);
  return a;
}
function weapon(id, system = {}, over = {}) {
  const w = makeWeapon({ id, name: over.name ?? id, uuid: `Item.${id}`, system });
  registerUuid(w.uuid, w);
  return w;
}
const tokenFor = (a, x = 0, y = 0) => { a.token = { actor: a, name: a.name, center: { x, y }, scene: { id: "s1" }, document: { testInsideRegion: () => true, getFlag: () => 0 } }; return a.token; };
const target = (a) => { game.user.targets = { first: () => (a ? (a.token ?? tokenFor(a, 300, 0)) : null) }; };
const snapshotActor = (a) => ({ system: a.system, statuses: [...a.statuses].sort(), flags: a.flags, toggles: a.statusToggles, created: a.created,
  effects: (a.effects ?? []).map((e) => ({ statuses: [...e.statuses], flags: e.flags })), items: a.items.map((i) => ({ id: i.id, system: i.system })) });

// ---------------------------------------------------------------------------------------------
// Runner + differ
// ---------------------------------------------------------------------------------------------
const normalise = (v) => JSON.parse(JSON.stringify(v, (_k, val) => (val instanceof Set ? [...val] : val))
  .replace(/id-\d+/g, "id-#").replace(/"at":\d+/g, '"at":0'));

function diff(a, b, path = "", out = []) {
  if (a === b) return out;
  const ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
  if (ta !== tb || typeof a !== "object" || a === null || b === null) { out.push({ path, old: a, new: b }); return out; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], path ? `${path}.${k}` : k, out);
  return out;
}

const results = [];
async function scenario(name, { settings = {}, dice = [], dialogs = [], build, act, group = "misc" }) {
  const runs = {};
  for (const tree of ["old", "new"]) {
    resetCaptures();
    sheetStub.resetSheetCaptures();
    canvas.tokens.controlled = []; canvas.tokens.placeables = []; canvas.scene = null; game.user.character = null; game.user.isGM = true;
    game.user.targets = { first: () => null };
    SETTINGS = { ...BASE_SETTINGS, ...settings };
    const world = build();
    primeDice(dice); primeDialog(dialogs);
    let error = null;
    try { await act(MODS[tree], world); } catch (e) { error = `${e.constructor.name}: ${e.message}`; }
    runs[tree] = normalise({
      error, rolls: capturedRolls(),
      messages: capturedMessages().map((m) => ({ content: m.content, flags: m.flags ?? null, speaker: m.speaker,
        rolls: (m.rolls ?? []).map((r) => ({ formula: r.formula, total: r.total })) })),
      state: Object.fromEntries(Object.entries(world).filter(([, v]) => v && v.system && v.items).map(([k, v]) => [k, snapshotActor(v)])),
      weapons: Object.fromEntries(Object.entries(world).filter(([, v]) => v && v.type === "weapon").map(([k, v]) => [k, v.system])),
      extra: world.extra ? world.extra() : null,
    });
  }
  results.push({ group, name, diffs: diff(runs.old, runs.new), oldError: runs.old.error, newError: runs.new.error, nMessages: runs.new.messages.length });
}

/** Click a chat-card button on the most recent message that carries flags (or on explicit flags). */
async function click(mods, bdh, { flags = null, extra = {} } = {}) {
  const f = flags ?? capturedMessages().filter((m) => m.flags?.[NS]).at(-1)?.flags?.[NS];
  if (!f) return;
  const html = makeCardHtml({ buttons: [typeof bdh === "string" ? bdh : bdh], ...extra });
  mods.attack.bindCardButtons({ flags: { [NS]: f } }, html);
  const name = typeof bdh === "string" ? bdh : bdh.bdh;
  if (html.querySelector(`[data-bdh="${name}"]`)) await html.click(name);
}

// ---------------------------------------------------------------------------------------------
// GROUP 1 — plain tests
// ---------------------------------------------------------------------------------------------
for (const roll of [3, 38, 77, 100]) {
  await scenario(`performTest roll ${roll}`, { group: "tests", dice: [roll], build: () => ({ a: actor("A") }),
    act: (m, w) => m.rollTest.performTest(w.a, { label: "Awareness", base: 40, modifier: "+10", characteristic: "perception" }) });
  await scenario(`rollCharacteristic strength roll ${roll}`, { group: "tests", dice: [roll], build: () => ({ a: actor("A") }),
    act: (m, w) => m.rollTest.rollCharacteristic(w.a, "strength") });
  await scenario(`rollSkill dodge roll ${roll}`, { group: "tests", dice: [roll], build: () => ({ a: actor("A") }),
    act: (m, w) => m.rollTest.rollSkill(w.a, "dodge") });
  await scenario(`rollAfflictionTest roll ${roll}`, { group: "tests", dice: [roll], build: () => ({ a: actor("A") }),
    act: (m, w) => m.rollTest.rollAfflictionTest(w.a, { label: "Trauma Test", penalty: -10 }) });
}

// ---------------------------------------------------------------------------------------------
// GROUP 2 — the attack pipeline: attack → roll damage → apply damage → evade
// ---------------------------------------------------------------------------------------------
const WEAPONS = {
  lasgun:   { weaponClass: "basic", damage: "1d10+3", damageType: "energy", penetration: 0, qualities: [{ key: "reliable", value: null }], range: 100, rateOfFire: { single: 1, short: 3, long: 0 } },
  autogun:  { weaponClass: "basic", damage: "1d10+3", damageType: "impact", penetration: 0, qualities: [], range: 100, rateOfFire: { single: 1, short: 3, long: 10 }, clip: { value: 30, max: 30 } },
  bolter:   { weaponClass: "basic", damage: "1d10+5", damageType: "explosive", penetration: 4, qualities: [{ key: "tearing", value: null }], range: 100, rateOfFire: { single: 1, short: 3, long: 0 } },
  plasma:   { weaponClass: "basic", damage: "1d10+7", damageType: "energy", penetration: 6, qualities: [{ key: "overheats", value: null }, { key: "maximal", value: null }], range: 90 },
  longlas:  { weaponClass: "basic", damage: "1d10+3", damageType: "energy", penetration: 1, qualities: [{ key: "accurate", value: null }, { key: "felling", value: 4 }], range: 150 },
  shotgun:  { weaponClass: "basic", damage: "1d10+4", damageType: "impact", penetration: 0, qualities: [{ key: "scatter", value: null }], range: 30 },
  stubber:  { weaponClass: "pistol", damage: "1d10+3", damageType: "impact", penetration: 0, qualities: [{ key: "unreliable", value: null }, { key: "primitive", value: 7 }], craftsmanship: "poor", range: 30 },
  boltpistolTL: { weaponClass: "pistol", damage: "1d10+5", damageType: "explosive", penetration: 4, qualities: [{ key: "twinLinked", value: null }, { key: "proven", value: 3 }], range: 30 },
  sword:    { weaponClass: "melee", damage: "1d10", damageType: "rending", penetration: 0, qualities: [{ key: "balanced", value: null }], craftsmanship: "best" },
  chainaxe: { weaponClass: "melee", damage: "1d10+4", damageType: "rending", penetration: 2, qualities: [{ key: "tearing", value: null }, { key: "unwieldy", value: null }] },
  powerfist:{ weaponClass: "melee", damage: "2d10", damageType: "energy", penetration: 9, qualities: [{ key: "powerField", value: null }, { key: "unwieldy", value: null }] },
  club:     { weaponClass: "melee", damage: "1d10", damageType: "impact", penetration: 0, qualities: [{ key: "primitive", value: 6 }] },
  modded:   { weaponClass: "basic", damage: "1d10+3", damageType: "energy", penetration: 2, qualities: [], range: 100,
              mods: [{ name: "Sight", attackMod: 10, damageMod: "", penMod: 0 }, { name: "Overcharge", attackMod: 0, damageMod: "+1", penMod: 2 }],
              loadedAmmo: { name: "Hotshot", attackMod: 0, damageMod: "+1", penMod: 4, damageType: "", qualities: [{ key: "tearing", value: null }] } },
};
const CHOICES = {
  standard: {}, aimed: { aim: "full" }, semi: { attackType: "semiAuto" }, full: { attackType: "fullAuto" },
  called: { attackType: "calledShot", calledShotLocation: "head" }, shortRange: { range: "short" }, longRange: { range: "long" }, plus20: { modifier: "+20" },
};
const TARGETS = {
  none: () => null,
  plain: () => actor("T", { system: { wounds: { value: 2, max: 14, critical: 0 } } }),
  bigStunned: () => actor("T", { system: { size: 6 }, startWith: ["stunned", "prone"] }),
  armoured: () => actor("T", { items: [{ id: "arm", type: "armour", name: "Flak", system: { equipped: true, additive: false, locations: { head: 4, body: 4, rightArm: 4, leftArm: 4, rightLeg: 4, leftLeg: 4 } } }] }),
  shielded: () => actor("T", { items: [{ id: "ff", type: "forceField", name: "Refractor", system: { equipped: true, protectionRating: 30, overload: 5 } }] }),
  horde: () => actor("T", { type: "horde", system: { magnitude: 30 } }),
  vehicle: () => { const d = actor("Drv"); const v = actor("T", { type: "vehicle", system: { armour: { front: 20, left: 16, right: 16, rear: 12 }, integrity: { value: 0, max: 30 }, crew: [{ role: "Driver", fixed: true, actorUuid: d.uuid, operate: "", weapons: [] }] } }); return v; },
};
const ROLLS = [4, 31, 62, 97];

for (const battlemap of [true, false]) for (const [wName, wSys] of Object.entries(WEAPONS)) for (const [cName, cOver] of Object.entries(CHOICES)) {
  const ranged = wSys.weaponClass !== "melee";
  if (!ranged && ["semi", "full", "shortRange", "longRange", "aimed"].includes(cName) && cName !== "aimed") continue;
  if (cName === "semi" && !(wSys.rateOfFire?.short > 0)) continue;
  if (cName === "full" && !(wSys.rateOfFire?.long > 0)) continue;
  for (const [tName, tBuild] of Object.entries(TARGETS)) for (const roll of ROLLS) {
    await scenario(`attack ${wName}/${cName} vs ${tName} roll ${roll} battlemap=${battlemap}`, {
      group: "attack→damage→apply", settings: { enableBattlemap: battlemap },
      dice: [roll, 7, 3, 9, 2, 6, 8, 4, 5, 1, 10, 6, 3, 7, 9, 2, 5, 8, 4, 6, 50, 7, 3],
      build: () => { const w = weapon("W", wSys); const a = actor("A", { items: [w], system: { psyRating: wName === "powerfist" ? 3 : 0 } }); tokenFor(a, 0, 0); const t = tBuild(); return { a, w, t }; },
      act: async (m, { a, w, t }) => {
        target(t);
        await m.attack.resolveAttack(a, w, makeChoice(cOver), { consumeAmmo: true });
        await click(m, "rollDamage");
        if (t) await click(m, "applyDamage");
        if (t) await click(m, "evade", { flags: capturedMessages().find((x) => x.flags?.[NS]?.type === "attack")?.flags?.[NS] });
      },
    });
  }
}

// ---------------------------------------------------------------------------------------------
// GROUP 3 — quality chips on a card with a bound, owned target
// ---------------------------------------------------------------------------------------------
const CHIPS = [
  ["shockTest", { qualities: [{ key: "shocking", value: null }] }], ["concussiveTest", { qualities: [{ key: "concussive", value: 2 }] }],
  ["flameTest", { qualities: [{ key: "flame", value: null }] }], ["snareTest", { qualities: [{ key: "snare", value: 1 }] }],
  ["hallucinogenicTest", { qualities: [{ key: "hallucinogenic", value: 2 }] }], ["toxicTest", { qualities: [{ key: "toxic", value: 1 }] }],
  ["radPhageTest", { qualities: [{ key: "radPhage", value: null }] }],
  ["toxicResist", { kind: "toxicResist", potency: 2, damageType: "energy" }],
  ["onFireApply", { kind: "onFire", damage: 7 }], ["onFireWP", { kind: "onFire", damage: 7 }],
  ["castResist", { opposed: true, opposedBy: "willpower", casterDoS: 2, powerName: "Dominate" }],
];
for (const [chip, cardFlags] of CHIPS) for (const roll of [6, 93]) for (const tName of ["plain", "horde", "vehicle", "bigStunned"]) {
  await scenario(`chip ${chip} on ${tName} roll ${roll}`, { group: "quality chips (owned target)", dice: [roll, 7, 4, 9],
    build: () => ({ t: TARGETS[tName]() }),
    act: (m, { t }) => click(m, chip, { flags: { type: "damage", targetUuid: t.uuid, targetName: t.name, qualities: [], ...cardFlags } }) });
}

// ---------------------------------------------------------------------------------------------
// GROUP 4 — spray, suppressing fire, blast
// ---------------------------------------------------------------------------------------------
for (const dmgRoll of [3, 9]) {
  await scenario(`spray apply (roll ${dmgRoll})`, { group: "spray / suppress / blast", dice: [dmgRoll, 4, 6, 2, 8, 5, 9, 3, 7, 1, 50],
    build: () => { const w = weapon("W", { damage: "1d10+4", damageType: "energy", penetration: 2, qualities: [{ key: "spray", value: null }, { key: "flame", value: null }], range: 20 });
      return { a: actor("A", { items: [w] }), w, t1: actor("T1"), t2: actor("T2", { type: "horde", system: { magnitude: 20 } }), t3: TARGETS.vehicle() }; },
    act: (m, { a, w, t1, t2, t3 }) => click(m, "sprayApply", { flags: { kind: "spray", actorUuid: a.uuid, weaponId: w.id, weaponUuid: w.uuid, damageType: "energy" }, extra: { sprayChecked: [t1.uuid, t2.uuid, t3.uuid] } }) });
  await scenario(`suppress apply on a normal target (roll ${dmgRoll})`, { group: "spray / suppress / blast", dice: [dmgRoll, 6, 2],
    build: () => { const w = weapon("W", WEAPONS.autogun); return { a: actor("A", { items: [w] }), w, t: actor("T") }; },
    act: (m, { a, w, t }) => click(m, { bdh: "suppressApply", uuid: t.uuid }, { flags: { kind: "suppressHit", actorUuid: a.uuid, weaponId: w.id, weaponUuid: w.uuid, hits: [{ uuid: t.uuid, locKeys: ["body", "leftArm"] }] } }) });
}
for (const roll of [12, 88]) {
  await scenario(`suppress WP test on a normal target (roll ${roll})`, { group: "spray / suppress / blast", dice: [roll], build: () => ({ t: actor("T") }),
    act: (m, { t }) => click(m, { bdh: "suppressWP", uuid: t.uuid }, { flags: { kind: "suppressWP", wpPenalty: -20 } }) });
  await scenario(`suppress Evade on a normal target (roll ${roll})`, { group: "spray / suppress / blast", dice: [roll], build: () => ({ t: actor("T") }),
    act: (m, { t }) => click(m, { bdh: "suppressEvade", uuid: t.uuid }, { flags: { kind: "suppressHit", hits: [] } }) });
}
await scenario("suppress Pinned on checked targets", { group: "spray / suppress / blast", build: () => ({ t1: actor("T1"), t2: actor("T2") }),
  act: (m, { t1, t2 }) => click(m, "suppressPin", { flags: { kind: "suppressWP", wpPenalty: -10 }, extra: { pinChecked: [t1.uuid, t2.uuid] } }) });

const blastScene = () => {
  const made = [];
  canvas.scene = { id: "s1", createEmbeddedDocuments: async (_t, docs) => docs.map((d, i) => { const r = { ...d, uuid: `Scene.s1.Region.r${made.length + i}`, deleted: false, async delete() { this.deleted = true; } }; made.push(r); registerUuid(r.uuid, r); return r; }) };
  return made;
};
for (const roll of [8, 91]) for (const quals of [[{ key: "blast", value: 3 }], [{ key: "blast", value: 2 }, { key: "tearing", value: null }]]) {
  await scenario(`blast attack → damage → apply, roll ${roll}, ${quals.map((q) => q.key).join("+")}`, { group: "spray / suppress / blast",
    dice: [roll, 2, 3, 6, 4, 8, 5, 9, 3, 7, 44, 61, 12, 6, 2, 8],
    build: () => { const w = weapon("W", { weaponClass: "thrown", damage: "2d10", damageType: "explosive", penetration: 0, qualities: quals, range: 20 });
      const a = actor("A", { items: [w] }); const t = actor("T"); const b = actor("B"); const h = actor("H", { type: "horde", system: { magnitude: 25 } });
      return { a, w, t, b, h, regions: blastScene(), extra() { return this.regions.map((r) => r.deleted); } }; },
    act: async (m, { a, w, t, b, h }) => {
      tokenFor(a, 0, 0); for (const x of [t, b, h]) tokenFor(x, 300, 0);
      canvas.tokens.placeables = [t.token, b.token, h.token];
      target(t);
      await m.attack.resolveAttack(a, w, makeChoice(), { consumeAmmo: true });
      await click(m, "rollDamage");
      await click(m, "applyDamage");
    } });
}

// ---------------------------------------------------------------------------------------------
// GROUP 5 — psychic powers: the whole compendium, cast → (+ damage) → +1 DoS
// ---------------------------------------------------------------------------------------------
// Real item data makes the pure-helper and psychic comparisons mean something. Optional: without it
// those sections fall back to the fixtures above, or are skipped, and the report says so.
const corpusDir = process.argv.find((a) => a.startsWith("--corpus="))?.slice("--corpus=".length) ?? "";
const hasCorpus = !!corpusDir && fs.existsSync(`${corpusDir}/weapons.json`);
const POWER_DEFAULTS = { discipline: "minor", type: "effect", prerequisite: "", focusTest: "willpower", focusModifier: 0, opposed: false, opposedBy: "willpower",
  range: "", sustained: "no", duration: "", action: "half", damage: "", damageType: "energy", penetration: "0", blastRadius: "0", qualities: [], cost: 0 };
const powers = fs.existsSync(`${corpusDir}/powers.json`) ? JSON.parse(fs.readFileSync(`${corpusDir}/powers.json`, "utf8")) : [];
for (const [i, p] of powers.entries()) for (const roll of [9, 96]) {
  const sys = { ...POWER_DEFAULTS, ...p.system };
  await scenario(`cast "${p.name}" roll ${roll}`, { group: "psychic powers (compendium)", dice: [roll, 5, 7, 3, 8, 2, 6, 9, 4, 1, 10, 5, 7],
    build: () => { const power = { id: `P${i}`, name: p.name, type: "psychicPower", system: JSON.parse(JSON.stringify(sys)) };
      const a = actor("A", { items: [power], system: { psyRating: 4, corruption: 10 } }); tokenFor(a, 0, 0); const t = actor("T"); blastScene(); return { a, t, power }; },
    act: async (m, { a, t, power }) => {
      tokenFor(t, 300, 0); canvas.tokens.placeables = [t.token]; target(t);
      await m.manifest.resolveManifest(a, power, { rulesetKey: "dh2", state: "normal", statePR: 4, prBonus: 0, circ: 0, sustain: sys.sustained !== "no" });
      const card = capturedMessages().find((x) => x.flags?.[NS]?.reroll?.kind === "cast");
      if (card?.flags[NS].type === "attack") { await click(m, "rollDamage", { flags: card.flags[NS] }); await click(m, "applyDamage"); }
    } });
}

// ---------------------------------------------------------------------------------------------
// GROUP 6 — requisition
// ---------------------------------------------------------------------------------------------
for (const roll of [14, 83]) for (const availability of ["ubiquitous", "average", "rare", "unique"]) {
  await scenario(`requisition ${availability} roll ${roll} + Add`, { group: "requisition", dice: [roll],
    build: () => { registerUuid("Item.src", { toObject: () => ({ name: "Bolt Pistol", type: "weapon", system: { craftsmanship: "normal" } }) }); return { a: actor("A", { system: { characteristics: { influence: { total: 45, bonus: 4, unnatural: 0 } } } }) }; },
    act: async (m, { a }) => {
      await m.requisition.resolveRequisition(a, { characteristicKey: "influence", modifier: "+0", availability, craftsmanship: "good", itemUuid: "Item.src", itemLabel: "Bolt Pistol" });
      const payload = capturedMessages().at(-1);
      const message = { flags: payload.flags, canUserModify: () => true, getFlag(ns, k) { return this.flags[ns]?.[k]; }, async setFlag(ns, k, v) { this.flags[ns][k] = v; } };
      const html = makeCardHtml({ buttons: ["requisitionAdd"] });
      m.requisition.bindRequisitionButtons(message, html);
      if (html.querySelector('[data-bdh="requisitionAdd"]')) await html.click("requisitionAdd");
    } });
}

// ---------------------------------------------------------------------------------------------
// GROUP 7 — Fate on ordinary cards (as the chat log hands them over: no stub id / with an id)
// ---------------------------------------------------------------------------------------------
for (const withId of [false, true]) for (const [what, fn] of [["reroll", "rerollFromFate"], ["+1 DoS", "addDoSFromFate"]]) {
  const wrap = (flags) => (withId ? { id: "chat-msg-1", flags } : { flags });
  await scenario(`Fate ${what} on a test card (id=${withId})`, { group: "Fate on ordinary cards", dice: [22, 61],
    build: () => ({ a: actor("A") }),
    act: async (m, { a }) => { await m.rollTest.performTest(a, { label: "Awareness", base: 40, modifier: "+0", characteristic: "perception" });
      const card = capturedMessages().at(-1); await m.fate[fn](wrap(card.flags)); } });
  await scenario(`Fate ${what} on a targeted attack card (id=${withId})`, { group: "Fate on ordinary cards", dice: [18, 44, 7, 3],
    build: () => { const w = weapon("W", WEAPONS.lasgun); const a = actor("A", { items: [w] }); tokenFor(a); return { a, w, t: actor("T") }; },
    act: async (m, { a, w, t }) => { target(t); await m.attack.resolveAttack(a, w, makeChoice(), { consumeAmmo: true });
      const card = capturedMessages().find((x) => x.flags?.[NS]?.type === "attack"); await m.fate[fn](wrap(card.flags)); } });
  await scenario(`Fate ${what} on a cast card (id=${withId})`, { group: "Fate on ordinary cards", dice: [15, 52, 7, 3, 9],
    build: () => { const power = { id: "P", name: "Smite", type: "psychicPower", system: { ...POWER_DEFAULTS, type: "bolt", discipline: "telekinesis", damage: "1d10+PR", penetration: "2" } };
      const a = actor("A", { items: [power], system: { psyRating: 4 } }); tokenFor(a); return { a, power, t: actor("T") }; },
    act: async (m, { a, power, t }) => { target(t); await m.manifest.resolveManifest(a, power, { rulesetKey: "dh2", state: "normal", statePR: 4, prBonus: 0, circ: 0, sustain: false });
      const card = capturedMessages().find((x) => x.flags?.[NS]?.reroll?.kind === "cast"); await m.fate[fn](wrap(card.flags)); } });
  await scenario(`Fate ${what} on a requisition card (id=${withId})`, { group: "Fate on ordinary cards", dice: [20, 70],
    build: () => ({ a: actor("A", { system: { characteristics: { influence: { total: 45, bonus: 4, unnatural: 0 } } } }) }),
    act: async (m, { a }) => { await m.requisition.resolveRequisition(a, { characteristicKey: "influence", modifier: "+0", availability: "rare", craftsmanship: "normal", itemUuid: null, itemLabel: null });
      const card = capturedMessages().at(-1); await m.fate[fn](wrap(card.flags)); } });
}

// ---------------------------------------------------------------------------------------------
// GROUP 8 — who sees which button (GM / player × target owned / not owned / none × card kind)
// ---------------------------------------------------------------------------------------------
const ALL_BUTTONS = ["rollDamage", "rollDamageForce", "evade", "applyDamage", "shockTest", "concussiveTest", "flameTest", "hallucinogenicTest", "snareTest", "toxicTest",
  "overheatDrop", "overheatDamage", "castResist", "toxicResist", "radPhageTest", "onFireApply", "onFireWP", "sprayAgTest", "sprayApply", "suppressWP", "suppressPin", "suppressEvade", "suppressApply"];
const CARD_KINDS = { attack: { type: "attack" }, damage: { type: "damage" }, blastDamage: { type: "attack", blast: true }, blastAttack: { type: "attack", blast: 3 },
  spray: { kind: "spray" }, sprayResult: { kind: "sprayResult" }, suppressWP: { kind: "suppressWP" }, suppressHit: { kind: "suppressHit" },
  onFire: { kind: "onFire" }, toxicResist: { kind: "toxicResist" }, cast: { type: "cast" } };
const gating = [];
for (const [kind, flags] of Object.entries(CARD_KINDS)) for (const isGM of [true, false]) for (const tgt of ["owned", "notOwned", "none", "deleted"]) {
  const shown = {};
  for (const tree of ["old", "new"]) {
    game.user.isGM = isGM;
    const t = makeActor({ id: "GT", isOwner: tgt === "owned" || isGM });
    registerUuid(t.uuid, t);
    const targetUuid = tgt === "none" ? null : tgt === "deleted" ? "Actor.nope" : t.uuid;
    const html = makeCardHtml({ buttons: ALL_BUTTONS });
    MODS[tree].attack.bindCardButtons({ flags: { [NS]: { ...flags, targetUuid } } }, html);
    shown[tree] = ALL_BUTTONS.filter((b) => html.querySelector(`[data-bdh="${b}"]`));
  }
  const gained = shown.new.filter((b) => !shown.old.includes(b)), lost = shown.old.filter((b) => !shown.new.includes(b));
  if (gained.length || lost.length) gating.push({ kind, user: isGM ? "GM" : "player", target: tgt, gained, lost });
}
game.user.isGM = true;

// ---------------------------------------------------------------------------------------------
// GROUP 9 — pure functions over real data
// ---------------------------------------------------------------------------------------------
const pure = {};
{ // effectiveWeapon: every compendium weapon bare, with every mod, with every ammunition
  const all = fs.existsSync(`${corpusDir}/weapons.json`) ? JSON.parse(fs.readFileSync(`${corpusDir}/weapons.json`, "utf8")) : [];
  const ws = all.filter((x) => x.type === "weapon"), mods = all.filter((x) => x.type === "weaponMod"), ammo = all.filter((x) => x.type === "ammunition");
  let n = 0; const differing = [];
  const cmp = (label, sys) => { n++; const o = MODS.old.effects.effectiveWeapon(sys), w = MODS.new.effects.effectiveWeapon(sys);
    if (JSON.stringify(o) !== JSON.stringify(w)) differing.push({ label, old: `${o.damage} pen ${o.penetration}`, new: `${w.damage} pen ${w.penetration}` }); };
  for (const w of ws) {
    cmp(w.name, w.system);
    for (const m of mods) cmp(`${w.name} + mod ${m.name}`, { ...w.system, mods: [{ name: m.name, ...m.system }] });
    for (const a of ammo) cmp(`${w.name} + ammo ${a.name}`, { ...w.system, loadedAmmo: { name: a.name, ...a.system } });
  }
  pure.effectiveWeapon = { compared: n, weapons: ws.length, mods: mods.length, ammo: ammo.length, differing };
}
{ // carriedWeight: random inventories from real weights
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  const pool = [];
  for (const f of ["weapons.json", "gear.json", "armour.json"]) if (fs.existsSync(`${corpusDir}/${f}`)) for (const x of JSON.parse(fs.readFileSync(`${corpusDir}/${f}`, "utf8"))) if (["weapon", "gear", "armour", "forceField"].includes(x.type)) pool.push(x);
  if (!pool.length) for (const [name, sys] of Object.entries(WEAPONS)) pool.push({ type: "weapon", name, system: { ...sys, weight: 1.5 + name.length * 0.35 } }, { type: "gear", name, system: { weight: 0.1 * name.length } });
  let n = 0, maxDelta = 0, differing = 0;
  for (let i = 0; i < 20000; i++) {
    const inv = Array.from({ length: 1 + Math.floor(rnd() * 14) }, () => { const x = pool[Math.floor(rnd() * pool.length)];
      return { type: x.type, system: { ...x.system, quantity: 1 + Math.floor(rnd() * 5), stashed: rnd() < 0.15, ammo: x.type === "weapon" ? [{ count: Math.floor(rnd() * 5) }] : undefined } }; });
    const o = MODS.old.carry.carriedWeight(inv), w = MODS.new.carry.carriedWeight(inv);
    n++; maxDelta = Math.max(maxDelta, Math.abs(o - w));
    if (o !== w) differing++;
  }
  pure.carriedWeight = { compared: n, differing, maxDelta };
}
{ // armourSideFromAttack: a dense grid of positions × headings
  let n = 0; const differing = [];
  for (const h of [0, 45, 90, 135, 180, 225, 270, 315]) for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) {
    n++; const o = MODS.old.facing.armourSideFromAttack(dx * 100, dy * 100, h), w = MODS.new.facing.armourSideFromAttack(dx * 100, dy * 100, h);
    if (o !== w) differing.push({ h, dx, dy, old: o, new: w });
  }
  // Is every difference an exact tie in the vehicle's local frame? (integer arithmetic, no trig)
  const tie = ({ h, dx, dy }) => (h % 90 === 0 ? Math.abs(dx) === Math.abs(dy) : dx === 0 || dy === 0);
  pure.facing = { compared: n, differing: differing.length, exactTies: differing.filter(tie).length, sample: differing.slice(0, 3),
    facingFromDelta: (() => { let d = 0; for (let x = -20; x <= 20; x++) for (let y = -20; y <= 20; y++) if (MODS.old.facing.facingFromDelta(x, y) !== MODS.new.facing.facingFromDelta(x, y)) d++; return `${d} differences`; })() };
}
{ // token prefix: two-argument call (unchanged signature) and the runtime handler over real NPC-like names
  const names = ["Heretic", "Cultist", "Renegade Psyker", "Feral Hound", "Savage Ork", "Hive Ganger", "Twisted Mutant", "Chaos Spawn", "Rabid Dog", "Guardsman", "Outcast Scum", "Damned Soul", "Hunted Man"];
  const P = MODS.new.prefix.PREFIXES;
  let twoArg = 0;
  for (const n of [...names, ...names.map((x) => `Filthy ${x}`), ...names.map((x) => `Vile ${x} (2)`)]) if (MODS.old.prefix.stripKnownPrefix(n, P) !== MODS.new.prefix.stripKnownPrefix(n, P)) twoArg++;
  const runtime = [];
  const seeded = () => { let s = 7; const r = Math.random; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647; return () => { Math.random = r; }; };
  for (const actorName of names) for (const tokenName of [actorName, `Filthy ${actorName}`, `${actorName} (2)`, `Filthy ${actorName} (2)`, `Vile ${actorName} Sergeant`]) {
    const out = {};
    for (const tree of ["old", "new"]) {
      const restore = seeded();
      const tok = { name: tokenName, actorLink: false, actorId: "a1", actor: { type: "npc", name: actorName, prototypeToken: { name: actorName } }, parent: { id: "s", tokens: [] }, updateSource(d) { Object.assign(this, d); } };
      MODS[tree].prefix.applyTokenPrefix(tok); restore(); out[tree] = tok.name;
    }
    if (out.old !== out.new) runtime.push({ actor: actorName, dropped: tokenName, old: out.old, new: out.new });
  }
  pure.tokenPrefix = { twoArgumentCallDifferences: twoArg, runtimeDifferences: runtime };
}
{ // region templates
  const placed = {};
  for (const tree of ["old", "new"]) {
    placed[tree] = [];
    canvas.regions.placeRegion = async (data) => { placed[tree].push(JSON.parse(JSON.stringify(data))); return null; };
    canvas.grid.getCenterPoint = (p) => p; canvas.mousePosition = { x: 50, y: 50 };
    await MODS[tree].region.placeConeRegion({ center: { x: 10, y: 20 } }, 20, 30);
    await MODS[tree].region.placeBlastRegion(3);
    const created = []; await MODS[tree].region.createBlastRegion({ createEmbeddedDocuments: async (_t, d) => { created.push(...JSON.parse(JSON.stringify(d))); return d; } }, 100, 100, 3);
    placed[tree].push(...created);
  }
  pure.regionTemplates = diff(placed.old, placed.new).map((d) => `${d.path}: ${JSON.stringify(d.old)} → ${JSON.stringify(d.new)}`);
  canvas.regions.placeRegion = async () => null;
}

// ---------------------------------------------------------------------------------------------
// GROUP 10 — sheet view-models
// ---------------------------------------------------------------------------------------------
const sheets = {};
{
  const { BDH } = await import(url("new/scripts/config.mjs"));
  const build = () => {
    const characteristics = {}; for (const k of Object.keys(BDH.characteristics)) characteristics[k] = { base: 32, advance: 5, unnatural: 0, total: 37, bonus: 3 };
    const skills = {}; for (const [k, c] of Object.entries(BDH.skills)) skills[k] = c.specialist ? { specialties: [{ id: "s1", name: "Imperium", rank: "trained", favourite: true, total: 47 }] } : { rank: "known", favourite: k === "dodge", total: 37 };
    const system = { characteristics, skills, wounds: { value: 3, max: 12, critical: 0 }, fatigue: { value: 1, max: 6, maxOverride: null }, fate: { value: 2, max: 3 },
      size: 4, corruption: 12, insanity: 8, psyRating: 2, psykerClass: "bound", notes: "", afflictions: { mutations: [{ name: "Brute", description: "" }], malignancies: [], mentalDisorders: [] },
      injuries: [{ type: "charDamage", description: "", characteristic: "toughness", amount: 3 }], advancementLog: [], aptitudes: ["Strength"], alignment: "unaligned",
      experience: { total: 1000, spent: 400 }, initiative: { characteristic: "agility", dice: "1d10", baseKind: "characteristic", flat: 0, modifier: 0 },
      movementBase: { kind: "characteristic", characteristic: "agility", flat: 0, multiplier: 1, modifier: 0 }, movement: { half: 3, full: 6, charge: 9, run: 18 }, carryMod: 0 };
    const flagless = (o) => ({ ...o, getFlag: () => undefined });
    const items = [
      flagless({ id: "w1", type: "weapon", name: "Lasgun", system: { ...WEAPONS.lasgun, weight: 4, equipped: true, stashed: false, hordeEquipped: false, clip: { value: 20, max: 60 }, ammo: [{ name: "Charge pack", count: 3 }], mods: [], loadedAmmo: null } }),
      flagless({ id: "w2", type: "weapon", name: "Sword", system: { ...WEAPONS.sword, weight: 1.5, equipped: true, stashed: false, hordeEquipped: false, clip: { value: 0, max: 0 }, rateOfFire: { single: 0, short: 0, long: 0 }, range: 0, ammo: [{ count: 3 }], mods: [], loadedAmmo: null } }),
      flagless({ id: "g1", type: "gear", name: "Ration", system: { description: "Food.\nMore.", weight: 0.1, quantity: 3, stashed: false, craftsmanship: "normal", bonuses: [] } }),
      flagless({ id: "a1", type: "armour", name: "Flak", system: { equipped: true, stashed: false, additive: false, weight: 11, locations: { head: 4, body: 4, rightArm: 4, leftArm: 4, rightLeg: 4, leftLeg: 4 }, maxAgility: 0, bonuses: [], grants: [], mods: [] } }),
      flagless({ id: "t1", type: "talent", name: "Ambidextrous", system: { description: "", tier: 1, favourite: true, purchased: true, aptitudes: [], alignment: "unaligned" } }),
      flagless({ id: "c1", type: "cybernetic", name: "Bionic Arm", system: { description: "", installed: true, bonuses: [], statMods: [{ stat: "wounds", amount: 2 }], grants: [] } }),
      flagless({ id: "p1", type: "psychicPower", name: "Smite", system: { ...POWER_DEFAULTS, description: "", favourite: false, purchased: true } }),
    ];
    const a = makeActor({ id: "SHEET", system, items });
    a._source = { system: JSON.parse(JSON.stringify(system)) };
    a._source.system.wounds.max = 10;    // stored 10; +2 from the cybernetic gives the derived 12 above
    return a;
  };
  const ctx = {};
  for (const tree of ["old", "new"]) {
    SETTINGS = { ...BASE_SETTINGS };
    const sheet = new MODS[tree].actorSheet.DarkHeresyActorSheet({ document: build() });
    try { ctx[tree] = normalise(await sheet._prepareContext({})); } catch (e) { ctx[tree] = { error: `${e.constructor.name}: ${e.message}` }; }
    delete ctx[tree].document; delete ctx[tree].system;
  }
  sheets.actorContext = diff(ctx.old, ctx.new).map((d) => `${d.path}: ${JSON.stringify(d.old)} → ${JSON.stringify(d.new)}`);
  sheets.actorContextKeys = Object.keys(ctx.new).length;
  for (const [name, cls, mod] of [["actor", "DarkHeresyActorSheet", "actorSheet"], ["item", "DarkHeresyItemSheet", "itemSheet"], ["vehicle", "VehicleSheet", "vehicleSheet"]]) {
    const o = Object.keys(MODS.old[mod][cls].DEFAULT_OPTIONS.actions).sort(), w = Object.keys(MODS.new[mod][cls].DEFAULT_OPTIONS.actions).sort();
    sheets[`${name}Actions`] = { old: o.length, new: w.length, sameNames: JSON.stringify(o) === JSON.stringify(w) };
  }
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
console.warn = origWarn;
const byGroup = {};
for (const r of results) (byGroup[r.group] ??= []).push(r);
const summary = {};
const classify = (d) => d.path.replace(/\.\d+(\.|$)/g, ".#$1").replace(/^messages\.#\./, "messages[].").replace(/^state\.(\w+)\./, "state.<actor>.");
for (const [g, rs] of Object.entries(byGroup)) {
  const changed = rs.filter((r) => r.diffs.length || r.oldError !== r.newError);
  const patterns = {};
  for (const r of changed) for (const d of r.diffs) { const k = classify(d); (patterns[k] ??= { n: 0, example: null }).n++; patterns[k].example ??= { scenario: r.name, old: d.old, new: d.new }; }
  summary[g] = { scenarios: rs.length, identical: rs.length - changed.length, changed: changed.length,
    errors: { old: rs.filter((r) => r.oldError).length, new: rs.filter((r) => r.newError).length }, patterns };
}
const out = { summary, gating, pure, sheets };
fs.writeFileSync(`${D}/scenarios-result.json`, JSON.stringify({ ...out, results: VERBOSE ? results : undefined }, null, 1));
const short = (v) => { const s = JSON.stringify(v); return s === undefined ? "undefined" : s.length > 110 ? `${s.slice(0, 110)}…` : s; };
for (const [g, s] of Object.entries(summary)) {
  console.log(`\n### ${g}: ${s.scenarios} scenarios — ${s.identical} identical, ${s.changed} differ  (threw: old ${s.errors.old}, new ${s.errors.new})`);
  for (const [p, v] of Object.entries(s.patterns).sort((a, b) => b[1].n - a[1].n)) console.log(`   ${String(v.n).padStart(5)} × ${p}\n           e.g. [${v.example.scenario}]  ${short(v.example.old)}  →  ${short(v.example.new)}`);
}
console.log(`\n### chat-card button visibility (card kind × GM/player × target owned / not owned / none / deleted): ${gating.length ? "differences" : "identical"}`);
{ // the same change usually applies to several card kinds — report it once
  const grouped = new Map();
  for (const g of gating) { const key = `${g.user}, target ${g.target}:  gained [${g.gained}]  lost [${g.lost}]`; grouped.set(key, [...(grouped.get(key) ?? []), g.kind]); }
  for (const [key, kinds] of grouped) console.log(`   ${key}   (on: ${kinds.join(", ")})`);
}
console.log(`\n### pure helpers${hasCorpus ? " over the compendium corpus" : " (no compendium corpus given — fixtures only; pass --corpus=<dir>)"}:`);
{
  const ew = pure.effectiveWeapon;
  const parts = [...new Set(ew.differing.map((d) => d.label.split(" + ")[1]).filter(Boolean))];
  console.log(`   effectiveWeapon: ${ew.compared} weapon/part combinations — ${ew.differing.length} differ${parts.length ? `; parts involved: ${parts.join(", ")}` : ""}; bare weapons differing: ${ew.differing.filter((d) => !d.label.includes(" + ")).length}`);
  for (const d of ew.differing.slice(0, 3)) console.log(`        e.g. ${d.label}:  ${d.old}  →  ${d.new}`);
  const cw = pure.carriedWeight;
  console.log(`   carriedWeight: ${cw.compared} random inventories — ${cw.differing} differ${cw.differing ? `, by at most ${cw.maxDelta.toExponential(1)} kg` : ""}`);
  const f = pure.facing;
  console.log(`   armourSideFromAttack: ${f.compared} positions — ${f.differing} differ${f.differing ? ` (${f.exactTies} of them exact ties between two facings)` : ""}; facingFromDelta: ${f.facingFromDelta}`);
  const tp = pure.tokenPrefix;
  console.log(`   token prefix: two-argument stripKnownPrefix differences: ${tp.twoArgumentCallDifferences}; applyTokenPrefix differences: ${tp.runtimeDifferences.length}${tp.runtimeDifferences.length ? ` (actors: ${[...new Set(tp.runtimeDifferences.map((d) => d.actor))].join(", ")})` : ""}`);
  for (const d of tp.runtimeDifferences.slice(0, 3)) console.log(`        e.g. "${d.dropped}" on actor "${d.actor}":  ${d.old}  →  ${d.new}`);
  console.log(`   region templates: ${pure.regionTemplates.length ? pure.regionTemplates.join("; ") : "identical"}`);
}
console.log("\n### actor sheet view-model:");
console.log(`   ${sheets.actorContextKeys} keys — ${sheets.actorContext.length ? `differences: ${sheets.actorContext.join("; ")}` : "identical"}`);
for (const k of ["actor", "item", "vehicle"]) { const a = sheets[`${k}Actions`]; console.log(`   ${k} sheet actions: ${a.old} → ${a.new}, same names: ${a.sameNames}`); }
