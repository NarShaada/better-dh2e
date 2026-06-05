# Better DH2e — Plan 5: Weapons & Weapon Mods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `weapon` (rebuilt) and `weaponMod` item types with their edit sheets — weapon scalar fields with class-conditional display, a **qualities** list (add from a config list / remove), and an installed-**mods** list (drag a weaponMod item to install / remove). Storage + display only; the combined effective stats are computed later at attack time.

**Architecture:** The class-conditional display logic is a **pure helper** (`weaponClassFlags`), unit-tested. Weapon/weaponMod are DataModels. The existing `DarkHeresyItemSheet` gains weapon + weaponMod sections, action handlers for qualities/mods (whole-array updates — reliable), and a manual drop handler (`TextEditor.getDragEventData` → `Item.fromDropData`) to install a weaponMod's data into `weapon.system.mods[]`.

**Tech Stack:** Foundry v13 (`ItemSheetV2`, ApplicationV2 `actions`, `foundry.applications.ux.TextEditor.implementation.getDragEventData`, `Item.implementation.fromDropData`, `foundry.utils.deepClone`), native ES modules, Vitest, Handlebars.

**Scope of THIS plan:** config (weapon classes/types, damage types, reload, qualities); the `weaponClassFlags` helper; weapon model rebuild + weaponMod model; weapon + weaponMod edit-sheet sections incl. qualities add/remove and mods install(drag)/remove; registration; deploy + verify.

**Out of scope (later plans):** computing effective damage/attack/pen from mods+qualities (attack pipeline); per-quality behaviours; rendering weapons on the actor Combat tab; ammo decrement.

**Reference:** spec §4 (weapon fields; "qualities vs mods — the smart split"). Verified v13: ApplicationV2 has no auto drag-drop — wire `drop`/`dragover` manually in `_onRender`; `foundry.applications.ux.TextEditor.implementation.getDragEventData(event)` returns `{type,uuid,...}`; `await Item.implementation.fromDropData(data)` resolves the dropped item. Array edits use whole-array `document.update({"system.qualities": newArray})` (Foundry-reliable; avoid indexed-path array writes). Transient "add" controls must have **no `name` attribute** (else they pollute the form submit).

---

## File Structure

```
scripts/config.mjs                       MODIFY  weaponClasses, weaponTypes, damageTypes, reload, qualities; +weaponMod in itemTypes
scripts/helpers/weapon-data.mjs          NEW  pure weaponClassFlags(class) -> {usesRange, usesAmmo}
test/weapon-data.test.mjs                NEW  Vitest
scripts/data/item/weapon-model.mjs       MODIFY  rebuild per spec §4
scripts/data/item/weapon-mod-model.mjs   NEW
scripts/sheets/item-sheet.mjs            MODIFY  weapon/weaponMod context, actions, drop handler
templates/item/item-sheet.hbs            MODIFY  weapon + weaponMod sections
scripts/better-dh2e.mjs                  MODIFY  register weaponMod model
template.json                            MODIFY  declare weaponMod
lang/en.json                             MODIFY  TYPES.Item.weaponMod
styles/better-dh2e.css                   MODIFY  weapon section styles
```

---

### Task 1: Config + class-flags helper (TDD for the helper)

**Files:**
- Modify: `scripts/config.mjs`
- Create: `test/weapon-data.test.mjs`, `scripts/helpers/weapon-data.mjs`

- [ ] **Step 1: Append to `scripts/config.mjs`** (after the existing item-config blocks):

```javascript
/** Weapon class (key -> label). */
BDH.weaponClasses = { melee: "Melee", thrown: "Thrown", pistol: "Pistol", basic: "Basic", heavy: "Heavy" };

/** Weapon type / tech (key -> label). */
BDH.weaponTypes = {
  lowTech: "Low-Tech", chain: "Chain", shock: "Shock", power: "Power",
  solidProjectile: "Solid Projectile", bolt: "Bolt", las: "Las", plasma: "Plasma",
  melta: "Melta", flame: "Flame", exotic: "Exotic"
};

/** Damage types (key -> label). */
BDH.damageTypes = { energy: "Energy", explosive: "Explosive", rending: "Rending", impact: "Impact" };

/** Reload duration (key -> label). */
BDH.reload = { free: "Free", half: "Half", full: "Full", twoFull: "2 Full", threeFull: "3 Full" };

/** Weapon qualities (key -> {label, takesValue}). Behaviours are implemented in the attack pipeline later. */
BDH.qualities = {
  tearing:    { label: "Tearing", takesValue: false },
  proven:     { label: "Proven", takesValue: true },
  primitive:  { label: "Primitive", takesValue: true },
  razorSharp: { label: "Razor Sharp", takesValue: false },
  felling:    { label: "Felling", takesValue: true },
  accurate:   { label: "Accurate", takesValue: false },
  storm:      { label: "Storm", takesValue: false },
  twinLinked: { label: "Twin-Linked", takesValue: false },
  reliable:   { label: "Reliable", takesValue: false },
  unreliable: { label: "Unreliable", takesValue: false },
  unwieldy:   { label: "Unwieldy", takesValue: false },
  flexible:   { label: "Flexible", takesValue: false }
};
```

And change the `BDH.itemTypes` line to add `weaponMod`:
```javascript
BDH.itemTypes  = ["weapon", "weaponMod", "gear", "talent", "trait", "forceField", "cybernetic", "psychicPower", "armour"];
```

- [ ] **Step 2: Write the failing test** `test/weapon-data.test.mjs`:

```javascript
// test/weapon-data.test.mjs
import { describe, it, expect } from "vitest";
import { weaponClassFlags } from "../scripts/helpers/weapon-data.mjs";

describe("weaponClassFlags", () => {
  it("melee: no range, no ammo", () => {
    expect(weaponClassFlags("melee")).toEqual({ usesRange: false, usesAmmo: false });
  });
  it("thrown: range yes, no ammo", () => {
    expect(weaponClassFlags("thrown")).toEqual({ usesRange: true, usesAmmo: false });
  });
  it("ranged classes: range + ammo", () => {
    for (const c of ["pistol", "basic", "heavy"]) {
      expect(weaponClassFlags(c)).toEqual({ usesRange: true, usesAmmo: true });
    }
  });
  it("unknown class defaults to ranged", () => {
    expect(weaponClassFlags("???")).toEqual({ usesRange: true, usesAmmo: true });
  });
});
```

- [ ] **Step 3: Run — verify FAIL.** `npx vitest run test/weapon-data.test.mjs` → FAIL (module missing).

- [ ] **Step 4: Implement** `scripts/helpers/weapon-data.mjs`:

```javascript
// scripts/helpers/weapon-data.mjs
// PURE — no Foundry imports.

/** Which conditional weapon fields apply for a class. Melee: no range/ammo. Thrown: range but no ammo. */
export function weaponClassFlags(weaponClass) {
  const isMelee = weaponClass === "melee";
  const isThrown = weaponClass === "thrown";
  return {
    usesRange: !isMelee,
    usesAmmo: !isMelee && !isThrown
  };
}
```

- [ ] **Step 5: Run — verify PASS.** `npx vitest run test/weapon-data.test.mjs` → PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/config.mjs scripts/helpers/weapon-data.mjs test/weapon-data.test.mjs
git commit -m "feat: weapon config lists + class-flags helper (TDD)"
```

---

### Task 2: Weapon model rebuild + WeaponMod model

**Files:**
- Modify: `scripts/data/item/weapon-model.mjs` (replace whole file)
- Create: `scripts/data/item/weapon-mod-model.mjs`

- [ ] **Step 1: Replace `scripts/data/item/weapon-model.mjs` with:**

```javascript
// scripts/data/item/weapon-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class WeaponModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      weaponClass: new fields.StringField({ required: true, choices: Object.keys(BDH.weaponClasses), initial: "melee" }),
      weaponType:  new fields.StringField({ required: true, choices: Object.keys(BDH.weaponTypes), initial: "lowTech" }),
      range:       new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      reload:      new fields.StringField({ required: true, choices: Object.keys(BDH.reload), initial: "full" }),
      clip: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      rateOfFire: new fields.SchemaField({
        single: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        short:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        long:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      damage:      new fields.StringField({ required: true, initial: "1d10" }),
      damageType:  new fields.StringField({ required: true, choices: Object.keys(BDH.damageTypes), initial: "impact" }),
      penetration: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      special:     new fields.StringField({ required: true, initial: "" }),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "common" }),
      weight:        new fields.NumberField({ required: true, initial: 0, min: 0 }),
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null })
      })),
      mods: new fields.ArrayField(new fields.SchemaField({
        name:      new fields.StringField({ required: true, initial: "" }),
        attackMod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
        damageMod: new fields.StringField({ required: true, initial: "" }),
        penMod:    new fields.NumberField({ required: true, integer: true, initial: 0 }),
        special:   new fields.StringField({ required: true, initial: "" })
      })),
      equipped: new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 2: Create `scripts/data/item/weapon-mod-model.mjs`:**

```javascript
// scripts/data/item/weapon-mod-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class WeaponModModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      attackMod: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      damageMod: new fields.StringField({ required: true, initial: "" }),
      penMod:    new fields.NumberField({ required: true, integer: true, initial: 0 }),
      special:   new fields.StringField({ required: true, initial: "" })
    };
  }
}
```

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/data/item/weapon-model.mjs && node --check scripts/data/item/weapon-mod-model.mjs`
Expected: no output.

```bash
git add scripts/data/item/weapon-model.mjs scripts/data/item/weapon-mod-model.mjs
git commit -m "feat: rebuild weapon model (type/reload/RoF ints/pen int/mods); add weaponMod model"
```

---

### Task 3: Item-sheet context, actions, and drop handler

**Files:**
- Modify: `scripts/sheets/item-sheet.mjs`

- [ ] **Step 1: Replace `scripts/sheets/item-sheet.mjs` with:**

```javascript
// scripts/sheets/item-sheet.mjs
import { BDH } from "../config.mjs";
import { weaponClassFlags } from "../helpers/weapon-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class DarkHeresyItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  /** Action: add the selected quality (with optional value) to the weapon. */
  static async #onAddQuality(event, target) {
    const root = this.element;
    const key = root.querySelector(".bdh-quality-key")?.value;
    if (!key) return;
    const takesValue = BDH.qualities[key]?.takesValue;
    const raw = root.querySelector(".bdh-quality-value")?.value;
    const value = takesValue ? (parseInt(raw, 10) || 0) : null;
    const qualities = foundry.utils.deepClone(this.document.system.qualities);
    qualities.push({ key, value });
    await this.document.update({ "system.qualities": qualities });
  }

  /** Action: remove a quality by index. */
  static async #onRemoveQuality(event, target) {
    const qualities = foundry.utils.deepClone(this.document.system.qualities);
    qualities.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.qualities": qualities });
  }

  /** Action: remove an installed mod by index. */
  static async #onRemoveMod(event, target) {
    const mods = foundry.utils.deepClone(this.document.system.mods);
    mods.splice(Number(target.dataset.index), 1);
    await this.document.update({ "system.mods": mods });
  }

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "item"],
    position: { width: 480, height: 560 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      addQuality: DarkHeresyItemSheet.#onAddQuality,
      removeQuality: DarkHeresyItemSheet.#onRemoveQuality,
      removeMod: DarkHeresyItemSheet.#onRemoveMod
    }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const t = this.document.type;
    const system = this.document.system;
    context.document = this.document;
    context.system = system;
    context.isTalent = t === "talent";
    context.isGear = t === "gear";
    context.isForceField = t === "forceField";
    context.isCybernetic = t === "cybernetic";
    context.isArmour = t === "armour";
    context.isWeapon = t === "weapon";
    context.isWeaponMod = t === "weaponMod";
    context.craftChoices = BDH.craftsmanship;
    context.availChoices = BDH.availability;
    context.tierChoices = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
    context.aptitudeChoices = Object.fromEntries(BDH.aptitudes.map((a) => [a, a]));

    if (context.isWeapon) {
      const flags = weaponClassFlags(system.weaponClass);
      context.usesRange = flags.usesRange;
      context.usesAmmo = flags.usesAmmo;
      context.weaponClasses = BDH.weaponClasses;
      context.weaponTypes = BDH.weaponTypes;
      context.damageTypes = BDH.damageTypes;
      context.reloadChoices = BDH.reload;
      context.qualityChoices = Object.fromEntries(Object.entries(BDH.qualities).map(([k, v]) => [k, v.label]));
      context.qualityList = system.qualities.map((q, i) => {
        const label = BDH.qualities[q.key]?.label ?? q.key;
        return { index: i, key: q.key, display: q.value != null ? `${label} (${q.value})` : label };
      });
      context.modList = system.mods.map((m, i) => ({ index: i, ...m }));
    }
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Select-all on focus for short text/number fields (not name/description) — faster bulk entry.
    for (const el of this.element.querySelectorAll('input[type="text"]:not([name="name"]), input[type="number"]')) {
      el.addEventListener("focus", (event) => event.currentTarget.select());
    }
    // Weapons accept a dropped weaponMod item to install.
    if (this.document.type === "weapon") {
      this.element.addEventListener("dragover", (event) => event.preventDefault());
      this.element.addEventListener("drop", this.#onDropMod.bind(this));
    }
  }

  /** Install a dropped weaponMod by copying its fields into system.mods[]. */
  async #onDropMod(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== "Item") return;
    const item = await Item.implementation.fromDropData(data);
    if (!item || item.type !== "weaponMod") return;
    const mods = foundry.utils.deepClone(this.document.system.mods);
    mods.push({
      name: item.name,
      attackMod: item.system.attackMod,
      damageMod: item.system.damageMod,
      penMod: item.system.penMod,
      special: item.system.special
    });
    await this.document.update({ "system.mods": mods });
  }
}
```

- [ ] **Step 2: Syntax-check and run tests**

Run: `node --check scripts/sheets/item-sheet.mjs && npm test`
Expected: no output; all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/sheets/item-sheet.mjs
git commit -m "feat: weapon/weaponMod sheet context, quality actions, mod drop-install"
```

---

### Task 4: Item-sheet template — weapon + weaponMod sections

**Files:**
- Modify: `templates/item/item-sheet.hbs`

- [ ] **Step 1: Insert the weaponMod section** right after the `{{#if isArmour}} … {{/if}}` block (and before the `<label class="bdh-desc-label">Description</label>` line):

```handlebars
  {{#if isWeaponMod}}
    <div class="bdh-fields">
      <label>Attack Mod</label><input type="number" name="system.attackMod" value="{{system.attackMod}}"/>
      <label>Damage Mod</label><input type="text" name="system.damageMod" value="{{system.damageMod}}" placeholder="+2 or +1d5"/>
      <label>Pen Mod</label><input type="number" name="system.penMod" value="{{system.penMod}}"/>
      <label>Special</label><input type="text" name="system.special" value="{{system.special}}"/>
    </div>
  {{/if}}

  {{#if isWeapon}}
    <div class="bdh-fields">
      <label>Class</label><select name="system.weaponClass">{{selectOptions weaponClasses selected=system.weaponClass}}</select>
      <label>Type</label><select name="system.weaponType">{{selectOptions weaponTypes selected=system.weaponType}}</select>
      {{#if usesRange}}<label>Range (m)</label><input type="number" name="system.range" value="{{system.range}}"/>{{/if}}
      <label>Damage</label><input type="text" name="system.damage" value="{{system.damage}}" placeholder="1d10+4"/>
      <label>Damage Type</label><select name="system.damageType">{{selectOptions damageTypes selected=system.damageType}}</select>
      <label>Penetration</label><input type="number" name="system.penetration" value="{{system.penetration}}"/>
      {{#if usesAmmo}}
        <label>Reload</label><select name="system.reload">{{selectOptions reloadChoices selected=system.reload}}</select>
        <label>Clip</label><span class="bdh-inline"><input type="number" name="system.clip.value" value="{{system.clip.value}}"/> / <input type="number" name="system.clip.max" value="{{system.clip.max}}"/></span>
        <label>RoF (S/Short/Long)</label><span class="bdh-inline"><input type="number" name="system.rateOfFire.single" value="{{system.rateOfFire.single}}"/> / <input type="number" name="system.rateOfFire.short" value="{{system.rateOfFire.short}}"/> / <input type="number" name="system.rateOfFire.long" value="{{system.rateOfFire.long}}"/></span>
      {{/if}}
      <label>Craftsmanship</label><select name="system.craftsmanship">{{selectOptions craftChoices selected=system.craftsmanship}}</select>
      <label>Availability</label><select name="system.availability">{{selectOptions availChoices selected=system.availability}}</select>
      <label>Weight</label><input type="number" step="0.1" name="system.weight" value="{{system.weight}}"/>
      <label>Special</label><input type="text" name="system.special" value="{{system.special}}"/>
    </div>

    <div class="bdh-list-section">
      <div class="bdh-list-head">Qualities</div>
      {{#each qualityList as |q|}}
        <div class="bdh-list-row"><span>{{q.display}}</span>
          <a data-action="removeQuality" data-index="{{q.index}}" title="Remove">✖</a></div>
      {{/each}}
      <div class="bdh-add-row">
        <select class="bdh-quality-key">{{selectOptions qualityChoices}}</select>
        <input class="bdh-quality-value" type="number" placeholder="X"/>
        <button type="button" data-action="addQuality">＋ Add</button>
      </div>
    </div>

    <div class="bdh-list-section">
      <div class="bdh-list-head">Installed Mods <span class="bdh-hint">— drag a Weapon Mod item here to install</span></div>
      {{#each modList as |m|}}
        <div class="bdh-list-row"><span><b>{{m.name}}</b> — atk {{m.attackMod}}, dmg {{m.damageMod}}, pen {{m.penMod}}{{#if m.special}}, {{m.special}}{{/if}}</span>
          <a data-action="removeMod" data-index="{{m.index}}" title="Remove">✖</a></div>
      {{/each}}
      {{#unless modList.length}}<div class="bdh-empty">No mods installed.</div>{{/unless}}
    </div>
  {{/if}}
```

- [ ] **Step 2: Commit**

```bash
git add templates/item/item-sheet.hbs
git commit -m "feat: weapon + weaponMod sheet sections (conditional fields, qualities, mods)"
```

---

### Task 5: Register weaponMod (init, template.json, lang) + styles

**Files:**
- Modify: `scripts/better-dh2e.mjs`, `template.json`, `lang/en.json`, `styles/better-dh2e.css`

- [ ] **Step 1: In `scripts/better-dh2e.mjs`** add the import (near the item-model imports):

```javascript
import { WeaponModModel } from "./data/item/weapon-mod-model.mjs";
```
and add the registration right after `CONFIG.Item.dataModels.weapon = WeaponModel;`:
```javascript
  CONFIG.Item.dataModels.weaponMod = WeaponModModel;
```

- [ ] **Step 2: In `template.json`**, add `"weaponMod"` to the Item `types` array and add a `"weaponMod": {}` stub:

```json
    "types": ["weapon", "weaponMod", "gear", "talent", "trait", "forceField", "cybernetic", "psychicPower", "armour"],
```
and among the per-type stubs add:
```json
    "weaponMod": {},
```

- [ ] **Step 3: In `lang/en.json`**, after `"TYPES.Item.weapon": ...`? (there is no weapon label yet — add both). After `"TYPES.Item.gear": "Gear",` add:
```json
  "TYPES.Item.weapon": "Weapon",
  "TYPES.Item.weaponMod": "Weapon Mod",
```
(Keep JSON valid.)

- [ ] **Step 4: Append to `styles/better-dh2e.css`:**

```css

/* Weapon sheet lists (qualities, mods) */
.better-dh2e.item .bdh-inline { display:inline-flex; align-items:center; gap:4px; }
.better-dh2e.item .bdh-inline input { width:48px; }
.better-dh2e.item .bdh-list-section { margin:6px 8px; border:1px solid var(--bdh-brown); border-radius:4px; }
.better-dh2e.item .bdh-list-head { background:var(--bdh-brown); color:var(--bdh-parch); font-variant:small-caps; letter-spacing:1px; padding:3px 8px; font-size:12px; }
.better-dh2e.item .bdh-list-head .bdh-hint { font-variant:normal; letter-spacing:0; opacity:.8; font-size:10px; }
.better-dh2e.item .bdh-list-row { display:flex; justify-content:space-between; align-items:center; padding:3px 8px; border-bottom:1px dotted #cbb88c; font-size:12px; }
.better-dh2e.item .bdh-list-row a { cursor:pointer; color:#7a1f1f; }
.better-dh2e.item .bdh-add-row { display:flex; gap:5px; align-items:center; padding:5px 8px; }
.better-dh2e.item .bdh-add-row .bdh-quality-value { width:48px; }
.better-dh2e.item .bdh-add-row button { background:var(--bdh-maroon); color:var(--bdh-parch); border:none; border-radius:3px; padding:2px 8px; cursor:pointer; }
.better-dh2e.item .bdh-empty { padding:4px 8px; color:var(--bdh-muted); font-style:italic; font-size:11px; }
```

- [ ] **Step 5: Verify and commit**

Run: `node --check scripts/better-dh2e.mjs && node -e "JSON.parse(require('fs').readFileSync('template.json','utf8')); JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('json ok')" && npm test`
Expected: no syntax errors; `json ok`; tests PASS.

```bash
git add scripts/better-dh2e.mjs template.json lang/en.json styles/better-dh2e.css
git commit -m "feat: register weaponMod type; weapon sheet styles"
```

---

### Task 6: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → Items → Create Item):
- [ ] Create a **Weapon Mod** → fields Attack Mod / Damage Mod / Pen Mod / Special + description; set values, reopen → persisted.
- [ ] Create a **Weapon**, class **Melee** → **no Range, no Reload/Clip/RoF** shown; Damage/Damage Type/Pen/Craftsmanship/Weight/Special present. Set Damage `1d10+3`, reopen → persisted.
- [ ] Switch class to **Basic** → Range, Reload, Clip (x/y), RoF (S/Short/Long) appear. Set them, reopen → persisted.
- [ ] Switch to **Thrown** → Range shows but Reload/Clip/RoF hidden.
- [ ] **Qualities:** pick "Tearing", Add → appears in the list; pick "Proven", value 3, Add → "Proven (3)"; remove one with ✖ → gone. Reopen → persisted.
- [ ] **Mods:** drag the Weapon Mod item from the sidebar onto the weapon sheet → it appears in Installed Mods with its values; ✖ removes it. Reopen → persisted.
- [ ] **F12 console:** no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§4 weapon):**
- Weapon fields (class, type, range, reload, clip, RoF ints, damage regex, damageType, pen int, special, craftsmanship, weight, availability, qualities, mods, equipped) → Task 2. ✓
- Conditional display (melee hides range+ammo; thrown hides ammo) → Task 1 helper + Task 4 template. ✓
- Qualities add/remove from config list (value when `takesValue`) → Tasks 3/4. ✓
- Mods = weaponMod blueprint, drag-install copies into `system.mods[]`, remove → Tasks 2/3/4. ✓
- Store + display only (no effective-stat combination) → confirmed; no combination code present. ✓

**Deferred (declared):** effective-stat computation + per-quality behaviour (attack pipeline); actor Combat-tab rendering; ammo decrement.

**Placeholder scan:** all code complete; no fragile helper dependencies (quality display precomputed in context). Checklist uses concrete values (melee hides ammo; Proven (3)).

**Type/name consistency:** `weaponClassFlags` signature matches helper/test/sheet. Action names `addQuality`/`removeQuality`/`removeMod` match `DEFAULT_OPTIONS.actions`, the handlers, and the template `data-action`. The add-quality controls use **class selectors with no `name`** (read in `#onAddQuality`), so they don't pollute the form. Whole-array `document.update` for qualities/mods avoids indexed-path writes. `weaponMod` registered in `CONFIG.Item.dataModels`, `template.json`, `BDH.itemTypes`, and `lang`. Drop path uses the verified `foundry.applications.ux.TextEditor.implementation.getDragEventData` + `Item.implementation.fromDropData`.
```
