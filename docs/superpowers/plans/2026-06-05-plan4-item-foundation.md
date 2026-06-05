# Better DH2e — Plan 4: Item Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the seven simple item types (talent, trait, gear, force field, cybernetic, psychic power, armour) with their data models and a generic item **edit sheet**, the supporting config lists (aptitudes, availability, craftsmanship), and the actor's embedded affliction/injury arrays — so items can be created and edited. (Weapon + weapon mod = Plan 5.)

**Architecture:** Item types are Foundry DataModels extending a shared `BaseItemModel` (rich-text `description`, no `source`). One ApplicationV2 `ItemSheetV2` renders all types via a single template that shows type-specific field groups by a context boolean. Config lists live in `CONFIG.BDH`. Mutations/malignancies/mental-disorders/injuries are **embedded arrays on the actor**, not item types (their inline edit UI comes with the Afflictions/Combat tabs later).

**Tech Stack:** Foundry v13 (`foundry.applications.sheets.ItemSheetV2`, `HandlebarsApplicationMixin`, `<prose-mirror>` editor element, `{{selectOptions}}`/`{{checked}}` helpers, `foundry.data.fields`), native ES modules, Handlebars.

**Scope of THIS plan:** config (aptitudes/availability/craftsmanship); base-item + gear updates; six new item models; the actor embedded arrays; the item edit sheet + registration; deploy + verify by creating/editing items.

**Out of scope (later plans):** weapon + weaponMod types (Plan 5); rendering items on the actor's tabs (Abilities/Gear/Afflictions/Psychic — Plan 5+); quantity control on the actor Gear tab; drag-to-install mods.

**Reference:** spec §4 (item model — item types vs. embedded arrays vs. config). Verified v13 APIs: `foundry.applications.sheets.ItemSheetV2`; `<prose-mirror name="system.description" value="…">` (custom form element, tag `prose-mirror`, reads `value` attribute); `foundry.documents.collections.Items.registerSheet/unregisterSheet`; core item sheet to unregister is `foundry.appv1.sheets.ItemSheet`. `{{selectOptions choices selected=…}}` and `{{checked bool}}` are standard Foundry Handlebars helpers.

---

## File Structure

```
scripts/config.mjs                       MODIFY  add aptitudes, availability, craftsmanship; expand itemTypes
scripts/data/item/base-item-model.mjs    MODIFY  drop `source` (keep rich-text description)
scripts/data/item/gear-model.mjs         MODIFY  add availability; keep quantity; use BDH.craftsmanship
scripts/data/item/talent-model.mjs       NEW
scripts/data/item/trait-model.mjs        NEW
scripts/data/item/force-field-model.mjs  NEW
scripts/data/item/cybernetic-model.mjs   NEW
scripts/data/item/psychic-power-model.mjs NEW
scripts/data/item/armour-model.mjs       NEW
scripts/data/actor/base-actor-model.mjs  MODIFY  add embedded afflictions + injuries arrays
scripts/sheets/item-sheet.mjs            NEW  generic ItemSheetV2
templates/item/item-sheet.hbs            NEW
scripts/better-dh2e.mjs                  MODIFY  register new item models + item sheet
template.json                            MODIFY  declare new item subtypes
lang/en.json                             MODIFY  TYPES.Item.* for new types
styles/better-dh2e.css                   MODIFY  item-sheet layout
```

---

### Task 1: Config lists

**Files:**
- Modify: `scripts/config.mjs`

- [ ] **Step 1: Append these to `scripts/config.mjs`** (after the existing `BDH.skills = {...}` block, before/around the existing `BDH.actorTypes`/`BDH.itemTypes` lines). Replace the existing `BDH.itemTypes = ["weapon", "gear"];` line with the expanded one shown:

```javascript
/** Item craftsmanship tiers (key -> label). */
BDH.craftsmanship = { poor: "Poor", normal: "Normal", good: "Good", best: "Best" };

/** Availability ladder (key -> label). */
BDH.availability = {
  ubiquitous: "Ubiquitous", abundant: "Abundant", plentiful: "Plentiful", common: "Common",
  average: "Average", scarce: "Scarce", rare: "Rare", veryRare: "Very Rare",
  extremelyRare: "Extremely Rare", nearUnique: "Near Unique", unique: "Unique"
};

/** Fixed aptitude list (values are also the labels). Used by talents and character advancement. */
BDH.aptitudes = [
  "Weapon Skill", "Ballistic Skill", "Strength", "Toughness", "Agility", "Intelligence",
  "Perception", "Willpower", "Fellowship", "Offence", "Finesse", "Defence",
  "Psyker", "Knowledge", "Leadership", "Social", "Tech", "Fieldcraft", "General"
];
```

And change:
```javascript
BDH.itemTypes  = ["weapon", "gear"];
```
to:
```javascript
BDH.itemTypes  = ["weapon", "gear", "talent", "trait", "forceField", "cybernetic", "psychicPower", "armour"];
```

- [ ] **Step 2: Validate and commit**

Run: `node --check scripts/config.mjs && npm test`
Expected: valid; all existing tests still PASS.

```bash
git add scripts/config.mjs
git commit -m "feat: add craftsmanship/availability/aptitudes config and item types"
```

---

### Task 2: Base-item + gear model updates

**Files:**
- Modify: `scripts/data/item/base-item-model.mjs`
- Modify: `scripts/data/item/gear-model.mjs`

- [ ] **Step 1: Replace `scripts/data/item/base-item-model.mjs` with** (drops `source`; description stays rich-text HTML):

```javascript
// scripts/data/item/base-item-model.mjs
const fields = foundry.data.fields;

export class BaseItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: true, initial: "" })
    };
  }
}
```

- [ ] **Step 2: Replace `scripts/data/item/gear-model.mjs` with** (adds availability, centralizes craftsmanship, keeps quantity):

```javascript
// scripts/data/item/gear-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class GearModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "common" }),
      weight:   new fields.NumberField({ required: true, initial: 0, min: 0 }),
      quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 })
    };
  }
}
```

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/data/item/base-item-model.mjs && node --check scripts/data/item/gear-model.mjs`
Expected: no output.

```bash
git add scripts/data/item/base-item-model.mjs scripts/data/item/gear-model.mjs
git commit -m "feat: rich-text-only base item; gear gains availability, centralized craftsmanship"
```

---

### Task 3: New item data models

**Files (all Create):**
- `scripts/data/item/talent-model.mjs`, `trait-model.mjs`, `force-field-model.mjs`, `cybernetic-model.mjs`, `psychic-power-model.mjs`, `armour-model.mjs`

- [ ] **Step 1: Create `talent-model.mjs`:**

```javascript
// scripts/data/item/talent-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class TalentModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      tier:          new fields.NumberField({ required: true, integer: true, initial: 1, min: 1, max: 3 }),
      prerequisites: new fields.StringField({ required: true, initial: "" }),
      aptitudes:     new fields.ArrayField(new fields.StringField({ choices: BDH.aptitudes })),
      favourite:     new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 2: Create `trait-model.mjs`** (Name + Description only — also used for Psy Rating):

```javascript
// scripts/data/item/trait-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

export class TraitModel extends BaseItemModel {
  static defineSchema() {
    return { ...super.defineSchema() };
  }
}
```

- [ ] **Step 3: Create `psychic-power-model.mjs`** (Name + Description only this version):

```javascript
// scripts/data/item/psychic-power-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

export class PsychicPowerModel extends BaseItemModel {
  static defineSchema() {
    return { ...super.defineSchema() };
  }
}
```

- [ ] **Step 4: Create `force-field-model.mjs`:**

```javascript
// scripts/data/item/force-field-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class ForceFieldModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      protectionRating: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      overload:         new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      craftsmanship:    new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:     new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "rare" }),
      weight:           new fields.NumberField({ required: true, initial: 0, min: 0 }),
      equipped:         new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 5: Create `cybernetic-model.mjs`:**

```javascript
// scripts/data/item/cybernetic-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

export class CyberneticModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "rare" }),
      installed:     new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 6: Create `armour-model.mjs`:**

```javascript
// scripts/data/item/armour-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

const fields = foundry.data.fields;

const apField = () => new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });

export class ArmourModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      locations: new fields.SchemaField({
        head: apField(), body: apField(), rightArm: apField(), leftArm: apField(), rightLeg: apField(), leftLeg: apField()
      }),
      additive:      new fields.BooleanField({ required: true, initial: false }),
      craftsmanship: new fields.StringField({ required: true, choices: Object.keys(BDH.craftsmanship), initial: "normal" }),
      availability:  new fields.StringField({ required: true, choices: Object.keys(BDH.availability), initial: "average" }),
      weight:        new fields.NumberField({ required: true, initial: 0, min: 0 }),
      equipped:      new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 7: Syntax-check all six and commit**

Run: `for f in talent trait force-field cybernetic psychic-power armour; do node --check scripts/data/item/$f-model.mjs; done`
Expected: no output.

```bash
git add scripts/data/item/talent-model.mjs scripts/data/item/trait-model.mjs scripts/data/item/force-field-model.mjs scripts/data/item/cybernetic-model.mjs scripts/data/item/psychic-power-model.mjs scripts/data/item/armour-model.mjs
git commit -m "feat: add item data models (talent, trait, force field, cybernetic, psychic power, armour)"
```

---

### Task 4: Actor embedded affliction/injury arrays

**Files:**
- Modify: `scripts/data/actor/base-actor-model.mjs`

- [ ] **Step 1: In `base-actor-model.mjs`, add a helper** right after the existing `skillsSchema()` function (before the `export class BaseActorModel`):

```javascript
/** An array of {name, description} entries (mutations, malignancies, mental disorders). */
function namedListField() {
  return new fields.ArrayField(new fields.SchemaField({
    name:        new fields.StringField({ required: true, initial: "" }),
    description: new fields.StringField({ required: true, initial: "" })
  }));
}
```

- [ ] **Step 2: In the same file, add these fields to the object returned by `defineSchema()`** (alongside `wounds`, `fatigue`, `fate`, `size`):

```javascript
      afflictions: new fields.SchemaField({
        mutations:       namedListField(),
        malignancies:    namedListField(),
        mentalDisorders: namedListField()
      }),
      injuries: new fields.ArrayField(new fields.SchemaField({
        description: new fields.StringField({ required: true, initial: "" })
      })),
```

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/data/actor/base-actor-model.mjs && npm test`
Expected: no output; tests still PASS.

```bash
git add scripts/data/actor/base-actor-model.mjs
git commit -m "feat: embedded affliction + injury arrays on the actor model"
```

---

### Task 5: Item edit sheet + registration

**Files:**
- Create: `scripts/sheets/item-sheet.mjs`
- Create: `templates/item/item-sheet.hbs`
- Modify: `scripts/better-dh2e.mjs`, `template.json`, `lang/en.json`, `styles/better-dh2e.css`

- [ ] **Step 1: Create `scripts/sheets/item-sheet.mjs`:**

```javascript
// scripts/sheets/item-sheet.mjs
import { BDH } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export class DarkHeresyItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "item"],
    position: { width: 480, height: 520 },
    window: { resizable: true },
    form: { submitOnChange: true }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/item/item-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const t = this.document.type;
    context.document = this.document;
    context.system = this.document.system;
    context.isTalent = t === "talent";
    context.isGear = t === "gear";
    context.isForceField = t === "forceField";
    context.isCybernetic = t === "cybernetic";
    context.isArmour = t === "armour";
    context.craftChoices = BDH.craftsmanship;
    context.availChoices = BDH.availability;
    context.tierChoices = { 1: "Tier 1", 2: "Tier 2", 3: "Tier 3" };
    context.aptitudeChoices = Object.fromEntries(BDH.aptitudes.map((a) => [a, a]));
    return context;
  }
}
```

- [ ] **Step 2: Create `templates/item/item-sheet.hbs`:**

```handlebars
{{!-- templates/item/item-sheet.hbs --}}
<form class="better-dh2e item">
  <header class="bdh-item-header">
    <img src="{{document.img}}" data-edit="img" alt="icon"/>
    <input type="text" name="name" value="{{document.name}}" placeholder="Name"/>
  </header>

  {{#if isTalent}}
    <div class="bdh-fields">
      <label>Tier</label><select name="system.tier">{{selectOptions tierChoices selected=system.tier}}</select>
      <label>Prerequisites</label><input type="text" name="system.prerequisites" value="{{system.prerequisites}}"/>
      <label>Aptitudes</label><select name="system.aptitudes" multiple size="6">{{selectOptions aptitudeChoices selected=system.aptitudes}}</select>
    </div>
  {{/if}}

  {{#if isGear}}
    <div class="bdh-fields">
      <label>Craftsmanship</label><select name="system.craftsmanship">{{selectOptions craftChoices selected=system.craftsmanship}}</select>
      <label>Availability</label><select name="system.availability">{{selectOptions availChoices selected=system.availability}}</select>
      <label>Weight</label><input type="number" step="0.1" name="system.weight" value="{{system.weight}}"/>
    </div>
  {{/if}}

  {{#if isForceField}}
    <div class="bdh-fields">
      <label>Protection Rating</label><input type="number" name="system.protectionRating" value="{{system.protectionRating}}"/>
      <label>Overload</label><input type="number" name="system.overload" value="{{system.overload}}"/>
      <label>Craftsmanship</label><select name="system.craftsmanship">{{selectOptions craftChoices selected=system.craftsmanship}}</select>
      <label>Availability</label><select name="system.availability">{{selectOptions availChoices selected=system.availability}}</select>
      <label>Weight</label><input type="number" step="0.1" name="system.weight" value="{{system.weight}}"/>
    </div>
  {{/if}}

  {{#if isCybernetic}}
    <div class="bdh-fields">
      <label>Craftsmanship</label><select name="system.craftsmanship">{{selectOptions craftChoices selected=system.craftsmanship}}</select>
      <label>Availability</label><select name="system.availability">{{selectOptions availChoices selected=system.availability}}</select>
      <label>Installed</label><input type="checkbox" name="system.installed" {{checked system.installed}}/>
    </div>
  {{/if}}

  {{#if isArmour}}
    <div class="bdh-fields">
      <label>Craftsmanship</label><select name="system.craftsmanship">{{selectOptions craftChoices selected=system.craftsmanship}}</select>
      <label>Availability</label><select name="system.availability">{{selectOptions availChoices selected=system.availability}}</select>
      <label>Weight</label><input type="number" step="0.1" name="system.weight" value="{{system.weight}}"/>
      <label>Additive to other armour</label><input type="checkbox" name="system.additive" {{checked system.additive}}/>
    </div>
    <div class="bdh-armour-locs">
      <label>Head</label><input type="number" name="system.locations.head" value="{{system.locations.head}}"/>
      <label>Body</label><input type="number" name="system.locations.body" value="{{system.locations.body}}"/>
      <label>R Arm</label><input type="number" name="system.locations.rightArm" value="{{system.locations.rightArm}}"/>
      <label>L Arm</label><input type="number" name="system.locations.leftArm" value="{{system.locations.leftArm}}"/>
      <label>R Leg</label><input type="number" name="system.locations.rightLeg" value="{{system.locations.rightLeg}}"/>
      <label>L Leg</label><input type="number" name="system.locations.leftLeg" value="{{system.locations.leftLeg}}"/>
    </div>
  {{/if}}

  <label class="bdh-desc-label">Description</label>
  <prose-mirror name="system.description" value="{{document.system.description}}"></prose-mirror>
</form>
```

- [ ] **Step 3: Register the item models + sheet in `scripts/better-dh2e.mjs`.** Add imports near the other data-model imports:

```javascript
import { TalentModel } from "./data/item/talent-model.mjs";
import { TraitModel } from "./data/item/trait-model.mjs";
import { ForceFieldModel } from "./data/item/force-field-model.mjs";
import { CyberneticModel } from "./data/item/cybernetic-model.mjs";
import { PsychicPowerModel } from "./data/item/psychic-power-model.mjs";
import { ArmourModel } from "./data/item/armour-model.mjs";
import { DarkHeresyItemSheet } from "./sheets/item-sheet.mjs";
```

Add these registrations in the `init` hook right after the existing `CONFIG.Item.dataModels.gear = GearModel;` line:

```javascript
  CONFIG.Item.dataModels.talent = TalentModel;
  CONFIG.Item.dataModels.trait = TraitModel;
  CONFIG.Item.dataModels.forceField = ForceFieldModel;
  CONFIG.Item.dataModels.cybernetic = CyberneticModel;
  CONFIG.Item.dataModels.psychicPower = PsychicPowerModel;
  CONFIG.Item.dataModels.armour = ArmourModel;
```

And register the item sheet right after the existing Actors sheet registration block:

```javascript
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("better-dh2e", DarkHeresyItemSheet, {
    makeDefault: true,
    label: "Better DH2e Item Sheet"
  });
```

- [ ] **Step 4: Declare the new item subtypes in `template.json`.** Change the `"Item"` block from:

```json
  "Item": {
    "types": ["weapon", "gear"],
    "weapon": {},
    "gear": {}
  }
```
to:
```json
  "Item": {
    "types": ["weapon", "gear", "talent", "trait", "forceField", "cybernetic", "psychicPower", "armour"],
    "weapon": {},
    "gear": {},
    "talent": {},
    "trait": {},
    "forceField": {},
    "cybernetic": {},
    "psychicPower": {},
    "armour": {}
  }
```

- [ ] **Step 5: Add item type labels to `lang/en.json`.** After `"TYPES.Item.gear": "Gear",` add:

```json
  "TYPES.Item.talent": "Talent",
  "TYPES.Item.trait": "Trait",
  "TYPES.Item.forceField": "Force Field",
  "TYPES.Item.cybernetic": "Cybernetic",
  "TYPES.Item.psychicPower": "Psychic Power",
  "TYPES.Item.armour": "Armour",
```
(Ensure the preceding line keeps/has its trailing comma and JSON stays valid.)

- [ ] **Step 6: Append item-sheet styles to `styles/better-dh2e.css`:**

```css

/* Item edit sheet */
.better-dh2e.item .bdh-item-header { display:flex; align-items:center; gap:8px; padding:6px; }
.better-dh2e.item .bdh-item-header img { width:40px; height:40px; border:2px solid var(--bdh-gold); border-radius:6px; }
.better-dh2e.item .bdh-item-header input { font-size:16px; font-weight:bold; flex:1; background:transparent; color:var(--bdh-ink); border:none; border-bottom:1px solid var(--bdh-brown); }
.better-dh2e.item .bdh-fields { display:grid; grid-template-columns:auto 1fr; gap:5px 8px; align-items:center; padding:6px 8px; }
.better-dh2e.item .bdh-fields label { color:var(--bdh-muted); font-size:11px; text-transform:uppercase; letter-spacing:1px; }
.better-dh2e.item .bdh-armour-locs { display:grid; grid-template-columns:repeat(6, auto 1fr); gap:4px 6px; align-items:center; padding:4px 8px; }
.better-dh2e.item .bdh-armour-locs label { color:var(--bdh-muted); font-size:10px; text-transform:uppercase; }
.better-dh2e.item .bdh-desc-label { display:block; color:var(--bdh-muted); font-size:11px; text-transform:uppercase; letter-spacing:1px; padding:6px 8px 2px; }
.better-dh2e.item prose-mirror { display:block; min-height:140px; margin:0 8px 8px; border:1px solid var(--bdh-brown); border-radius:4px; background:#fff8e7; }
```

- [ ] **Step 7: Syntax-check, validate, run tests**

Run: `node --check scripts/sheets/item-sheet.mjs && node --check scripts/better-dh2e.mjs && node -e "JSON.parse(require('fs').readFileSync('template.json','utf8')); JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('json ok')" && npm test`
Expected: no syntax errors; `json ok`; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add scripts/sheets/item-sheet.mjs templates/item/item-sheet.hbs scripts/better-dh2e.mjs template.json lang/en.json styles/better-dh2e.css
git commit -m "feat: generic item edit sheet; register the new item types"
```

---

### Task 6: Deploy & browser verification

**Files:** none (operational).

- [ ] **Step 1: Deploy** — Run: `npm run deploy` — Expected: "Deployed to …/systems/better-dh2e".
- [ ] **Step 2: Restart** — Run: `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'` — Expected: listening on :30000.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → Items sidebar → Create Item):
- [ ] The **Create Item** dialog lists all eight types (weapon, gear, talent, trait, force field, cybernetic, psychic power, armour).
- [ ] Create a **Talent** → sheet shows Tier (1–3), Prerequisites, a multi-select **Aptitudes** (the 19-entry list), and a **rich-text Description** editor; type in each, close & reopen → values persisted.
- [ ] Create an **Armour** → six AP location boxes, Additive checkbox, craftsmanship/availability dropdowns, weight; set Body = 6, reopen → persisted.
- [ ] Create a **Force Field**, **Cybernetic**, **Gear**, **Trait**, **Psychic Power** → each opens with its fields and the description editor; no console errors.
- [ ] **F12 console**: no errors on create/edit.

- [ ] **Step 4:** Only if a fix was needed, commit it.

---

## Self-Review

**Spec coverage (§4):**
- 7 simple item types with the agreed fields → Tasks 2-3. ✓
- Rich-text descriptions, no `source` → Task 2 base model. ✓
- Gear keeps quantity (data), gains availability → Task 2. ✓
- Config aptitudes/availability/craftsmanship → Task 1. ✓
- Embedded affliction (name+description) + injury (description) arrays on the actor → Task 4. ✓
- Generic item edit sheet + registration → Task 5. ✓

**Deferred (declared):** weapon + weaponMod (Plan 5); rendering items on actor tabs; quantity control on the actor Gear tab; the affliction/injury inline edit UI (Afflictions/Combat tabs).

**Placeholder scan:** every code step is complete; the checklist uses concrete values (Talent fields, Armour Body=6). ✓

**Type/name consistency:** all six new models extend `BaseItemModel` and spread `...super.defineSchema()`; choices reference `Object.keys(BDH.craftsmanship)`/`Object.keys(BDH.availability)`; talent `aptitudes` choices = `BDH.aptitudes`. Item-sheet context booleans (`isTalent`…`isArmour`) match the template `{{#if}}` guards; dropdown choices (`craftChoices`/`availChoices`/`tierChoices`/`aptitudeChoices`) match the template `selectOptions` calls; `prose-mirror name="system.description"` matches the HTMLField. Registered type keys (`talent`,`trait`,`forceField`,`cybernetic`,`psychicPower`,`armour`) match `template.json`, `CONFIG.Item.dataModels`, and `BDH.itemTypes`. The `Items.registerSheet`/`unregisterSheet` + `foundry.appv1.sheets.ItemSheet` paths mirror the verified Actors registration from Plan 1.
```
