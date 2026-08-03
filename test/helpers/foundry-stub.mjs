// test/helpers/foundry-stub.mjs
// Minimal Foundry VTT global stub for exercising scripts/rolls/attack.mjs (and roll-test.mjs, which it
// imports) outside a real Foundry runtime.
//
// attack.mjs and roll-test.mjs both destructure `foundry.applications.*` at MODULE SCOPE, so
// installFoundryStub() MUST run and set globalThis.foundry/game/ui/... BEFORE attack.mjs is imported.
// The intended usage (see test/attack-effective-weapon.test.mjs) is:
//
//   import { installFoundryStub, resetCaptures } from "./helpers/foundry-stub.mjs";
//   let attack;
//   beforeAll(async () => {
//     installFoundryStub();
//     attack = await import("../scripts/rolls/attack.mjs");
//   });
//   beforeEach(() => resetCaptures());
//
// Design notes:
// - Roll is a deterministic stub: it parses additive formulas of dice terms ("NdM", optionally
//   "NdMkhK" as produced by the Tearing quality) and flat integers, and resolves each die from a
//   primed queue (primeDice) falling back to a fixed default per call. `.terms`/`.dice` carry
//   `.results: [{result, active}]` because attack.mjs's formatRoll() walks that shape.
// - capturedRolls()/capturedMessages() are the main assertion surface: they prove the *composed*
//   formula (base weapon + mod fragments + ammo fragments) is what actually reached the dice / chat
//   flags, not just that effectiveWeapon() (already unit-tested in isolation) computes it correctly.
import { BDH } from "../../scripts/config.mjs";

// ---------------------------------------------------------------------------
// Module-level capture state (one stub instance per test process is expected).
// ---------------------------------------------------------------------------
let _rolls = [];
let _messages = [];
let _diceQueue = [];
let _dialogQueue = [];
let _dialogFormQueue = [];
let _uuidRegistry = new Map();
let _idCounter = 0;
let _origConsoleWarn = null;

/** Every formula string passed to `new Roll(...)`, in construction order. */
export function capturedRolls() {
  return [..._rolls];
}

/** Every payload passed to `ChatMessage.create(...)`, in creation order. */
export function capturedMessages() {
  return [..._messages];
}

/** Queue explicit die results (consumed FIFO, one per die rolled, regardless of face count).
 *  Dice rolled beyond the queue fall back to a fixed default (ceil(faces/2)). */
export function primeDice(values) {
  _diceQueue.push(...values);
}

/** Queue canned DialogV2.prompt/.wait responses (consumed FIFO). Unqueued calls fall back to a
 *  permissive default object (see defaultDialogResponse below). */
export function primeDialogForm(forms) {
  _dialogFormQueue.push(...forms);
}

/** A form-shaped stand-in for the dialog body: named controls that record listeners and can be
 *  driven with `fire(name, "change")`. Deliberately hand-rolled — this repo's tests run under
 *  vitest's node environment, with no jsdom. */
export function makeDialogForm(values = {}) {
  const elements = {};
  for (const [name, value] of Object.entries(values)) {
    elements[name] = {
      value,
      _listeners: {},
      addEventListener(evt, cb) { (this._listeners[evt] ??= []).push(cb); },
    };
  }
  return {
    elements,
    fire(name, evt = "change") {
      for (const cb of elements[name]?._listeners?.[evt] ?? []) cb();
    },
  };
}

export function primeDialog(responses) {
  _dialogQueue.push(...responses);
}

/** Register a document so `fromUuid`/`fromUuidSync` can resolve it. */
export function registerUuid(uuid, doc) {
  _uuidRegistry.set(uuid, doc);
  return doc;
}

/** Reset captured rolls/messages/dice/dialog queues. Deliberately leaves the uuid registry alone:
 *  tests call this mid-test (e.g. to isolate a follow-up damage roll's captures from the attack
 *  roll's) as well as in beforeEach, and wiping registered actors/weapons/regions between an attack
 *  and its own follow-up button click would break fromUuid() resolution for that same test. */
export function resetCaptures() {
  _rolls = [];
  _messages = [];
  _diceQueue = [];
  _dialogQueue = [];
  _dialogFormQueue = [];
}

// ---------------------------------------------------------------------------
// Deterministic Roll stub
// ---------------------------------------------------------------------------
function nextDie(faces) {
  if (_diceQueue.length) return _diceQueue.shift();
  return Math.ceil(faces / 2);   // fixed, predictable default (d10 -> 5, d5 -> 3, d100 -> 50, ...)
}

/** One die term ("NdM", optionally "khK" — Tearing's keep-highest). */
function rollDieTerm(n, faces, kh) {
  const raw = Array.from({ length: n }, () => nextDie(faces));
  let activeFlags = raw.map(() => true);
  if (kh != null && kh < n) {
    const bySize = raw.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
    const keep = new Set(bySize.slice(0, kh).map((x) => x.i));
    activeFlags = raw.map((_, i) => keep.has(i));
  }
  const results = raw.map((result, i) => ({ result, active: activeFlags[i] }));
  const total = results.reduce((s, r) => s + (r.active ? r.result : 0), 0);
  return { faces, results, total };
}

class FakeRoll {
  constructor(formula) {
    this.formula = String(formula);
    _rolls.push(this.formula);   // captured at CONSTRUCTION, matching "passed to new Roll(...)"
    this.terms = [];
    this.dice = [];
    this.total = 0;
  }
  async evaluate() {
    const clean = this.formula.replace(/\s+/g, "");
    const re = /([+-]?)(\d+d\d+(?:kh\d+)?|\d+)/gi;
    let m;
    let total = 0;
    let first = true;
    while ((m = re.exec(clean))) {
      const sign = m[1] === "-" ? -1 : 1;
      const body = m[2];
      if (!first) this.terms.push({ operator: sign < 0 ? "-" : "+" });
      const dieMatch = body.match(/^(\d+)d(\d+)(?:kh(\d+))?$/i);
      if (dieMatch) {
        const n = Number(dieMatch[1]), faces = Number(dieMatch[2]), kh = dieMatch[3] != null ? Number(dieMatch[3]) : null;
        const term = rollDieTerm(n, faces, kh);
        this.terms.push(term);
        this.dice.push(term);
        total += sign * term.total;
      } else {
        const num = Number(body) * sign;
        this.terms.push({ number: num });
        total += num;
      }
      first = false;
    }
    this.total = total;
    return this;
  }
}

// ---------------------------------------------------------------------------
// DialogV2 stub
// ---------------------------------------------------------------------------
/** Permissive default: any field read on the returned object resolves to a sane fallback, so a
 *  dialog nobody primed a response for still lets the flow through instead of throwing. */
function defaultDialogResponse() {
  const known = {
    situationalIds: [], characteristicKey: null, reaction: "dodge", hand: "rightArm",
    hits: undefined, facing: undefined,
  };
  return new Proxy(known, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "symbol") return undefined;
      if (prop === "cover") return "0";
      return "+0";   // modifier / mod / atkMod / defMod / dmgMod / defWP / ... — Number("+0") === 0
    },
  });
}

class FakeDialogV2 {
  /** Invoke a caller's `render` hook the way DialogV2 does, handing it the dialog whose
   *  `element.querySelector("form")` yields the form. Primed with primeDialogForm(); without a
   *  primed form the hook is skipped, so every existing caller is unaffected. */
  static #fireRender(config) {
    if (!(config?.render instanceof Function)) return;
    const form = _dialogFormQueue.length ? _dialogFormQueue.shift() : null;
    if (!form) return;
    config.render({}, { element: { querySelector: (sel) => (sel === "form" ? form : null) } });
  }
  static async prompt(config) {
    FakeDialogV2.#fireRender(config);
    return _dialogQueue.length ? _dialogQueue.shift() : defaultDialogResponse();
  }
  static async wait(config) {
    FakeDialogV2.#fireRender(config);
    return _dialogQueue.length ? _dialogQueue.shift() : defaultDialogResponse();
  }
}

// ---------------------------------------------------------------------------
// ChatMessage / renderTemplate stubs
// ---------------------------------------------------------------------------
/** Resolve to a plain string that round-trips the template data as JSON, so tests can inspect
 *  computed card fields (e.g. attackNotes) that live in content rather than in flags. */
async function fakeRenderTemplate(path, data) {
  return JSON.stringify({ __template: path, ...data });
}

class FakeChatMessage {
  static getSpeaker(opts) {
    return { alias: opts?.actor?.name ?? "GM", actor: opts?.actor?.id ?? null };
  }
  static applyRollMode(_data, _mode) {}
  static async create(data) {
    _messages.push(data);
    return { id: `msg-${_messages.length}`, flags: data.flags ?? {}, content: data.content, rolls: data.rolls ?? [] };
  }
}

// ---------------------------------------------------------------------------
// installFoundryStub
// ---------------------------------------------------------------------------
export function installFoundryStub(options = {}) {
  const settings = { enableBattlemap: false, homebrewQualities: false, reverseWounds: false, ...options.settings };
  const targetToken = options.target ?? null;

  globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 1 } };
  globalThis.CONFIG = { BDH };

  globalThis.game = {
    settings: { get: (_scope, key) => settings[key] },
    user: {
      // Hooks that must fire for the acting client only compare against this.
      id: options.userId ?? "user-1",
      isGM: options.isGM ?? true,
      targets: { first: () => targetToken },
      character: null,
    },
    i18n: {
      localize: (k) => k,
      // No lang file is loaded, so `format` substitutes into the key itself — enough for tests to
      // see that the right data reached the string.
      format: (k, data = {}) => Object.entries(data).reduce((s, [dk, dv]) => s.replaceAll(`{${dk}}`, dv), k),
    },
    // Requisition reads both. `items` is the world Items directory; `packs` are compendia, whose
    // getIndex() is async and whose entries carry only indexed fields.
    items: itemsCollection(options.items ?? []),
    packs: (options.packs ?? []).map((p) => ({
      documentName: p.documentName ?? "Item",
      metadata: { label: p.label },
      getIndex: async () => p.entries ?? [],
      getUuid: (id) => `Compendium.${p.label}.${id}`,
    })),
  };

  globalThis.ui = {
    notifications: { warn: () => {}, error: () => {}, info: () => {} },
  };

  globalThis.canvas = {
    tokens: { controlled: [], placeables: options.placeables ?? [] },
    grid: { measurePath: () => ({ distance: 0 }) },
    dimensions: { size: 100, distancePixels: 10 },
    scene: options.scene ?? null,
    regions: { placeRegion: async () => null },
  };

  globalThis.Hooks = { on() {}, once() {}, off() {}, call() {}, callAll() {} };

  globalThis.foundry = {
    applications: {
      api: { DialogV2: FakeDialogV2 },
      handlebars: { renderTemplate: fakeRenderTemplate },
      ux: { FormDataExtended: class { constructor(form) { this.object = form ?? {}; } } },
      instances: new Map(),
    },
    utils: {
      deepClone: (o) => JSON.parse(JSON.stringify(o)),
      randomID: () => `id-${++_idCounter}`,
    },
  };

  globalThis.Roll = FakeRoll;
  globalThis.ChatMessage = FakeChatMessage;
  globalThis.fromUuidSync = (uuid) => _uuidRegistry.get(uuid) ?? null;
  globalThis.fromUuid = async (uuid) => _uuidRegistry.get(uuid) ?? null;

  // Silence console.warn so a caught-but-logged error (e.g. deleteRegionByUuid's catch) never
  // pollutes `npm test` output. Restored is unnecessary — the stub lives for the process lifetime
  // of this test file, and other test files run in separate workers/processes under vitest.
  if (!_origConsoleWarn) {
    _origConsoleWarn = console.warn;
    console.warn = () => {};
  }

  resetCaptures();
  return { registerUuid, primeDice, primeDialog };
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------
function deepMerge(base, extra) {
  if (extra === undefined) return base;
  if (Array.isArray(base) || Array.isArray(extra) || typeof extra !== "object" || extra === null) return extra;
  const out = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    out[k] = (typeof v === "object" && v !== null && !Array.isArray(v) && typeof base?.[k] === "object" && base[k] !== null && !Array.isArray(base[k]))
      ? deepMerge(base[k], v)
      : v;
  }
  return out;
}

function applyDotUpdate(doc, changes) {
  for (const [path, value] of Object.entries(changes ?? {})) {
    const parts = path.split(".");
    let obj = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      obj[parts[i]] ??= {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
  }
  return doc;
}

/** items collection stand-in: a real Array (so .filter/.find/.map/... behave normally) plus a
 *  Foundry-style `.get(id)`. */
function itemsCollection(list) {
  const arr = [...list];
  arr.get = (id) => arr.find((i) => i.id === id);
  return arr;
}

/** A weapon Item fixture. Every field the sweep reads on `system` gets a sane default; pass
 *  `{ system: {...} }` overrides for anything a test cares about. */
export function makeWeapon(overrides = {}) {
  const id = overrides.id ?? `weapon-${++_idCounter}`;
  const defaults = {
    weaponClass: "basic", weaponType: "las",
    damage: "1d10+3", damageType: "energy", penetration: 0,
    qualities: [], mods: [], loadedAmmo: null,
    clip: { value: 10, max: 10 }, rateOfFire: { single: 1, short: 3, long: 6 },
    craftsmanship: "normal", special: "", range: 30,
    equipped: true, hordeEquipped: false,
  };
  const system = deepMerge(defaults, overrides.system);
  const weapon = {
    id, type: "weapon",
    uuid: overrides.uuid ?? `Actor.stub.Item.${id}`,
    name: overrides.name ?? "Test Weapon",
    system,
    update: overrides.update ?? (async (changes) => { applyDotUpdate(weapon, changes); return weapon; }),
  };
  return weapon;
}

const CHARACTERISTIC_KEYS = ["weaponSkill", "ballisticSkill", "strength", "toughness", "agility", "intelligence", "perception", "willpower", "fellowship", "influence"];

/** An Actor fixture with sane characteristic/wounds/skills defaults. */
export function makeActor(overrides = {}) {
  const id = overrides.id ?? `actor-${++_idCounter}`;
  const defaultCharacteristics = {};
  for (const key of CHARACTERISTIC_KEYS) defaultCharacteristics[key] = { total: 40, bonus: 4, unnatural: 0 };
  const defaults = {
    characteristics: defaultCharacteristics,
    wounds: { value: 0, max: 15, critical: 0 },
    skills: { dodge: { rank: "known" }, parry: { rank: "known" } },
    psyRating: 0,
    size: 4,
    magnitude: 0,
  };
  const system = deepMerge(defaults, overrides.system);
  const items = itemsCollection(overrides.items ?? []);
  const actor = {
    id, type: overrides.type ?? "acolyte",
    uuid: overrides.uuid ?? `Actor.${id}`,
    name: overrides.name ?? "Test Actor",
    system, items,
    // Ownership gates every "write to this actor" button (Fate, Requisition's Add). Default true so
    // existing callers, which never set it, keep behaving as they did when it was undefined-but-unused.
    isOwner: overrides.isOwner ?? true,
    createEmbeddedDocuments: overrides.createEmbeddedDocuments ?? (async (_type, docs) => docs),
    statuses: overrides.statuses ?? new Set(),
    flags: overrides.flags ?? {},
    getFlag: overrides.getFlag ?? ((ns, key) => actor.flags[ns]?.[key]),
    setFlag: overrides.setFlag ?? (async (ns, key, value) => { (actor.flags[ns] ??= {})[key] = value; return actor; }),
    unsetFlag: overrides.unsetFlag ?? (async (ns, key) => { delete actor.flags[ns]?.[key]; return actor; }),
    getActiveTokens: overrides.getActiveTokens ?? (() => []),
    update: overrides.update ?? (async (changes) => { applyDotUpdate(actor, changes); return actor; }),
    statusToggles: [],
    toggleStatusEffect: overrides.toggleStatusEffect ?? (async (id, { active } = {}) => {
      actor.statusToggles.push({ id, active });
      if (active) actor.statuses.add(id); else actor.statuses.delete(id);
      return true;
    }),
  };
  return actor;
}

/** The FormData-shaped object resolveAttack expects as its `choice` argument — bypasses the attack
 *  dialog entirely (resolveAttack is the exported resolution body; rollAttack just gathers this). */
export function makeChoice(overrides = {}) {
  return {
    modifier: "+0", aim: "none", attackType: "standard", range: "normal",
    calledShotLocation: null, maximal: false,
    ...overrides,
  };
}

/** A fake chat-card `html` root for bindCardButtons(message, html). Only `[data-bdh="X"]` buttons
 *  and the two `.bdh-*-hit:checked` checkbox selectors attack.mjs actually queries are modelled;
 *  the GM/owner-only removal selectors resolve to an empty list (a harmless no-op — the assertions
 *  in these tests click the button directly rather than relying on it surviving the removal pass).
 *  `remove()` also detaches the element from this root, so a caller that gates on a button's absence
 *  (bindRequisitionButtons) can be asserted with querySelector without pulling in jsdom. */
export function makeCardHtml({ buttons = [], sprayChecked = [], pinChecked = [] } = {}) {
  // A button is either a bare `data-bdh` name or `{ bdh, uuid }` — the per-target suppressing-fire
  // buttons carry the token uuid the handler reads off `btn.dataset.uuid`.
  const els = buttons.map((b) => ({
    dataset: typeof b === "string" ? { bdh: b } : { ...b },
    // Modelled because handlers use it as a re-entrancy guard: the browser dispatches no click
    // event on a disabled control, so a stub that fired one anyway would hide double-fire bugs.
    disabled: false,
    _listeners: {},
    addEventListener(evt, cb) { this._listeners[evt] = cb; },
    remove() {
      this.removed = true;
      const i = els.indexOf(this);
      if (i >= 0) els.splice(i, 1);
    },
  }));
  const sprayBoxes = sprayChecked.map((uuid) => ({ dataset: { uuid }, checked: true }));
  const pinBoxes = pinChecked.map((uuid) => ({ dataset: { uuid }, checked: true }));
  return {
    async click(bdh) {
      const el = els.find((b) => b.dataset.bdh === bdh);
      if (!el) throw new Error(`makeCardHtml: no button "${bdh}" — pass it in { buttons: [...] }`);
      if (!el._listeners.click) throw new Error(`makeCardHtml: bindCardButtons never registered a click handler for "${bdh}"`);
      if (el.disabled) return;   // as in the DOM: no event is dispatched to a disabled control
      await el._listeners.click();
    },
    /** Only the `[data-bdh="X"]` form is modelled — the single selector bindRequisitionButtons uses. */
    querySelector(selector) {
      const m = /^\[data-bdh="([^"]+)"\]$/.exec(selector);
      if (!m) throw new Error(`makeCardHtml.querySelector: unsupported selector "${selector}"`);
      return els.find((b) => b.dataset.bdh === m[1]) ?? null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-bdh]") return els;
      if (selector.includes(".bdh-spray-hit:checked")) return sprayBoxes;
      if (selector.includes(".bdh-pin-hit:checked")) return pinBoxes;
      return [];   // permission-gated removal selectors — no-op is fine, tests click buttons directly
    },
  };
}
