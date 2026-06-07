# Better DH2e — Plan 29: Psychic Power data model + sheet

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flesh out the `psychicPower` item — the full field schema (discipline, focus test, resolution `type`, attack stats, scope/duration, cost) + a proper edit sheet + a richer Psychic-tab display. This is the scaffolding the manifest engine (next sub-project) reads; no manifest behaviour here.

**Architecture:** A resolution `type` (Effect / Psychic Bolt / Barrage / Storm / Blast) drives later automation: the four attack types funnel into the existing `rollAttack` pipeline (stats resolved from effective PR; manifest roll = the to-hit; `blastRadius` → a Blast(X) quality), while Effect is narrative-only. A pure `isPsychicAttack(type)` helper gates attack-only fields. The focus test references a characteristic **or** skill via a `<datalist>` autocomplete (a full dropdown would be too large).

**Tech Stack:** Foundry v13/v14 DataModels + DocumentSheetV2, Vitest, Handlebars.

**Scope:** schema + item edit sheet + tab display. **Out of scope:** manifesting (focus roll, effective-PR stat resolution, attack-pipeline wiring, phenomena/perils) — the next sub-project; buying powers in advancement — later.

**Reference (confirmed):** `type` default Effect; opposed (contested focus roll) replaces a separate resistance type; `opposedBy` default Willpower; `blastRadius` is exactly Blast(X); attack powers become normal attacks once PR-resolved (same pipeline). Focus test can be a char or skill.

Builds on the item-sheet type-section pattern (`context.isWeapon` + `{{#if isWeapon}}…selectOptions…`), `BDH.damageTypes`, and the Psychic tab from Plan 11.

---

## File Structure

```
scripts/config.mjs                       MODIFY  BDH.disciplines, BDH.psychicTypes, BDH.psychicActions
scripts/data/item/psychic-power-model.mjs MODIFY  full field schema
scripts/helpers/psychic-data.mjs         NEW     isPsychicAttack
test/psychic-data.test.mjs               NEW     Vitest
scripts/sheets/item-sheet.mjs            MODIFY  isPsychicPower context (choices, focus datalist, conditional flags)
templates/item/item-sheet.hbs            MODIFY  psychicPower edit section
scripts/sheets/actor-sheet.mjs           MODIFY  psychicPowers rows show type/discipline/focus/action
templates/actor/actor-sheet.hbs          MODIFY  Psychic tab power-row stats
```

---

### Task 1: Config + model + helper (TDD)

**Files:** `scripts/config.mjs`, `scripts/data/item/psychic-power-model.mjs`; create `test/psychic-data.test.mjs`, `scripts/helpers/psychic-data.mjs`.

- [ ] **Step 1: Config.** In `scripts/config.mjs`, add:
```javascript
/** Psychic disciplines (key -> label). */
BDH.disciplines = { biomancy: "Biomancy", divination: "Divination", pyromancy: "Pyromancy", telekinesis: "Telekinesis", telepathy: "Telepathy", minor: "Minor / Other" };
/** Psychic power resolution type (key -> label). bolt/barrage/storm/blast are attacks (see isPsychicAttack). */
BDH.psychicTypes = { effect: "Effect", bolt: "Psychic Bolt", barrage: "Psychic Barrage", storm: "Psychic Storm", blast: "Psychic Blast" };
/** Action to manifest (key -> label). */
BDH.psychicActions = { free: "Free", half: "Half", full: "Full", reaction: "Reaction" };
```

- [ ] **Step 2: Failing test** `test/psychic-data.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { isPsychicAttack, PSYCHIC_ATTACK_TYPES } from "../scripts/helpers/psychic-data.mjs";

describe("isPsychicAttack", () => {
  it("bolt/barrage/storm/blast are attacks; effect is not", () => {
    expect(isPsychicAttack("bolt")).toBe(true);
    expect(isPsychicAttack("barrage")).toBe(true);
    expect(isPsychicAttack("storm")).toBe(true);
    expect(isPsychicAttack("blast")).toBe(true);
    expect(isPsychicAttack("effect")).toBe(false);
    expect(isPsychicAttack(undefined)).toBe(false);
  });
  it("exposes the set", () => {
    expect(PSYCHIC_ATTACK_TYPES.has("storm")).toBe(true);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/psychic-data.test.mjs`.

- [ ] **Step 4: Implement** `scripts/helpers/psychic-data.mjs`:
```javascript
// scripts/helpers/psychic-data.mjs — PURE. Psychic power helpers.

/** Resolution types that route through the attack pipeline. */
export const PSYCHIC_ATTACK_TYPES = new Set(["bolt", "barrage", "storm", "blast"]);

/** Whether a power's resolution type is an attack (deals damage via the attack pipeline). */
export function isPsychicAttack(type) {
  return PSYCHIC_ATTACK_TYPES.has(type);
}
```

- [ ] **Step 5: Implement the model** `scripts/data/item/psychic-power-model.mjs`:
```javascript
// scripts/data/item/psychic-power-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";
import { BDH } from "../../config.mjs";

export class PsychicPowerModel extends BaseItemModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),     // description (the effect body)
      discipline:    new fields.StringField({ required: true, choices: Object.keys(BDH.disciplines), initial: "minor" }),
      type:          new fields.StringField({ required: true, choices: Object.keys(BDH.psychicTypes), initial: "effect" }),
      prerequisite:  new fields.StringField({ required: true, initial: "" }),
      // Focus Power test: a characteristic OR skill key (autocomplete in the sheet), resolved at manifest.
      focusTest:     new fields.StringField({ required: true, initial: "willpower" }),
      focusModifier: new fields.NumberField({ required: true, integer: true, initial: 0 }),
      opposed:       new fields.BooleanField({ required: true, initial: false }),
      opposedBy:     new fields.StringField({ required: true, choices: Object.keys(BDH.characteristics), initial: "willpower" }),
      range:         new fields.StringField({ required: true, initial: "" }),
      sustained:     new fields.BooleanField({ required: true, initial: false }),
      duration:      new fields.StringField({ required: true, initial: "" }),
      action:        new fields.StringField({ required: true, choices: Object.keys(BDH.psychicActions), initial: "half" }),
      // Attack stats (used when type ∈ attack types). Text so they can reference PR (substituted at manifest).
      damage:        new fields.StringField({ required: true, initial: "" }),
      damageType:    new fields.StringField({ required: true, choices: Object.keys(BDH.damageTypes), initial: "energy" }),
      penetration:   new fields.StringField({ required: true, initial: "0" }),
      blastRadius:   new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),   // Blast(X) for type "blast"
      cost:          new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
    };
  }
}
```

- [ ] **Step 6: Run — PASS + checks.** `npx vitest run test/psychic-data.test.mjs`, then `node --check scripts/config.mjs scripts/data/item/psychic-power-model.mjs scripts/helpers/psychic-data.mjs && npm test`.

- [ ] **Step 7: Commit.**
```bash
git add scripts/config.mjs scripts/data/item/psychic-power-model.mjs scripts/helpers/psychic-data.mjs test/psychic-data.test.mjs
git commit -m "feat: psychic power data model + disciplines/types/actions config + isPsychicAttack (TDD)"
```

---

### Task 2: psychicPower edit sheet

**Files:** `scripts/sheets/item-sheet.mjs`, `templates/item/item-sheet.hbs`

- [ ] **Step 1: Context.** In `item-sheet.mjs` `_prepareContext`, add the type flag with the others (`context.isWeapon = ...`):
```javascript
    context.isPsychicPower = t === "psychicPower";
```
Then add a block (mirroring the `if (context.isWeapon)` block) that supplies the choices, the focus-test datalist, and the conditional flags:
```javascript
    if (context.isPsychicPower) {
      const s = this.document.system;
      context.disciplines = BDH.disciplines;
      context.psychicTypes = BDH.psychicTypes;
      context.psychicActions = BDH.psychicActions;
      context.damageTypes = BDH.damageTypes;
      context.charChoices = Object.fromEntries(Object.entries(BDH.characteristics).map(([k, c]) => [k, game.i18n.localize(c.label)]));
      // Focus test autocomplete options: characteristics + skills (key -> label).
      context.focusOptions = [
        ...Object.entries(BDH.characteristics).map(([k, c]) => ({ key: k, label: game.i18n.localize(c.label) })),
        ...Object.entries(BDH.skills).map(([k, sk]) => ({ key: k, label: game.i18n.localize(sk.label) })),
      ];
      context.psyIsAttack = isPsychicAttack(s.type);
      context.psyIsBlast = s.type === "blast";
      context.psyOpposed = s.opposed;
    }
```
(Import `isPsychicAttack` from `../helpers/psychic-data.mjs`; `BDH` is already imported.)

- [ ] **Step 2: Template.** In `templates/item/item-sheet.hbs`, add a section (near the other `{{#if isWeapon}}` blocks):
```handlebars
  {{#if isPsychicPower}}
    <div class="bdh-fields">
      <label>Discipline</label><select name="system.discipline">{{selectOptions disciplines selected=system.discipline}}</select>
      <label>Type</label><select name="system.type">{{selectOptions psychicTypes selected=system.type}}</select>
      <label>Action</label><select name="system.action">{{selectOptions psychicActions selected=system.action}}</select>
      <label>Focus Test</label><input type="text" name="system.focusTest" value="{{system.focusTest}}" list="bdh-focus-opts"/>
      <datalist id="bdh-focus-opts">{{#each focusOptions}}<option value="{{this.key}}">{{this.label}}</option>{{/each}}</datalist>
      <label>Focus Modifier</label><input type="number" name="system.focusModifier" value="{{system.focusModifier}}"/>
      <label>Opposed</label><input type="checkbox" name="system.opposed" {{checked system.opposed}}/>
      {{#if psyOpposed}}<label>Opposed By</label><select name="system.opposedBy">{{selectOptions charChoices selected=system.opposedBy}}</select>{{/if}}
      <label>Range</label><input type="text" name="system.range" value="{{system.range}}"/>
      <label>Duration</label><input type="text" name="system.duration" value="{{system.duration}}"/>
      <label>Sustained</label><input type="checkbox" name="system.sustained" {{checked system.sustained}}/>
      <label>Prerequisite</label><input type="text" name="system.prerequisite" value="{{system.prerequisite}}"/>
      <label>XP Cost</label><input type="number" name="system.cost" value="{{system.cost}}" min="0"/>
      {{#if psyIsAttack}}
        <label>Damage</label><input type="text" name="system.damage" value="{{system.damage}}"/>
        <label>Damage Type</label><select name="system.damageType">{{selectOptions damageTypes selected=system.damageType}}</select>
        <label>Penetration</label><input type="text" name="system.penetration" value="{{system.penetration}}"/>
        {{#if psyIsBlast}}<label>Blast Radius (m)</label><input type="number" name="system.blastRadius" value="{{system.blastRadius}}" min="0"/>{{/if}}
      {{/if}}
    </div>
  {{/if}}
```
(`{{checked}}` is the standard Foundry helper. Named inputs auto-save; changing `type`/`opposed` re-renders so the conditional rows appear. Damage/range/penetration are text so they can hold PR-referencing formulas.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/sheets/item-sheet.mjs && npm test`.
```bash
git add scripts/sheets/item-sheet.mjs templates/item/item-sheet.hbs
git commit -m "feat: psychicPower edit sheet (discipline/type/focus-test autocomplete/opposed/attack stats)"
```

---

### Task 3: Psychic-tab power rows show key stats

**Files:** `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Context.** In `actor-sheet.mjs`, enrich `context.psychicPowers` (currently `{ id, name, desc }`):
```javascript
    context.psychicPowers = items.filter((i) => i.type === "psychicPower").map((p) => {
      const s = p.system;
      const focusLabel = (CONFIG.BDH.characteristics[s.focusTest] && game.i18n.localize(CONFIG.BDH.characteristics[s.focusTest].label))
        ?? (CONFIG.BDH.skills[s.focusTest] && game.i18n.localize(CONFIG.BDH.skills[s.focusTest].label)) ?? s.focusTest;
      const bits = [
        CONFIG.BDH.psychicTypes[s.type] ?? s.type,
        CONFIG.BDH.disciplines[s.discipline] ?? s.discipline,
        `${focusLabel}${s.focusModifier ? ` ${s.focusModifier > 0 ? "+" : ""}${s.focusModifier}` : ""}${s.opposed ? " (opposed)" : ""}`,
        CONFIG.BDH.psychicActions[s.action] ?? s.action,
        s.sustained ? "Sustained" : null,
      ].filter(Boolean);
      return { id: p.id, name: p.name, summary: bits.join(" · "), desc: firstLine(s.description) };
    });
```
(Reuse the existing `firstLine` helper used for other item rows.)

- [ ] **Step 2: Template.** In the Psychic tab power-row, add the summary line. Change the row to:
```handlebars
        <div class="bdh-item-row" data-item-id="{{p.id}}">
          <span class="bdh-name" data-action="editItem">{{p.name}}</span>
          <span class="bdh-desc-line">{{p.summary}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
```

- [ ] **Step 3: Verify and commit.** `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs
git commit -m "feat: Psychic tab shows each power's type/discipline/focus/action summary"
```

---

### Task 4: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (an actor on the dh2e sandbox; create/open a psychic power):
- [ ] **Edit sheet:** opening a psychicPower shows Discipline / Type / Action dropdowns, a **Focus Test** text box that **autocompletes** characteristics + skills, Focus Modifier, an **Opposed** checkbox that reveals **Opposed By** when ticked, Range / Duration / Sustained / Prerequisite / XP Cost.
- [ ] **Type-driven fields:** set Type = **Psychic Bolt** → Damage / Damage Type / Penetration appear; set Type = **Psychic Blast** → a **Blast Radius** field also appears; set Type = **Effect** → the attack stats disappear.
- [ ] **Focus Test = a skill** (e.g. Psyniscience) saves and reads back.
- [ ] **Psychic tab:** each power row shows a summary like **"Psychic Bolt · Pyromancy · Willpower +0 · Half"** (and "Sustained" / "(opposed)" when set).
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + model + helper (Task 1, TDD); edit sheet with conditional attack/blast/opposed fields + focus-test autocomplete (Task 2); tab summary (Task 3). ✓ Scaffolding for the manifest engine.

**Deferred (declared):** manifesting / effective-PR stat resolution / attack-pipeline wiring / phenomena/perils (next sub-project); advancement buy.

**Placeholder scan:** complete; checklist concrete (type Bolt→damage fields; Blast→blastRadius; focus skill autocomplete).

**Type/name consistency:** `isPsychicAttack`/`PSYCHIC_ATTACK_TYPES` match the Task-1 test + the sheet's `psyIsAttack`. Model fields use `choices: Object.keys(BDH.*)` for the enums (discipline/type/opposedBy/damageType/action) with safe initials; `focusTest` is a free StringField (char/skill key) backed by a `<datalist>`; attack stats (`damage`/`penetration`) are text for PR formulas; `blastRadius` maps to Blast(X) later. The item sheet adds `context.isPsychicPower` + a context block mirroring the weapon block (`charChoices`, `focusOptions`, `psyIsAttack`, `psyIsBlast`, `psyOpposed`); the template gates attack rows on `psyIsAttack`, the blast row on `psyIsBlast`, opposedBy on `psyOpposed`. The tab summary resolves `focusTest` against characteristics then skills.
