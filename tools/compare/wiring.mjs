// tools/compare/wiring.mjs — the GLOBAL side of tools/compare/scenarios.mjs (read that header first).
//
// Loads the system's entry module (scripts/better-dh2e.mjs) from old/ and from new/, runs its
// init / setup / ready hooks against recording stand-ins, and compares everything it wires up:
// hook registrations, Handlebars helpers, sheet registrations, CONFIG (document classes, data
// models, status effects, initiative), every setting, and every data-model schema field by field.
// Then runs the registered hook handlers with the same inputs, and drives EVERY sheet action of
// the three sheets through both copies, comparing each one's document writes, chat cards and rolls.
//
// Do not run this directly — `npm run compare` (tools/compare/run.sh) builds the two copies first.
//   node wiring.mjs <dir containing old/ and new/>
//
// Same limit as scenarios.mjs: test stubs, not Foundry. A sheet action that throws the SAME error
// in both copies for a generated input (Reload on something that is not a weapon, say) is only
// compared up to that point; those are listed in the report.
import { pathToFileURL } from "node:url";
import fs from "node:fs";

const D = process.argv[2];
const url = (p) => pathToFileURL(`${D}/${p}`).href;
const stub = await import(url("new/test/helpers/foundry-stub.mjs"));
const sheetStub = await import(url("new/test/helpers/sheet-stub.mjs"));
const { makeActor, makeWeapon, registerUuid, resetCaptures, capturedMessages, capturedRolls, applyDotUpdate, primeDice, primeDialog, makeChoice } = stub;
const NS = "better-dh2e";

let SETTINGS = { enableBattlemap: true, homebrewQualities: true, enableHordes: true, reverseWounds: false, maleficCorruption: true,
  advancementRules: "dh2", sheetHeaderStyle: "dh2", psychicRules: "dh2", lockCustomMode: false, tokenPrefixes: true, coverMechanics: true,
  uiTheme: "classic", uiChrome: false, diceTray: true, coverTemplates: [] };

sheetStub.installSheetStub({});
ui.notifications.warn = () => {}; ui.notifications.error = () => {}; ui.notifications.info = () => {};
console.warn = () => {}; const realLog = console.log; console.log = (...a) => { if (!String(a[0]).startsWith("Better DH2e |")) realLog(...a); };

// ---- recording stand-ins for everything the entry module touches --------------------------------
const rec = () => ({ on: [], once: [], settings: [], sheets: [], helpers: [], config: null, errors: [] });
const REG = { old: rec(), new: rec() };
let cur = REG.old;
globalThis.Hooks = { on: (n, f) => { cur.on.push([n, f]); }, once: (n, f) => { cur.once.push([n, f]); }, off() {}, call: () => true, callAll() {} };
class F { constructor(a, b) { this.options = (a && !Array.isArray(a) && typeof a === "object" && !(a instanceof F)) ? a : b; } }
foundry.data = { fields: { StringField: F, NumberField: F, BooleanField: F, ArrayField: F, SchemaField: F } };
foundry.abstract = { TypeDataModel: class { static defineSchema() { return {}; } static migrateData(s) { return s; } prepareDerivedData() {} } };
foundry.applications.api.ApplicationV2 = class {};
foundry.appv1 = { sheets: { ActorSheet: class ActorSheet {}, ItemSheet: class ItemSheet {} } };
const collection = (kind) => ({ unregisterSheet: (scope, cls) => cur.sheets.push([kind, "unregister", scope, cls.name]),
  registerSheet: (scope, cls, opts) => cur.sheets.push([kind, "register", scope, cls.name, opts]) });
foundry.documents = { collections: { Actors: collection("Actors"), Items: collection("Items") } };
foundry.canvas = { placeables: { tokens: { TokenRuler: class TokenRuler {} } } };
globalThis.Actor = class Actor {}; globalThis.Item = class Item {};
globalThis.Handlebars = { registerHelper: (n) => cur.helpers.push(n) };
globalThis.document = { body: { classList: { add() {}, remove() {} } }, addEventListener() {}, removeEventListener() {}, createElement: () => ({ classList: { add() {} }, addEventListener() {}, append() {} }) };
globalThis.getDocumentClass = () => ({ create: async () => null });
game.settings.get = (_s, k) => SETTINGS[k];
game.settings.set = async (_s, k, v) => { SETTINGS[k] = v; };
game.settings.register = (scope, key, opts) => cur.settings.push([scope, key, opts]);
game.actors = []; game.messages = { get: () => null }; game.users = { activeGM: { isSelf: true } };
ui.controls = { render: (o) => cur.controlsRender.push(o ?? null) }; ui.chat = { element: null };
foundry.applications.instances = new Map();

const freshConfig = () => ({ Actor: { dataModels: {} }, Item: { dataModels: {} }, Combat: { documentClass: class Combat {} }, Combatant: { documentClass: class Combatant { _getInitiativeFormula() { return "x"; } } },
  Token: { rulerClass: class TokenRuler {} }, statusEffects: [] });

for (const tree of ["old", "new"]) {
  cur = REG[tree]; cur.controlsRender = [];
  globalThis.CONFIG = freshConfig();
  REG[tree].entry = await import(url(`${tree}/scripts/better-dh2e.mjs`));
  for (const phase of ["init", "setup", "ready"]) for (const [n, f] of [...cur.once]) if (n === phase) { try { await f(); } catch (e) { cur.errors.push(`${phase}: ${e.message}`); } }
  const cfg = globalThis.CONFIG;
  cur.config = {
    actorClass: cfg.Actor.documentClass?.name, itemClass: cfg.Item.documentClass?.name,
    combatClass: cfg.Combat.documentClass?.name, combatantClass: cfg.Combatant.documentClass?.name, rulerClass: cfg.Token.rulerClass?.name,
    actorModels: Object.fromEntries(Object.entries(cfg.Actor.dataModels).map(([k, v]) => [k, v.name])),
    itemModels: Object.fromEntries(Object.entries(cfg.Item.dataModels).map(([k, v]) => [k, v.name])),
    initiative: cfg.Combat.initiative, statusEffects: cfg.statusEffects, hasBDH: !!cfg.BDH,
  };
  cur.cfgObject = cfg;
}

// ---- A. wiring -------------------------------------------------------------------------------------
const fnText = (f) => f.toString().replace(/\s+/g, " ");
const ser = (v) => JSON.stringify(v, (k, x) => (typeof x === "function" ? (k === "type" ? `type:${x.name}` : `fn:${fnText(x)}`) : x));
const names = (list) => list.map(([n]) => n).sort();
const wiring = {
  hooksOn: { old: names(REG.old.on).length, new: names(REG.new.on).length, sameNames: ser(names(REG.old.on)) === ser(names(REG.new.on)), names: [...new Set(names(REG.new.on))] },
  hooksOnce: { old: names(REG.old.once), new: names(REG.new.once) },
  helpers: { same: ser(REG.old.helpers) === ser(REG.new.helpers), list: REG.new.helpers },
  sheets: { same: ser(REG.old.sheets) === ser(REG.new.sheets), list: REG.new.sheets.map((s) => s.slice(0, 4).join(" ")) },
  config: { same: ser(REG.old.config) === ser(REG.new.config), statusEffects: REG.new.config.statusEffects.length, actorModels: Object.keys(REG.new.config.actorModels), itemModels: Object.keys(REG.new.config.itemModels) },
  errorsDuringHooks: { old: REG.old.errors, new: REG.new.errors },
  settings: { count: { old: REG.old.settings.length, new: REG.new.settings.length }, differing: [] },
};
for (let i = 0; i < Math.max(REG.old.settings.length, REG.new.settings.length); i++) {
  const o = REG.old.settings[i], n = REG.new.settings[i];
  if (ser(o) === ser(n)) continue;
  const parts = [];
  for (const k of new Set([...Object.keys(o?.[2] ?? {}), ...Object.keys(n?.[2] ?? {})])) if (ser(o?.[2]?.[k]) !== ser(n?.[2]?.[k])) parts.push(k);
  wiring.settings.differing.push({ key: n?.[1] ?? o?.[1], differingOptions: parts });
}

// Data-model schemas: field names + every option of every field, recursively.
const schemaOf = (model) => { const walk = (f) => (f instanceof F ? { o: Object.fromEntries(Object.entries(f.options ?? {}).map(([k, v]) => [k, v instanceof F ? walk(v) : (typeof v === "function" ? fnText(v) : v)])) } : f);
  const s = model.defineSchema(); const flat = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v instanceof F ? { field: v.constructor.name, ...walk(v), inner: v.options && Object.values(v.options).some((x) => x instanceof F) ? flat(Object.fromEntries(Object.entries(v.options).filter(([, x]) => x instanceof F))) : undefined } : v])); return flat(s); };
const schemas = {};
for (const kind of ["Actor", "Item"]) for (const type of Object.keys(REG.new.cfgObject[kind].dataModels)) {
  let o, n; try { o = ser(schemaOf(REG.old.cfgObject[kind].dataModels[type])); n = ser(schemaOf(REG.new.cfgObject[kind].dataModels[type])); } catch (e) { o = `err ${e.message}`; n = "x"; }
  schemas[`${kind}.${type}`] = o === n ? "identical" : "DIFFERENT";
}
wiring.dataModelSchemas = schemas;

// ---- B. hook handlers, old vs new, same inputs ---------------------------------------------------
const handlers = (tree, name) => REG[tree].on.filter(([n]) => n === name).map(([, f]) => f);
const hookBehaviour = {};
{ // moveToken → Run condition
  const rows = [];
  for (const history of [0, 3, 9, 10, 18, 25]) for (const passed of [0, 3, 9, 18]) for (const recorded of [true, false]) for (const hasRun of [false, true]) for (const mover of [true, false]) {
    const out = {};
    for (const tree of ["old", "new"]) {
      const a = makeActor({ id: "M", system: { movement: { half: 3, full: 6, charge: 9, run: 18 } }, statuses: new Set(hasRun ? ["run"] : []) });
      const movement = { recorded, method: "dragging", history: { distance: history }, passed: { distance: passed }, pending: { distance: 0 } };
      const doc = { actor: a, movement, combatant: recorded ? { parent: { started: true } } : null };
      for (const h of handlers(tree, "moveToken")) await h(doc, movement, {}, mover ? { id: game.user.id } : { id: "other" });
      out[tree] = a.statuses.has("run");
    }
    if (out.old !== out.new) rows.push({ history, passed, recorded, hadRun: hasRun, mover, old: out.old, new: out.new });
  }
  hookBehaviour.moveToken = { cases: 6 * 4 * 2 * 2 * 2, differing: rows.length,
    recordedMoves: rows.filter((r) => r.recorded).length, unrecordedMoves: rows.filter((r) => !r.recorded).length,
    otherUsersMove: rows.filter((r) => !r.mover).length, sample: rows.slice(0, 3) };
}
{ // preUpdateActor (prototype-token name sync)
  let same = true;
  for (const [actorName, protoName, change] of [["Bob", "Bob", { name: "Rob" }], ["Bob", "Custom", { name: "Rob" }], ["Bob", "Bob", { img: "x" }], ["Bob", "Bob", { name: "Bob" }]]) {
    const out = {};
    for (const tree of ["old", "new"]) { const c = JSON.parse(JSON.stringify(change)); foundry.utils.setProperty = (o, p, v) => applyDotUpdate(o, { [p]: v });
      for (const h of handlers(tree, "preUpdateActor")) h({ name: actorName, prototypeToken: { name: protoName } }, c); out[tree] = JSON.stringify(c); }
    if (out.old !== out.new) same = false;
  }
  hookBehaviour.preUpdateActor = same ? "identical" : "DIFFERENT";
}
{ // scene-control buttons
  let same = true; const seen = [];
  for (const cover of [true, false]) for (const isGM of [true, false]) {
    const out = {};
    for (const tree of ["old", "new"]) { SETTINGS.coverMechanics = cover; game.user.isGM = isGM; const controls = { tokens: { tools: {} } };
      for (const h of handlers(tree, "getSceneControlButtons")) h(controls); out[tree] = Object.keys(controls.tokens.tools).sort().join(","); }
    if (out.old !== out.new) same = false; seen.push(`cover=${cover} GM=${isGM}: [${out.new}]`);
  }
  SETTINGS.coverMechanics = true; game.user.isGM = true;
  hookBehaviour.getSceneControlButtons = { identical: same, seen };
}
for (const name of ["getChatMessageContextOptions", "getActorContextOptions"]) {
  const out = {};
  for (const tree of ["old", "new"]) { const opts = []; for (const h of handlers(tree, name)) h(null, opts); out[tree] = opts.map((o) => `${o.name}|${o.icon}`).join(";"); }
  hookBehaviour[name] = out.old === out.new ? `identical (${out.new.split(";").length} entries)` : "DIFFERENT";
}

// ---- C. every sheet action, old vs new -----------------------------------------------------------
const { BDH } = await import(url("new/scripts/config.mjs"));
function instrument(doc, log) {
  doc.update = async (c, o) => { log.push(["update", doc.id, c]); applyDotUpdate(doc, c); return doc; };
  doc.setFlag = async (ns, k, v) => { log.push(["setFlag", doc.id, k, v]); (doc.flags[ns] ??= {})[k] = v; return doc; };
  doc.unsetFlag = async (ns, k) => { log.push(["unsetFlag", doc.id, k]); delete doc.flags?.[ns]?.[k]; return doc; };
  doc.toggleStatusEffect = async (id, o) => { log.push(["status", doc.id, id, o]); return true; };
  doc.createEmbeddedDocuments = async (t, docs) => { log.push(["create", t, docs]); return docs.map((d, i) => ({ ...d, id: `made-${i}`, uuid: `Item.made-${i}`, sheet: { render() { log.push(["openSheet", `made-${i}`]); } } })); };
  doc.deleteEmbeddedDocuments = async (t, ids) => { log.push(["deleteEmbedded", t, ids]); };
  doc.updateEmbeddedDocuments = async (t, updates) => { log.push(["updateEmbedded", t, updates]); for (const u of updates) { const it = doc.items.get(u._id); if (it) applyDotUpdate(it, Object.fromEntries(Object.entries(u).filter(([k]) => k !== "_id"))); } };
  for (const it of doc.items ?? []) {
    it.update = async (c) => { log.push(["item.update", it.id, c]); applyDotUpdate(it, c); return it; };
    it.delete = async () => { log.push(["item.delete", it.id]); };
    it.sheet = { render() { log.push(["openSheet", it.id]); } };
    it.getFlag = it.getFlag ?? (() => undefined);
    it.uuid = it.uuid ?? `Actor.${doc.id}.Item.${it.id}`;
    it.parent = doc;
  }
  return doc;
}
const ITEM = {
  weapon: () => ({ id: "w1", type: "weapon", name: "Lasgun", system: { weaponClass: "basic", weaponType: "las", damage: "1d10+3", damageType: "energy", penetration: 0, qualities: [{ key: "reliable", value: null }], range: 100, rateOfFire: { single: 1, short: 3, long: 0 }, weight: 4, equipped: true, stashed: false, hordeEquipped: false, clip: { value: 20, max: 60 }, ammo: [{ uuid: "", name: "Charge pack", count: 3, attackMod: 0, damageMod: "", penMod: 0, special: "", damageType: "", qualities: [] }], mods: [{ uuid: "", name: "Sight", attackMod: 10, damageMod: "", penMod: 0, special: "" }], loadedAmmo: null, craftsmanship: "normal", special: "", reload: "full" } }),
  melee: () => ({ id: "w2", type: "weapon", name: "Sword", system: { weaponClass: "melee", weaponType: "lowTech", damage: "1d10", damageType: "rending", penetration: 0, qualities: [], range: 0, rateOfFire: { single: 0, short: 0, long: 0 }, weight: 1.5, equipped: false, stashed: false, hordeEquipped: false, clip: { value: 0, max: 0 }, ammo: [], mods: [], loadedAmmo: null, craftsmanship: "best", special: "", reload: "full" } }),
  gear: () => ({ id: "g1", type: "gear", name: "Ration", system: { description: "Food.", weight: 0.1, quantity: 3, stashed: false, craftsmanship: "normal", availability: "common", bonuses: [{ kind: "skill", key: "dodge", amount: 10, situational: true }] } }),
  armour: () => ({ id: "a1", type: "armour", name: "Flak", system: { description: "", equipped: true, stashed: false, additive: false, weight: 11, craftsmanship: "normal", availability: "average", locations: { head: 4, body: 4, rightArm: 4, leftArm: 4, rightLeg: 4, leftLeg: 4 }, maxAgility: 0, bonuses: [], grants: [], mods: [{ uuid: "", name: "Ceramite" }] } }),
  armour2: () => ({ id: "a2", type: "armour", name: "Carapace", system: { description: "", equipped: false, stashed: false, additive: false, weight: 15, craftsmanship: "normal", availability: "rare", locations: { head: 6, body: 6, rightArm: 6, leftArm: 6, rightLeg: 6, leftLeg: 6 }, maxAgility: 45, bonuses: [], grants: [], mods: [] } }),
  field: () => ({ id: "f1", type: "forceField", name: "Refractor", system: { description: "", equipped: false, stashed: false, weight: 2, protectionRating: 30, overload: 5, craftsmanship: "normal", availability: "rare" } }),
  talent: () => ({ id: "t1", type: "talent", name: "Ambidextrous", system: { description: "", tier: 1, prerequisites: "", favourite: false, purchased: false, aptitudes: ["Strength", "Offence"], alignment: "unaligned" } }),
  trait: () => ({ id: "tr1", type: "trait", name: "Dark-sight", system: { description: "", favourite: false, bonuses: [], statMods: [{ stat: "wounds", amount: 2 }], grants: [] } }),
  cybernetic: () => ({ id: "c1", type: "cybernetic", name: "Bionic Arm", system: { description: "", installed: true, craftsmanship: "normal", availability: "rare", bonuses: [{ kind: "characteristic", key: "strength", amount: 10, situational: false }], statMods: [], grants: [] } }),
  power: () => ({ id: "p1", type: "psychicPower", name: "Smite", system: { description: "", discipline: "telekinesis", type: "bolt", prerequisite: "", focusTest: "willpower", focusModifier: 0, opposed: false, opposedBy: "willpower", range: "20m", sustained: "no", duration: "", action: "half", damage: "1d10+PR", damageType: "energy", penetration: "2", blastRadius: "0", qualities: [], cost: 200, favourite: false, purchased: false } }),
};
function sheetActor(type = "acolyte") {
  const characteristics = {}; for (const k of Object.keys(BDH.characteristics)) characteristics[k] = { base: 32, advance: 5, unnatural: 0, total: 37, bonus: 3 };
  const skills = {}; for (const [k, c] of Object.entries(BDH.skills)) skills[k] = c.specialist ? { specialties: [{ id: "s1", name: "Imperium", rank: "trained", favourite: false, total: 47 }, { id: "s2", name: "War", rank: "known", favourite: true, total: 37 }] } : { rank: "known", favourite: k === "dodge", total: 37 };
  const system = { characteristics, skills, wounds: { value: 5, max: 12, critical: 0 }, fatigue: { value: 2, max: 6, maxOverride: null }, fate: { value: 2, max: 3 },
    size: 4, magnitude: 20, corruption: 12, insanity: 8, psyRating: 2, psykerClass: "bound", notes: "", afflictions: { mutations: [{ name: "Brute", description: "" }, { name: "Scales", description: "x" }], malignancies: [{ name: "M", description: "" }], mentalDisorders: [] },
    injuries: [{ type: "charDamage", description: "", characteristic: "toughness", amount: 3 }, { type: "injury", description: "Broken arm", characteristic: "", amount: 0 }],
    advancementLog: [{ type: "skill", label: "Dodge", detail: "→ Known", cost: 100, ref: "dodge", specialtyId: "", toRank: "known", god: "" }], aptitudes: ["Strength", "Agility"], alignment: "unaligned",
    experience: { total: 5000, spent: 400 }, initiative: { characteristic: "agility", dice: "1d10", baseKind: "characteristic", flat: 0, modifier: 0 },
    movementBase: { kind: "characteristic", characteristic: "agility", flat: 0, multiplier: 1, modifier: 0 }, movement: { half: 3, full: 6, charge: 9, run: 18 }, carryMod: 0,
    bio: { homeWorld: "", background: "", role: "", elite: "" } };
  const a = makeActor({ id: "SA", type, system, items: Object.values(ITEM).map((f) => f()), flags: { [NS]: { sustained: [{ powerId: "p1", name: "Smite", castEffPR: 2, sustainAction: "half" }] } } });
  a._source = { system: JSON.parse(JSON.stringify(system)) };
  a.getActiveTokens = () => [];
  return a;
}
const target = (dataset) => { const t = { dataset, closest: () => t, querySelector: () => ({ value: "Strength" }), value: "7", checked: true }; return t; };
game.folders = { find: () => ({ id: "folder-1" }) };
globalThis.Folder = { create: async () => ({ id: "folder-1" }) };
globalThis.getDocumentClass = () => ({ create: async (d) => ({ ...d, id: "world-made", uuid: "Item.world-made", sheet: { render() {} } }) });
async function runAction(tree, sheetMod, cls, action, build, dataset, prep = () => {}) {
  resetCaptures(); game.user.isGM = true; game.user.targets = { first: () => null };
  const log = []; const doc = instrument(build(), log);
  const sheet = new REG[tree][sheetMod][cls]({ document: doc });
  sheet.render = () => { log.push(["render"]); };
  prep(sheet);
  primeDice([33, 4, 7, 2, 9, 5, 61, 8, 3, 6]);
  if (["rollAttack", "fireSeatWeapon"].includes(action)) primeDialog([makeChoice()]);
  if (action === "spendFate") primeDialog([dataset.fateChoice]);
  let error = null;
  try { await (async () => REG[tree][sheetMod][cls].DEFAULT_OPTIONS.actions[action].call(sheet, { preventDefault() {}, stopPropagation() {}, shiftKey: false }, target(dataset)))(); await sheet._writes?.idle(); }
  catch (e) { error = `${e.constructor.name}: ${e.message}`; }
  return JSON.stringify({ error, log, mode: sheet._advancementMode, hide: sheet._hideUntrained, msgs: capturedMessages().map((m) => [m.content, m.flags ?? null]), rolls: capturedRolls() }, (_k, v) => (v instanceof Set ? [...v] : v))
    .replace(/id-\d+/g, "id-#").replace(/"at":\d+/g, '"at":0');
}
for (const tree of ["old", "new"]) REG[tree].sheets_ = { actor: await import(url(`${tree}/scripts/sheets/actor-sheet.mjs`)), item: await import(url(`${tree}/scripts/sheets/item-sheet.mjs`)), vehicle: await import(url(`${tree}/scripts/sheets/vehicle-sheet.mjs`)) };
for (const tree of ["old", "new"]) { REG[tree].actor = REG[tree].sheets_.actor; REG[tree].item = REG[tree].sheets_.item; REG[tree].vehicle = REG[tree].sheets_.vehicle; }

const sheetActions = { actor: { runs: 0, differing: [], throwsInBoth: new Set() }, item: { runs: 0, differing: [], throwsInBoth: new Set() }, vehicle: { runs: 0, differing: [], throwsInBoth: new Set() } };
async function compareAction(kind, cls, action, build, dataset, label, prep) {
  const o = await runAction("old", kind, cls, action, build, dataset, prep), n = await runAction("new", kind, cls, action, build, dataset, prep);
  sheetActions[kind].runs++;
  if (JSON.parse(o).error && JSON.parse(o).error === JSON.parse(n).error) sheetActions[kind].throwsInBoth.add(`${action}: ${JSON.parse(o).error.slice(0, 60)}`);
  if (o !== n) sheetActions[kind].differing.push({ action, label, old: o, new: n });
}
{ // actor sheet: every action × every item × every advancement mode × actor type
  const actions = Object.keys(REG.new.actor.DarkHeresyActorSheet.DEFAULT_OPTIONS.actions);
  const itemIds = [...Object.values(ITEM).map((f) => f().id), "no-such-item"];
  for (const type of ["acolyte", "npc", "horde"]) for (const mode of ["none", "custom", "simple"]) for (const action of actions) for (const itemId of itemIds) {
    const dataset = { itemId, powerId: itemId, index: "0", skill: itemId === "w1" ? "commonLore" : "dodge", specialty: itemId === "w1" ? "0" : "", characteristic: "strength", type: itemId === "g1" ? "malignancy" : "talent",
      array: "mutations", mode: mode === "none" ? "custom" : "simple", delta: "1", aptitude: "Strength", rank: "trained", key: "strength", field: "name", god: "khorne", value: "5",
      fateChoice: ["wounds", "fatigue", "stun"][itemIds.indexOf(itemId) % 3] };
    await compareAction("actor", "DarkHeresyActorSheet", action, () => sheetActor(type), dataset, `${type}/${mode}/${itemId}`, (s) => { s._advancementMode = mode; });
  }
}
{ // item sheet: every action on every item type, standalone and owned
  const actions = Object.keys(REG.new.item.DarkHeresyItemSheet.DEFAULT_OPTIONS.actions);
  for (const [name, make] of Object.entries(ITEM)) for (const owned of [false, true]) for (const action of actions) for (const index of ["0", "5"]) {
    const build = () => { const it = make(); it.flags = {}; it.items = undefined; it.uuid = `Item.${it.id}`; it.parent = owned ? sheetActor() : null; it.getFlag = () => undefined; it.isOwner = true; return it; };
    await compareAction("item", "DarkHeresyItemSheet", action, build, { index, uuid: "Item.none", partUuid: "", aptitude: "Strength", type: "talent" }, `${name}/${owned ? "owned" : "world"}/${index}`);
  }
}
{ // vehicle sheet
  const actions = Object.keys(REG.new.vehicle.VehicleSheet.DEFAULT_OPTIONS.actions);
  const build = (armed) => () => { const w = ITEM.weapon(); const drv = makeActor({ id: "DRV", system: { skills: { operate: { specialties: [{ name: "Wheeled", rank: "trained" }] } } } }); registerUuid(drv.uuid, drv);
    return makeActor({ id: "VEH", type: "vehicle", items: [w], system: { vehicleType: "wheeled", manoeuvrability: 10, armour: { front: 20, left: 16, right: 16, rear: 12 }, integrity: { value: 3, max: 30 }, conditions: ["Tracked", ""],
      crew: [{ role: "Driver", fixed: true, actorUuid: drv.uuid, operate: "Wheeled", weapons: [] }, { role: "Gunner", fixed: false, actorUuid: armed ? drv.uuid : "", operate: "", weapons: armed ? ["w1"] : [] }, { role: "Crew", fixed: false, actorUuid: "", operate: "", weapons: [] }] } }); };
  for (const armed of [true, false]) for (const action of actions) for (const index of ["0", "1", "2", "9"]) {
    await compareAction("vehicle", "VehicleSheet", action, build(armed), { index, seat: index, itemId: "w1" }, `${armed ? "armed" : "unarmed"} gunner / index ${index}`);
  }
}

// ---- C2. item + vehicle sheet view-models --------------------------------------------------------
const contexts = {};
{
  const norm = (v) => JSON.stringify(v, (k, x) => (k === "document" || k === "item" || k === "actor" ? undefined : x instanceof Set ? [...x] : x));
  let differing = 0, n = 0; const errs = new Set();
  for (const [name, make] of Object.entries(ITEM)) for (const owned of [false, true]) {
    const out = {};
    for (const tree of ["old", "new"]) {
      const it = make(); it.flags = {}; it.uuid = `Item.${it.id}`; it.parent = owned ? sheetActor() : null; it.getFlag = () => undefined; it.isOwner = true;
      try { out[tree] = norm(await new REG[tree].item.DarkHeresyItemSheet({ document: it })._prepareContext({})); } catch (e) { out[tree] = `ERR ${e.message}`; errs.add(e.message.slice(0, 50)); }
    }
    n++; if (out.old !== out.new) differing++;
  }
  contexts.itemSheet = { compared: n, differing, throwsInBoth: [...errs] };
  const out = {};
  for (const tree of ["old", "new"]) {
    const drv = makeActor({ id: "DRV2", system: { skills: { operate: { specialties: [{ name: "Wheeled", rank: "trained" }] } } } }); registerUuid(drv.uuid, drv);
    const veh = makeActor({ id: "VEH2", type: "vehicle", items: [ITEM.weapon()], system: { vehicleType: "wheeled", manoeuvrability: 10, armour: { front: 20, left: 16, right: 16, rear: 12 }, integrity: { value: 3, max: 30 }, conditions: ["Tracked"],
      crew: [{ role: "Driver", fixed: true, actorUuid: drv.uuid, operate: "Wheeled", weapons: [] }, { role: "Gunner", fixed: false, actorUuid: "", operate: "", weapons: ["w1"] }] } });
    try { out[tree] = norm(await new REG[tree].vehicle.VehicleSheet({ document: veh })._prepareContext({})); } catch (e) { out[tree] = `ERR ${e.message}`; }
  }
  contexts.vehicleSheet = out.old === out.new ? (out.old.startsWith("ERR") ? `both throw: ${out.old}` : "identical") : "DIFFERENT";
}

// ---- D. part-source sync for a GM, world actors only -------------------------------------------
const partSync = {};
{
  const out = {};
  for (const tree of ["old", "new"]) {
    const parts = await import(url(`${tree}/scripts/weapons/parts.mjs`));
    const src = { uuid: "Item.src", type: "weaponMod", name: "Red-dot", system: { attackMod: 10, damageMod: "+1", penMod: 0, special: "" } };
    const mk = (id) => { const w = makeWeapon({ id, system: { mods: [{ uuid: "Item.src", name: "New", attackMod: 0, damageMod: "", penMod: 0, special: "" }], ammo: [] } }); return makeActor({ id: `A-${id}`, items: [w] }); };
    const a1 = mk("x1"), a2 = mk("x2"); const worldWeapon = makeWeapon({ id: "x3", system: { mods: [{ uuid: "Item.src", name: "New", attackMod: 0, damageMod: "", penMod: 0, special: "" }], ammo: [] } });
    game.actors = [a1, a2]; game.items = [worldWeapon]; canvas.tokens.placeables = [];
    await parts.refreshWeaponsReferencing(src);
    const afterRefresh = [a1, a2].map((a) => a.items[0].system.mods).concat([worldWeapon.system.mods]);
    await parts.purgeDeletedPartSource("Item.src");
    out[tree] = JSON.stringify({ afterRefresh, afterPurge: [a1, a2].map((a) => a.items[0].system.mods).concat([worldWeapon.system.mods]) });
  }
  game.actors = []; game.items = [];
  partSync.worldActorsAndWorldItems = out.old === out.new ? "identical" : "DIFFERENT";
}

for (const k of Object.keys(sheetActions)) sheetActions[k].throwsInBoth = [...sheetActions[k].throwsInBoth].slice(0, 6);
const out = { wiring, hookBehaviour, contexts, sheetActions: Object.fromEntries(Object.entries(sheetActions).map(([k, v]) => [k, { runs: v.runs, differing: v.differing.length, differingActions: [...new Set(v.differing.map((d) => d.action))], examples: v.differing.slice(0, 3), throwsInBoth: v.throwsInBoth }])), partSync };
fs.writeFileSync(`${D}/wiring-result.json`, JSON.stringify({ ...out, allDiffering: sheetActions }, null, 1));
{
  const w = wiring, yn = (b) => (b ? "identical" : "DIFFERENT");
  realLog("### startup wiring");
  realLog(`   hooks registered: ${w.hooksOn.old} → ${w.hooksOn.new}, ${w.hooksOn.sameNames ? "same names" : "NAMES DIFFER"}; once-hooks: ${w.hooksOnce.old.join(", ")} → ${w.hooksOnce.new.join(", ")}`);
  realLog(`   Handlebars helpers: ${yn(w.helpers.same)}; sheet registrations: ${yn(w.sheets.same)}; CONFIG (document classes, data models, ${w.config.statusEffects} status effects, initiative): ${yn(w.config.same)}`);
  const schemas = Object.entries(w.dataModelSchemas);
  realLog(`   data-model schemas: ${schemas.filter(([, v]) => v === "identical").length}/${schemas.length} identical${schemas.some(([, v]) => v !== "identical") ? ` — DIFFERENT: ${schemas.filter(([, v]) => v !== "identical").map(([k]) => k).join(", ")}` : ""}`);
  realLog(`   settings: ${w.settings.count.old} → ${w.settings.count.new}; differing: ${w.settings.differing.length ? w.settings.differing.map((d) => `${d.key} (${d.differingOptions.join(", ")})`).join("; ") : "none"}`);
  if (w.errorsDuringHooks.old.length || w.errorsDuringHooks.new.length) realLog(`   errors while running hooks — old: ${JSON.stringify(w.errorsDuringHooks.old)}  new: ${JSON.stringify(w.errorsDuringHooks.new)}`);
  realLog("\n### hook handlers, same inputs");
  const mt = hookBehaviour.moveToken;
  realLog(`   moveToken (Run condition): ${mt.differing}/${mt.cases} cases differ${mt.differing ? ` — ${mt.recordedMoves} on recorded moves, ${mt.unrecordedMoves} on unrecorded ones, ${mt.otherUsersMove} on another user's move` : ""}`);
  for (const r of mt.sample) realLog(`        e.g. history ${r.history} m + this leg ${r.passed} m, recorded=${r.recorded}, had Run=${r.hadRun}:  Run ${r.old}  →  ${r.new}`);
  realLog(`   preUpdateActor: ${hookBehaviour.preUpdateActor}; scene-control buttons: ${yn(hookBehaviour.getSceneControlButtons.identical)}; chat context menu: ${hookBehaviour.getChatMessageContextOptions}; actor context menu: ${hookBehaviour.getActorContextOptions}`);
  realLog("\n### sheet actions — every action, every item, every mode");
  for (const [k, v] of Object.entries(out.sheetActions)) {
    realLog(`   ${k} sheet: ${v.runs} runs — ${v.differing} differ${v.differing ? ` (${v.differingActions.join(", ")})` : ""}`);
    for (const e of v.examples) {   // show where the two diverge, not their identical beginnings
      let at = 0; while (at < e.old.length && e.old[at] === e.new[at]) at++;
      const from = Math.max(0, at - 30), cut = (s) => `${from ? "…" : ""}${s.slice(from, from + 170)}`;
      realLog(`        e.g. ${e.action} [${e.label}]\n             old: ${cut(e.old)}\n             new: ${cut(e.new)}`);
    }
    if (v.throwsInBoth.length) realLog(`        compared only up to an identical error for some inputs: ${v.throwsInBoth.map((t) => t.split(":")[0]).join(", ")}`);
  }
  realLog(`\n### sheet view-models: item sheet ${contexts.itemSheet.differing}/${contexts.itemSheet.compared} differ; vehicle sheet ${contexts.vehicleSheet}`);
  realLog(`### part-source sync (world actors and items): ${partSync.worldActorsAndWorldItems}`);
}
