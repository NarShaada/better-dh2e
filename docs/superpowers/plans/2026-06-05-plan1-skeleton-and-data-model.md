# Better DH2e — Plan 1: System Skeleton & Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an installable, Foundry-v13-native `better-dh2e` game system with Actor/Item DataModels and correct, unit-tested derived stats — the foundation every later plan builds on.

**Architecture:** All derived-stat math lives in **pure, Foundry-free functions** in `scripts/helpers/derived.mjs`, unit-tested with Vitest (no Foundry runtime needed). Foundry `TypeDataModel` classes define the schema with `foundry.data.fields` and call those pure functions inside `prepareDerivedData()`. Document classes (`DarkHeresyActor`, `DarkHeresyItem`) and a minimal ApplicationV2 sheet wire it into Foundry. The system ships as native ES modules (no bundler) so Foundry serves the files directly; a deploy script rsyncs to the remote for in-app verification.

**Tech Stack:** Foundry VTT v13 (ApplicationV2, `foundry.data.fields`, `TypeDataModel`), native ES modules, Vitest for unit tests, Handlebars templates, rsync/ssh for deploy.

**Scope of THIS plan:** scaffolding + tooling; CONFIG constants; pure derived math (characteristic total/bonus, skill totals, fatigue max, movement); Actor DataModels (acolyte, npc); the Item DataModel **pattern** with two representative types (`weapon`, `gear`); document classes; `system.json`/`template.json`/lang; a minimal registering ApplicationV2 actor sheet that renders the tab shell; deploy + manual verification.

**Out of scope (later plans):** the remaining item types (armour, forceField, talent, trait, psychicPower, cybernetic, mutation, malignancy, mentalDisorder, criticalInjury, aptitude — same pattern as Task 6, enumerated in spec §4); full sheet UI per the mockups; the resolution pipeline and rolls; advancement logic; item edit sheets.

**Reference:** design spec `docs/superpowers/specs/2026-06-05-better-dh2e-character-sheet-design.md` (data model §4, derived rules §3).

---

## File Structure

```
better-dh2e/                         (repo root = working dir; Foundry ignores docs/, reference/, test/, node_modules/)
  system.json                        system manifest (v13 compatibility, esmodules, styles, languages, packs)
  template.json                      declares Actor/Item subtypes (schema comes from DataModels)
  package.json                       npm metadata + vitest scripts
  vitest.config.mjs                  test runner config
  lang/en.json                       i18n strings
  styles/better-dh2e.css             minimal stylesheet (placeholder)
  scripts/
    better-dh2e.mjs                  entry: init hook; registers config, data models, documents, sheets
    config.mjs                       BDH constant: characteristics, skills, skill-rank map, item/actor type lists
    helpers/
      derived.mjs                    PURE functions (no Foundry import): characteristic/skill/fatigue/movement math
    data/
      actor/
        base-actor-model.mjs         shared schema fields (characteristics, skills, resources) + shared derive
        acolyte-model.mjs            extends base; bio, experience, corruption, insanity, aptitudes
        npc-model.mjs                extends base; faction, threatLevel
      item/
        base-item-model.mjs          shared item fields (description, source)
        weapon-model.mjs             weapon schema
        gear-model.mjs               generic gear schema
    documents/
      actor.mjs                      DarkHeresyActor (prepareDerivedData → derived.mjs)
      item.mjs                       DarkHeresyItem
    sheets/
      actor-sheet.mjs                minimal ApplicationV2 ActorSheet shell (tab nav only)
  templates/
    actor/actor-shell.hbs            minimal tab-shell template
  test/
    derived.test.mjs                 Vitest unit tests for derived.mjs
  tools/
    deploy.sh                        rsync system files to the remote Foundry
```

---

### Task 1: Project scaffolding & tooling

**Files:**
- Create: `package.json`
- Create: `vitest.config.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "better-dh2e",
  "version": "0.1.0",
  "description": "A fresh, Foundry-v13-native Dark Heresy 2e game system.",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy": "bash tools/deploy.sh"
  },
  "devDependencies": {
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `vitest.config.mjs`**

```javascript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mjs"],
    environment: "node"
  }
});
```

- [ ] **Step 3: Add Node artifacts to `.gitignore`**

Append these lines to the existing `.gitignore`:

```
# Node
node_modules/
npm-debug.log*
```

- [ ] **Step 4: Install dependencies**

Run: `npm install`
Expected: creates `node_modules/` and `package-lock.json`, no errors.

- [ ] **Step 5: Verify the test runner is wired (no tests yet is an error, so create a throwaway)**

Run: `npx vitest run --reporter=dot 2>&1 | tail -5`
Expected: it reports "No test files found" (acceptable at this point — confirms vitest executes).

- [ ] **Step 6: Commit**

```bash
git add package.json vitest.config.mjs package-lock.json .gitignore
git commit -m "chore: scaffold better-dh2e system tooling (npm + vitest)"
```

---

### Task 2: CONFIG constants

**Files:**
- Create: `scripts/config.mjs`

The characteristics and skills tables are needed by both the derived math and the data models. Keep them as plain data.

- [ ] **Step 1: Create `scripts/config.mjs`**

```javascript
/** Static configuration for the Better DH2e system. Plain data only — no Foundry calls. */
export const BDH = {};

/** The ten characteristics, in sheet order. `short` is the FFG abbreviation. */
BDH.characteristics = {
  weaponSkill:    { label: "BDH.Char.WeaponSkill",    short: "WS"  },
  ballisticSkill: { label: "BDH.Char.BallisticSkill", short: "BS"  },
  strength:       { label: "BDH.Char.Strength",       short: "S"   },
  toughness:      { label: "BDH.Char.Toughness",      short: "T"   },
  agility:        { label: "BDH.Char.Agility",        short: "Ag"  },
  intelligence:   { label: "BDH.Char.Intelligence",   short: "Int" },
  perception:     { label: "BDH.Char.Perception",     short: "Per" },
  willpower:      { label: "BDH.Char.Willpower",       short: "WP"  },
  fellowship:     { label: "BDH.Char.Fellowship",     short: "Fel" },
  influence:      { label: "BDH.Char.Influence",      short: "Inf" }
};

/** Skill rank -> flat bonus added to the governing characteristic. */
BDH.skillRanks = {
  untrained:   -20,
  known:         0,
  trained:      10,
  experienced:  20,
  veteran:      30
};

/**
 * Core (non-specialist) skills with their governing characteristic key.
 * Specialist skills are added in a later plan; the data-model pattern is the same.
 */
BDH.skills = {
  acrobatics:  { label: "BDH.Skill.Acrobatics",  characteristic: "agility"      },
  athletics:   { label: "BDH.Skill.Athletics",   characteristic: "strength"     },
  awareness:   { label: "BDH.Skill.Awareness",   characteristic: "perception"   },
  charm:       { label: "BDH.Skill.Charm",       characteristic: "fellowship"   },
  command:     { label: "BDH.Skill.Command",     characteristic: "fellowship"   },
  deceive:     { label: "BDH.Skill.Deceive",     characteristic: "fellowship"   },
  dodge:       { label: "BDH.Skill.Dodge",       characteristic: "agility"      },
  inquiry:     { label: "BDH.Skill.Inquiry",     characteristic: "fellowship"   },
  logic:       { label: "BDH.Skill.Logic",       characteristic: "intelligence" },
  medicae:     { label: "BDH.Skill.Medicae",     characteristic: "intelligence" },
  parry:       { label: "BDH.Skill.Parry",       characteristic: "weaponSkill"  },
  scrutiny:    { label: "BDH.Skill.Scrutiny",    characteristic: "perception"   },
  stealth:     { label: "BDH.Skill.Stealth",     characteristic: "agility"      },
  survival:    { label: "BDH.Skill.Survival",    characteristic: "perception"   }
};

BDH.actorTypes = ["acolyte", "npc"];
BDH.itemTypes  = ["weapon", "gear"];
```

- [ ] **Step 2: Commit**

```bash
git add scripts/config.mjs
git commit -m "feat: add BDH config constants (characteristics, skills, ranks)"
```

---

### Task 3: Pure derived-stat math (TDD)

This is the testable core. `derived.mjs` imports **nothing** from Foundry, so Vitest can test it directly.

**Files:**
- Create: `test/derived.test.mjs`
- Create: `scripts/helpers/derived.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
// test/derived.test.mjs
import { describe, it, expect } from "vitest";
import {
  characteristicTotal,
  characteristicBonus,
  skillTotal,
  fatigueMax,
  movement
} from "../scripts/helpers/derived.mjs";

describe("characteristicTotal", () => {
  it("sums base and advance", () => {
    expect(characteristicTotal({ base: 30, advance: 5 })).toBe(35);
  });
  it("treats missing advance as 0", () => {
    expect(characteristicTotal({ base: 42 })).toBe(42);
  });
});

describe("characteristicBonus", () => {
  it("is the tens digit of the total", () => {
    expect(characteristicBonus({ base: 42, advance: 0 })).toBe(4);
    expect(characteristicBonus({ base: 30, advance: 5 })).toBe(3); // 35 -> 3
  });
  it("adds unnatural to the bonus", () => {
    expect(characteristicBonus({ base: 40, advance: 0, unnatural: 2 })).toBe(6);
  });
});

describe("skillTotal", () => {
  it("adds the rank bonus to the characteristic total", () => {
    // characteristic total 40, rank 'trained' (+10) -> 50
    expect(skillTotal(40, "trained")).toBe(50);
  });
  it("applies the -20 untrained penalty", () => {
    expect(skillTotal(40, "untrained")).toBe(20);
  });
  it("defaults unknown ranks to untrained", () => {
    expect(skillTotal(40, "nonsense")).toBe(20);
  });
});

describe("fatigueMax", () => {
  it("is toughness bonus + willpower bonus", () => {
    expect(fatigueMax(4, 3)).toBe(7);
  });
});

describe("movement", () => {
  it("derives half/full/charge/run from agility bonus and size", () => {
    // AgB 3, size 4 (default): half = 3 + (4-4) = 3
    expect(movement(3, 4)).toEqual({ half: 3, full: 6, charge: 9, run: 18 });
  });
  it("applies the size modifier", () => {
    // AgB 3, size 6: half = 3 + (6-4) = 5
    expect(movement(3, 6)).toEqual({ half: 5, full: 10, charge: 15, run: 30 });
  });
  it("never goes below a half move of 0", () => {
    expect(movement(0, 1).half).toBe(0); // 0 + (1-4) = -3 -> clamped to 0
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/derived.test.mjs`
Expected: FAIL — cannot import from `derived.mjs` (module/exports do not exist).

- [ ] **Step 3: Write the minimal implementation**

```javascript
// scripts/helpers/derived.mjs
// PURE math — do NOT import anything from Foundry here. Keeps this unit-testable.
import { BDH } from "../config.mjs";

/** total = base + advance */
export function characteristicTotal(characteristic) {
  return (characteristic.base ?? 0) + (characteristic.advance ?? 0);
}

/** bonus = tens digit of total, plus any unnatural bonus */
export function characteristicBonus(characteristic) {
  const total = characteristicTotal(characteristic);
  return Math.floor(total / 10) + (characteristic.unnatural ?? 0);
}

/** skill total = governing characteristic total + flat rank bonus */
export function skillTotal(characteristicTotalValue, rank) {
  const bonus = BDH.skillRanks[rank] ?? BDH.skillRanks.untrained;
  return characteristicTotalValue + bonus;
}

/** fatigue threshold = toughness bonus + willpower bonus */
export function fatigueMax(toughnessBonus, willpowerBonus) {
  return toughnessBonus + willpowerBonus;
}

/** movement rates from agility bonus and creature size (default size 4) */
export function movement(agilityBonus, size = 4) {
  const half = Math.max(0, agilityBonus + (size - 4));
  return { half, full: half * 2, charge: half * 3, run: half * 6 };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/derived.test.mjs`
Expected: PASS — all 11 assertions green.

- [ ] **Step 5: Commit**

```bash
git add test/derived.test.mjs scripts/helpers/derived.mjs
git commit -m "feat: add pure derived-stat math with unit tests"
```

---

### Task 4: Actor DataModels

These define the schema with `foundry.data.fields` and call the pure functions in `prepareDerivedData`. They are exercised by loading in Foundry (Task 9), not by Vitest (they need the Foundry runtime).

**Files:**
- Create: `scripts/data/actor/base-actor-model.mjs`
- Create: `scripts/data/actor/acolyte-model.mjs`
- Create: `scripts/data/actor/npc-model.mjs`

- [ ] **Step 1: Create the base actor model**

```javascript
// scripts/data/actor/base-actor-model.mjs
import { BDH } from "../../config.mjs";
import { characteristicTotal, characteristicBonus, skillTotal, fatigueMax, movement } from "../../helpers/derived.mjs";

const fields = foundry.data.fields;

/** Build the characteristics schema: one object per characteristic with base/advance/unnatural. */
function characteristicsSchema() {
  const schema = {};
  for (const key of Object.keys(BDH.characteristics)) {
    schema[key] = new fields.SchemaField({
      base:      new fields.NumberField({ required: true, integer: true, initial: 25, min: 0 }),
      advance:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      unnatural: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    });
  }
  return new fields.SchemaField(schema);
}

/** Build the skills schema: one object per skill with a rank string. */
function skillsSchema() {
  const schema = {};
  for (const key of Object.keys(BDH.skills)) {
    schema[key] = new fields.SchemaField({
      rank: new fields.StringField({
        required: true,
        choices: Object.keys(BDH.skillRanks),
        initial: "untrained"
      })
    });
  }
  return new fields.SchemaField(schema);
}

export class BaseActorModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      characteristics: characteristicsSchema(),
      skills: skillsSchema(),
      wounds: new fields.SchemaField({
        value:    new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:      new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        critical: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      fatigue: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      fate: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      size: new fields.NumberField({ required: true, integer: true, initial: 4, min: 0 })
    };
  }

  /** Compute derived characteristic totals/bonuses, skill totals, fatigue max, movement. */
  prepareDerivedData() {
    for (const c of Object.values(this.characteristics)) {
      c.total = characteristicTotal(c);
      c.bonus = characteristicBonus(c);
    }
    for (const [key, skill] of Object.entries(this.skills)) {
      const charKey = BDH.skills[key].characteristic;
      skill.total = skillTotal(this.characteristics[charKey].total, skill.rank);
    }
    this.fatigue.max = fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
    this.movement = movement(this.characteristics.agility.bonus, this.size);
  }
}
```

- [ ] **Step 2: Create the acolyte model**

```javascript
// scripts/data/actor/acolyte-model.mjs
import { BaseActorModel } from "./base-actor-model.mjs";

const fields = foundry.data.fields;

export class AcolyteModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      bio: new fields.SchemaField({
        homeWorld:  new fields.StringField({ required: true, initial: "" }),
        background: new fields.StringField({ required: true, initial: "" }),
        role:       new fields.StringField({ required: true, initial: "" }),
        elite:      new fields.StringField({ required: true, initial: "" })
      }),
      experience: new fields.SchemaField({
        total: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      corruption: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      insanity:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    };
  }
}
```

- [ ] **Step 3: Create the npc model**

```javascript
// scripts/data/actor/npc-model.mjs
import { BaseActorModel } from "./base-actor-model.mjs";

const fields = foundry.data.fields;

export class NpcModel extends BaseActorModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      faction:     new fields.StringField({ required: true, initial: "" }),
      threatLevel: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      notes:       new fields.HTMLField({ required: true, initial: "" })
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data/actor/
git commit -m "feat: add actor data models (base, acolyte, npc)"
```

---

### Task 5: Item DataModels (pattern: base + weapon + gear)

**Files:**
- Create: `scripts/data/item/base-item-model.mjs`
- Create: `scripts/data/item/weapon-model.mjs`
- Create: `scripts/data/item/gear-model.mjs`

- [ ] **Step 1: Create the base item model**

```javascript
// scripts/data/item/base-item-model.mjs
const fields = foundry.data.fields;

export class BaseItemModel extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: true, initial: "" }),
      source:      new fields.StringField({ required: true, initial: "" })
    };
  }
}
```

- [ ] **Step 2: Create the weapon model**

```javascript
// scripts/data/item/weapon-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class WeaponModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      weaponClass: new fields.StringField({
        required: true,
        choices: ["melee", "pistol", "basic", "heavy", "thrown"],
        initial: "melee"
      }),
      range: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      rateOfFire: new fields.SchemaField({
        single: new fields.BooleanField({ initial: true }),
        burst:  new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        full:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      damage:      new fields.StringField({ required: true, initial: "1d10" }),
      damageType:  new fields.StringField({ required: true, choices: ["impact", "energy", "rending", "explosive"], initial: "impact" }),
      penetration: new fields.StringField({ required: true, initial: "0" }),
      clip: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        max:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      // Structured qualities — never free text — so the resolution pipeline (later plan) can trigger reliably.
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null })
      })),
      equipped: new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 3: Create the gear model**

```javascript
// scripts/data/item/gear-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class GearModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      craftsmanship: new fields.StringField({
        required: true,
        choices: ["poor", "normal", "good", "best"],
        initial: "normal"
      }),
      quantity: new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 }),
      weight:   new fields.NumberField({ required: true, initial: 0, min: 0 })
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data/item/
git commit -m "feat: add item data models (base, weapon, gear)"
```

---

### Task 6: Document classes

**Files:**
- Create: `scripts/documents/actor.mjs`
- Create: `scripts/documents/item.mjs`

- [ ] **Step 1: Create the actor document class**

```javascript
// scripts/documents/actor.mjs
// The system DataModel does the derived work; this subclass exists so we can add
// document-level helpers in later plans (rolls, applyDamage, etc.).
export class DarkHeresyActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    // this.system.prepareDerivedData() is invoked automatically by the TypeDataModel.
  }
}
```

- [ ] **Step 2: Create the item document class**

```javascript
// scripts/documents/item.mjs
export class DarkHeresyItem extends Item {}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/documents/
git commit -m "feat: add Actor/Item document subclasses"
```

---

### Task 7: Manifest, language file, styles, type declaration

**Files:**
- Create: `system.json`
- Create: `template.json`
- Create: `lang/en.json`
- Create: `styles/better-dh2e.css`

- [ ] **Step 1: Create `system.json`**

```json
{
  "id": "better-dh2e",
  "title": "Better Dark Heresy 2E",
  "description": "A fresh, Foundry-v13-native unofficial system for Dark Heresy 2nd Edition. Ships content-free.",
  "version": "0.1.0",
  "compatibility": { "minimum": "13", "verified": "13" },
  "authors": [{ "name": "BetterDH2e" }],
  "esmodules": ["scripts/better-dh2e.mjs"],
  "styles": ["styles/better-dh2e.css"],
  "languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }],
  "packs": [],
  "gridDistance": 1,
  "gridUnits": "m",
  "license": "LICENSE",
  "url": "https://example.invalid/better-dh2e",
  "manifest": "https://example.invalid/better-dh2e/system.json",
  "download": "https://example.invalid/better-dh2e/better-dh2e.zip"
}
```

- [ ] **Step 2: Create `template.json` (declares subtypes; schema comes from DataModels)**

```json
{
  "Actor": {
    "types": ["acolyte", "npc"],
    "acolyte": {},
    "npc": {}
  },
  "Item": {
    "types": ["weapon", "gear"],
    "weapon": {},
    "gear": {}
  }
}
```

- [ ] **Step 3: Create `lang/en.json`**

```json
{
  "BDH.Char.WeaponSkill": "Weapon Skill",
  "BDH.Char.BallisticSkill": "Ballistic Skill",
  "BDH.Char.Strength": "Strength",
  "BDH.Char.Toughness": "Toughness",
  "BDH.Char.Agility": "Agility",
  "BDH.Char.Intelligence": "Intelligence",
  "BDH.Char.Perception": "Perception",
  "BDH.Char.Willpower": "Willpower",
  "BDH.Char.Fellowship": "Fellowship",
  "BDH.Char.Influence": "Influence",
  "BDH.Skill.Acrobatics": "Acrobatics",
  "BDH.Skill.Athletics": "Athletics",
  "BDH.Skill.Awareness": "Awareness",
  "BDH.Skill.Charm": "Charm",
  "BDH.Skill.Command": "Command",
  "BDH.Skill.Deceive": "Deceive",
  "BDH.Skill.Dodge": "Dodge",
  "BDH.Skill.Inquiry": "Inquiry",
  "BDH.Skill.Logic": "Logic",
  "BDH.Skill.Medicae": "Medicae",
  "BDH.Skill.Parry": "Parry",
  "BDH.Skill.Scrutiny": "Scrutiny",
  "BDH.Skill.Stealth": "Stealth",
  "BDH.Skill.Survival": "Survival",
  "BDH.Sheet.Stats": "Stats",
  "BDH.Sheet.Abilities": "Abilities",
  "BDH.Sheet.Gear": "Gear",
  "BDH.Sheet.Notes": "Notes",
  "BDH.Sheet.Afflictions": "Afflictions",
  "BDH.Sheet.Psychic": "Psychic",
  "BDH.Sheet.Advancement": "Advancement"
}
```

- [ ] **Step 4: Create a placeholder `styles/better-dh2e.css`**

```css
/* Better DH2e — styles grow with the sheet in later plans. */
.better-dh2e .bdh-tabs { display: flex; gap: 0; }
.better-dh2e .bdh-tabs .item { padding: 6px 10px; cursor: pointer; }
.better-dh2e .bdh-tabs .item.active { font-weight: bold; }
```

- [ ] **Step 5: Commit**

```bash
git add system.json template.json lang/en.json styles/better-dh2e.css
git commit -m "feat: add system manifest, type declaration, lang, styles"
```

---

### Task 8: Minimal ApplicationV2 actor sheet + entry/registration

**Files:**
- Create: `templates/actor/actor-shell.hbs`
- Create: `scripts/sheets/actor-sheet.mjs`
- Create: `scripts/better-dh2e.mjs`

- [ ] **Step 1: Create the minimal tab-shell template**

```handlebars
{{!-- templates/actor/actor-shell.hbs --}}
<form class="better-dh2e">
  <header class="bdh-header">
    <input type="text" name="name" value="{{document.name}}" placeholder="Name"/>
  </header>
  <nav class="bdh-tabs sheet-tabs" data-group="primary">
    <a class="item" data-tab="stats">{{localize "BDH.Sheet.Stats"}}</a>
    <a class="item" data-tab="abilities">{{localize "BDH.Sheet.Abilities"}}</a>
    <a class="item" data-tab="gear">{{localize "BDH.Sheet.Gear"}}</a>
    <a class="item" data-tab="notes">{{localize "BDH.Sheet.Notes"}}</a>
    <a class="item" data-tab="afflictions">{{localize "BDH.Sheet.Afflictions"}}</a>
    <a class="item" data-tab="psychic">{{localize "BDH.Sheet.Psychic"}}</a>
    <a class="item" data-tab="advancement">{{localize "BDH.Sheet.Advancement"}}</a>
  </nav>
  <section class="bdh-body">
    <p>Characteristics (derived):</p>
    <ul>
      {{#each system.characteristics as |c key|}}
        <li>{{key}}: {{c.total}} (bonus {{c.bonus}})</li>
      {{/each}}
    </ul>
  </section>
</form>
```

- [ ] **Step 2: Create the minimal ApplicationV2 actor sheet**

```javascript
// scripts/sheets/actor-sheet.mjs
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class DarkHeresyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor"],
    position: { width: 760, height: 640 },
    window: { resizable: true }
  };

  static PARTS = {
    body: { template: "systems/better-dh2e/templates/actor/actor-shell.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.document = this.document;
    context.system = this.document.system;
    return context;
  }
}
```

- [ ] **Step 3: Create the entry module that registers everything**

```javascript
// scripts/better-dh2e.mjs
import { BDH } from "./config.mjs";
import { AcolyteModel } from "./data/actor/acolyte-model.mjs";
import { NpcModel } from "./data/actor/npc-model.mjs";
import { WeaponModel } from "./data/item/weapon-model.mjs";
import { GearModel } from "./data/item/gear-model.mjs";
import { DarkHeresyActor } from "./documents/actor.mjs";
import { DarkHeresyItem } from "./documents/item.mjs";
import { DarkHeresyActorSheet } from "./sheets/actor-sheet.mjs";

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
  CONFIG.Item.dataModels.gear = GearModel;

  // Sheets (ApplicationV2 registration)
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("better-dh2e", DarkHeresyActorSheet, {
    types: ["acolyte", "npc"],
    makeDefault: true,
    label: "Better DH2e Actor Sheet"
  });

  console.log("Better DH2e | Initialized");
});
```

- [ ] **Step 4: Commit**

```bash
git add templates/actor/actor-shell.hbs scripts/sheets/actor-sheet.mjs scripts/better-dh2e.mjs
git commit -m "feat: register data models, documents, and a minimal ApplicationV2 actor sheet"
```

---

### Task 9: Deploy to the remote Foundry & verify in-app

**Files:**
- Create: `tools/deploy.sh`

The remote Foundry (v13.351) data dir is `/opt/foundrydata/Data/systems`. We rsync the system files into `systems/better-dh2e/` over SSH. (The SSH password lives in `creds.txt`, which is gitignored.)

- [ ] **Step 1: Create `tools/deploy.sh`**

```bash
#!/usr/bin/env bash
# Deploy the better-dh2e system to the remote Foundry over SSH/rsync.
# Reads host from creds.txt line 1 (e.g. "ssh root@HOST") and password from line 2.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CREDS="$ROOT/creds.txt"
HOST="$(sed -n '1p' "$CREDS" | awk '{print $2}')"      # e.g. root@76.13.45.240
PW_FILE="$(mktemp)"; chmod 600 "$PW_FILE"
sed -n '2p' "$CREDS" | tr -d '\n' > "$PW_FILE"
trap 'rm -f "$PW_FILE"' EXIT

DEST="/opt/foundrydata/Data/systems/better-dh2e"

sshpass -f "$PW_FILE" ssh -o StrictHostKeyChecking=accept-new "$HOST" "mkdir -p $DEST"
sshpass -f "$PW_FILE" rsync -az --delete \
  -e "sshpass -f $PW_FILE ssh -o StrictHostKeyChecking=accept-new" \
  --include="system.json" --include="template.json" \
  --include="scripts/***" --include="templates/***" \
  --include="styles/***" --include="lang/***" \
  --exclude="*" \
  "$ROOT/" "$HOST:$DEST/"

echo "Deployed to $HOST:$DEST"
```

- [ ] **Step 2: Make it executable and run the full test suite first**

Run: `chmod +x tools/deploy.sh && npm test`
Expected: Vitest PASS (the derived tests from Task 3).

- [ ] **Step 3: Deploy**

Run: `npm run deploy`
Expected: "Deployed to root@76.13.45.240:/opt/foundrydata/Data/systems/better-dh2e".

- [ ] **Step 4: Restart the remote Foundry so it picks up the new system**

Run: `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart all'`
Expected: pm2 reports the foundry process restarted.

- [ ] **Step 5: Manual verification checklist (in the browser, against the running Foundry)**

Create a **new world** using the **Better Dark Heresy 2E** system (do NOT touch the existing `dh2e` world), then:
- [ ] The system appears in Game Systems and the world launches with no console errors.
- [ ] Create an Actor of type **Acolyte** — the sheet opens and shows the seven tab labels.
- [ ] Set Toughness base to 42 → the sheet's characteristic list shows Toughness **total 42, bonus 4**.
- [ ] Set Agility base to 30 → Agility bonus **3**; confirm no console errors on `prepareDerivedData`.
- [ ] Create an Actor of type **NPC** and an Item of type **Weapon** and **Gear** — all open without errors.

- [ ] **Step 6: Commit**

```bash
git add tools/deploy.sh
git commit -m "chore: add remote deploy script and verify system loads in Foundry v13"
```

---

## Self-Review

**Spec coverage (Plan 1 slice):**
- System skeleton / V13-native / standalone id → Tasks 1, 7, 8 (`better-dh2e`, ApplicationV2, `compatibility` 13). ✓
- Data model: actors (acolyte, npc) with characteristics base/advance/unnatural → total/bonus, skills, wounds (threshold), fatigue, fate → Task 4. ✓
- Derived rules (DoS formula etc. are later; bonus = tens digit, fatigue = TB+WB, movement) → Task 3, unit-tested. ✓
- Structured weapon qualities (not free text) → Task 5 (`qualities` array). ✓
- Item pattern (weapon, gear) → Task 5; remaining item types explicitly deferred (stated in scope). ✓
- Content-free (empty packs) → Task 7 (`"packs": []`). ✓
- Does NOT touch installed `dark-heresy`/`dh2e` → new id + new world in verification. ✓

**Deferred (declared, not gaps):** remaining item types, full sheet UI, resolution pipeline, rolls, advancement logic, item edit sheets, NPC limited view. These are later plans per spec §4/§6/§8/§13.

**Placeholder scan:** no TBD/TODO; every code step has complete code; manual-verification steps are concrete (exact values: T42→bonus4). ✓

**Type consistency:** `characteristicTotal`/`characteristicBonus`/`skillTotal`/`fatigueMax`/`movement` signatures match between `derived.mjs`, the tests, and `base-actor-model.mjs`. Skill `rank` choices match `BDH.skillRanks` keys. DataModel type keys (`acolyte`,`npc`,`weapon`,`gear`) match `template.json` and the registration in `better-dh2e.mjs`. ✓
