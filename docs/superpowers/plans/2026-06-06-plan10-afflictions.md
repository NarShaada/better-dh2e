# Better DH2e — Plan 10: Afflictions Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the **Afflictions** tab: **Corruption** and **Insanity** tracks (value + track tier + test penalty + "next test at" + a **Malignancy / Trauma** test button = a Willpower test at the track penalty), the embedded **Mutations / Malignancies / Mental Disorders** lists (name + effect; inline add/edit/remove), and **Cybernetics** (items; create/edit/delete reused).

**Architecture:** Track tiers/penalties are **pure, tested helpers**. Corruption/Insanity move to the base actor model (so both actors have them). The test button reuses the roll dialog (`promptTest` gains a default-modifier so the penalty pre-fills) → a Willpower `performTest`. The embedded `{name,description}` arrays are edited via no-name inputs wired in `_onRender` (generic, data-array/data-field driven) + add/remove actions; cybernetics reuse the item actions.

**Tech Stack:** Foundry v13 (ApplicationV2 `actions`, `actor.update`, the existing `roll-test.mjs`), Vitest, Handlebars.

**Scope of THIS plan:** the Afflictions tab content + the track helpers + the affliction test.

**Out of scope:** auto-prompting tests on threshold crossings (spec §8 P2); applying malignancy/disorder results automatically; Psychic/Advancement; the full attack pipeline. Track tier values are data-driven and **to verify vs the book** (spec §10).

**Reference:** spec §6 (Afflictions) + mockup `afflictions-tab.html`. Corruption track: 01–30 Tainted +0, 31–60 Soiled −10, 61–90 Debased −20, 91+ Profane −30. Insanity track: 01–09 Stable +0, 10–39 Unsettled +10, 40–59 Disturbed +0, 60–79 Unhinged −10, 80–99 Deranged −20, 100+ Terminally Insane −30. Next test at the next multiple of 10. Reuses `performTest` (Plan 3); embedded affliction arrays live at `system.afflictions.{mutations,malignancies,mentalDisorders}` (Plan 4).

---

## File Structure

```
scripts/helpers/affliction-data.mjs    NEW  pure corruptionTrack/insanityTrack/nextTestAt
test/affliction-data.test.mjs          NEW  Vitest
scripts/data/actor/base-actor-model.mjs MODIFY  corruption + insanity (moved here)
scripts/data/actor/acolyte-model.mjs   MODIFY  remove corruption + insanity (now on base)
scripts/rolls/roll-test.mjs            MODIFY  promptTest defaultModifier; rollAfflictionTest
scripts/sheets/actor-sheet.mjs         MODIFY  Afflictions context; rollAffliction/add/removeAffliction; aff-input wiring
templates/actor/actor-sheet.hbs        MODIFY  fill Afflictions tab
styles/better-dh2e.css                 MODIFY  afflictions styles
```

---

### Task 1: Track helpers (TDD)

**Files:**
- Create: `test/affliction-data.test.mjs`, `scripts/helpers/affliction-data.mjs`

- [ ] **Step 1: Write the failing test** `test/affliction-data.test.mjs`:

```javascript
// test/affliction-data.test.mjs
import { describe, it, expect } from "vitest";
import { corruptionTrack, insanityTrack, nextTestAt } from "../scripts/helpers/affliction-data.mjs";

describe("corruptionTrack", () => {
  it("maps value to tier + penalty", () => {
    expect(corruptionTrack(0)).toEqual({ tier: "Tainted", penalty: 0 });
    expect(corruptionTrack(30)).toEqual({ tier: "Tainted", penalty: 0 });
    expect(corruptionTrack(31)).toEqual({ tier: "Soiled", penalty: -10 });
    expect(corruptionTrack(61)).toEqual({ tier: "Debased", penalty: -20 });
    expect(corruptionTrack(91)).toEqual({ tier: "Profane", penalty: -30 });
  });
});

describe("insanityTrack", () => {
  it("maps value to tier + modifier", () => {
    expect(insanityTrack(5)).toEqual({ tier: "Stable", penalty: 0 });
    expect(insanityTrack(20)).toEqual({ tier: "Unsettled", penalty: 10 });
    expect(insanityTrack(50)).toEqual({ tier: "Disturbed", penalty: 0 });
    expect(insanityTrack(70)).toEqual({ tier: "Unhinged", penalty: -10 });
    expect(insanityTrack(90)).toEqual({ tier: "Deranged", penalty: -20 });
    expect(insanityTrack(100)).toEqual({ tier: "Terminally Insane", penalty: -30 });
  });
});

describe("nextTestAt", () => {
  it("is the next multiple of 10", () => {
    expect(nextTestAt(0)).toBe(10);
    expect(nextTestAt(12)).toBe(20);
    expect(nextTestAt(20)).toBe(30);
  });
});
```

- [ ] **Step 2: Run — verify FAIL.** `npx vitest run test/affliction-data.test.mjs` → FAIL.

- [ ] **Step 3: Implement** `scripts/helpers/affliction-data.mjs`:

```javascript
// scripts/helpers/affliction-data.mjs
// PURE — no Foundry imports. Track thresholds are data-driven; verify vs the book (spec §10).

/** Corruption track tier + test penalty. */
export function corruptionTrack(value) {
  if (value <= 30) return { tier: "Tainted", penalty: 0 };
  if (value <= 60) return { tier: "Soiled", penalty: -10 };
  if (value <= 90) return { tier: "Debased", penalty: -20 };
  return { tier: "Profane", penalty: -30 };
}

/** Insanity track tier + trauma-test modifier. */
export function insanityTrack(value) {
  if (value <= 9) return { tier: "Stable", penalty: 0 };
  if (value <= 39) return { tier: "Unsettled", penalty: 10 };
  if (value <= 59) return { tier: "Disturbed", penalty: 0 };
  if (value <= 79) return { tier: "Unhinged", penalty: -10 };
  if (value <= 99) return { tier: "Deranged", penalty: -20 };
  return { tier: "Terminally Insane", penalty: -30 };
}

/** The next multiple of 10 above the current value (when the next test triggers). */
export function nextTestAt(value) {
  return Math.floor(value / 10) * 10 + 10;
}
```

- [ ] **Step 4: Run — verify PASS.** `npx vitest run test/affliction-data.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add test/affliction-data.test.mjs scripts/helpers/affliction-data.mjs
git commit -m "feat: pure corruption/insanity track helpers with tests"
```

---

### Task 2: Move corruption + insanity to the base actor model

**Files:**
- Modify: `scripts/data/actor/base-actor-model.mjs`
- Modify: `scripts/data/actor/acolyte-model.mjs`

- [ ] **Step 1:** In `base-actor-model.mjs`, add `corruption` and `insanity` to the schema (alongside `notes`/`injuries`):

```javascript
      corruption: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      insanity: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
```

- [ ] **Step 2:** In `acolyte-model.mjs`, REMOVE its `corruption` and `insanity` fields (they are now on the base). Keep `bio` and `experience`. (If the file's `defineSchema` spreads `...super.defineSchema()` then adds bio/experience/corruption/insanity, just delete the corruption + insanity lines.)

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/data/actor/base-actor-model.mjs && node --check scripts/data/actor/acolyte-model.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/data/actor/base-actor-model.mjs scripts/data/actor/acolyte-model.mjs
git commit -m "feat: corruption + insanity on the base actor model (both actor types)"
```

---

### Task 3: Affliction test (reuse roll dialog)

**Files:**
- Modify: `scripts/rolls/roll-test.mjs`

- [ ] **Step 1: Give `promptTest` a default modifier.** In `promptTest`, change the signature and the modifier input. Change `async function promptTest({ title, characteristics = null }) {` to:
```javascript
async function promptTest({ title, characteristics = null, defaultModifier = "+0" }) {
```
and change the modifier input line from `value="+0"` to `value="${defaultModifier}"`:
```javascript
  const content = `${picker}<div class="form-group"><label>${game.i18n.localize("BDH.Roll.Modifier")}</label>
    <input type="text" name="modifier" value="${defaultModifier}" autofocus/></div>`;
```

- [ ] **Step 2: Append `rollAfflictionTest`** to the end of the file:
```javascript

/** Malignancy / Trauma test: a Willpower test with the track penalty pre-filled in the dialog. */
export async function rollAfflictionTest(actor, { label, penalty }) {
  const defaultModifier = `${penalty >= 0 ? "+" : ""}${penalty}`;
  const choice = await promptTest({ title: label, defaultModifier });
  if (!choice) return null;
  return performTest(actor, { label, base: actor.system.characteristics.willpower.total, modifier: choice.modifier });
}
```

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/rolls/roll-test.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/rolls/roll-test.mjs
git commit -m "feat: rollAfflictionTest (WP test w/ track penalty); promptTest default modifier"
```

---

### Task 4: Actor sheet — Afflictions context, actions, input wiring

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add imports** after the existing ones:
```javascript
import { corruptionTrack, insanityTrack, nextTestAt } from "../helpers/affliction-data.mjs";
import { rollAfflictionTest } from "../rolls/roll-test.mjs";
```
(Add `rollAfflictionTest` — it's a separate export from `roll-test.mjs`; you can put it on its own import line or merge into the existing `roll-test.mjs` import.)

- [ ] **Step 2: Add handlers** after the existing `#onRemoveInjury`:
```javascript
  /** Action: roll a Malignancy (corruption) or Trauma (insanity) test. */
  static async #onRollAffliction(event, target) {
    const type = target.dataset.type;
    const track = type === "malignancy"
      ? corruptionTrack(this.actor.system.corruption)
      : insanityTrack(this.actor.system.insanity);
    const label = type === "malignancy" ? "Malignancy Test" : "Trauma Test";
    await rollAfflictionTest(this.actor, { label: `${label} (${track.tier})`, penalty: track.penalty });
  }

  /** Action: add a blank {name, description} entry to an affliction array. */
  static async #onAddAffliction(event, target) {
    const arr = target.dataset.array;
    const list = foundry.utils.deepClone(this.actor.system.afflictions[arr]);
    list.push({ name: "", description: "" });
    await this.actor.update({ [`system.afflictions.${arr}`]: list });
  }

  /** Action: remove an affliction-array entry. */
  static async #onRemoveAffliction(event, target) {
    const arr = target.dataset.array;
    const list = foundry.utils.deepClone(this.actor.system.afflictions[arr]);
    list.splice(Number(target.dataset.index), 1);
    await this.actor.update({ [`system.afflictions.${arr}`]: list });
  }
```

- [ ] **Step 3: Register the actions** in `DEFAULT_OPTIONS.actions` (after the last existing entry — add a comma to it):
```javascript
      rollAffliction: DarkHeresyActorSheet.#onRollAffliction,
      addAffliction: DarkHeresyActorSheet.#onAddAffliction,
      removeAffliction: DarkHeresyActorSheet.#onRemoveAffliction
```

- [ ] **Step 4: Build the Afflictions context.** In `_prepareContext`, before `return context;`, add (reuse the `sys`/`items`/`firstLine` locals already defined):
```javascript
    const cor = corruptionTrack(sys.corruption);
    const ins = insanityTrack(sys.insanity);
    context.corruption = { value: sys.corruption, tier: cor.tier, penalty: cor.penalty, nextAt: nextTestAt(sys.corruption) };
    context.insanity = { value: sys.insanity, tier: ins.tier, penalty: ins.penalty, nextAt: nextTestAt(sys.insanity) };
    const mapNamed = (a) => a.map((e, i) => ({ index: i, name: e.name, description: e.description }));
    context.mutations = mapNamed(sys.afflictions.mutations);
    context.malignancies = mapNamed(sys.afflictions.malignancies);
    context.mentalDisorders = mapNamed(sys.afflictions.mentalDisorders);
    context.cybernetics = items.filter((i) => i.type === "cybernetic").map((c) => ({
      id: c.id, name: c.name, desc: firstLine(c.system.description), installed: c.system.installed
    }));
```

- [ ] **Step 5: Wire the affliction inputs** in `_onRender` (after the existing `.bdh-injury` loop):
```javascript
    for (const input of this.element.querySelectorAll(".bdh-aff-input")) {
      input.addEventListener("change", (event) => {
        const row = event.currentTarget.closest("[data-array]");
        const arr = row?.dataset.array;
        const idx = Number(row?.dataset.index);
        const field = event.currentTarget.dataset.field;
        const list = foundry.utils.deepClone(this.actor.system.afflictions[arr]);
        if (list[idx]) {
          list[idx][field] = event.currentTarget.value;
          this.actor.update({ [`system.afflictions.${arr}`]: list });
        }
      });
    }
```

- [ ] **Step 6: Syntax-check and run tests**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: Afflictions context (tracks, embedded lists, cybernetics) + actions + input wiring"
```

---

### Task 5: Template — Afflictions tab

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Replace the Afflictions placeholder.** Change:

```handlebars
  <section class="tab {{tabs.afflictions.cssClass}}" data-group="primary" data-tab="afflictions"><p class="placeholder">Afflictions — later plan.</p></section>
```
to:
```handlebars
  <section class="tab {{tabs.afflictions.cssClass}}" data-group="primary" data-tab="afflictions">
    <div class="bdh-tracks">
      <div class="bdh-track">
        <div class="bdh-track-head"><span>Corruption</span><input type="number" name="system.corruption" value="{{corruption.value}}" min="0"/></div>
        <div class="bdh-track-tier">{{corruption.tier}} · test {{#if corruption.penalty}}{{corruption.penalty}}{{else}}+0{{/if}} · next test at {{corruption.nextAt}}</div>
        <button type="button" class="bdh-atk" data-action="rollAffliction" data-type="malignancy">⚅ Malignancy Test</button>
      </div>
      <div class="bdh-track">
        <div class="bdh-track-head"><span>Insanity</span><input type="number" name="system.insanity" value="{{insanity.value}}" min="0"/></div>
        <div class="bdh-track-tier">{{insanity.tier}} · trauma {{#if insanity.penalty}}{{insanity.penalty}}{{else}}+0{{/if}} · next test at {{insanity.nextAt}}</div>
        <button type="button" class="bdh-atk" data-action="rollAffliction" data-type="trauma">⚅ Trauma Test</button>
      </div>
    </div>

    <div class="bdh-aff-grid">
      <div class="bdh-section">
        <div class="bdh-section-head">Mutations <button type="button" class="bdh-add" data-action="addAffliction" data-array="mutations">＋</button></div>
        {{#each mutations as |m|}}
          <div class="bdh-item-row" data-array="mutations" data-index="{{m.index}}">
            <input type="text" class="bdh-aff-input bdh-aff-name" data-field="name" value="{{m.name}}" placeholder="Name"/>
            <input type="text" class="bdh-aff-input" data-field="description" value="{{m.description}}" placeholder="Effect"/>
            <a class="bdh-del" data-action="removeAffliction" data-array="mutations" data-index="{{m.index}}" title="Remove">✖</a>
          </div>
        {{/each}}
        {{#unless mutations.length}}<div class="bdh-empty">None.</div>{{/unless}}
      </div>
      <div class="bdh-section">
        <div class="bdh-section-head">Malignancies <button type="button" class="bdh-add" data-action="addAffliction" data-array="malignancies">＋</button></div>
        {{#each malignancies as |m|}}
          <div class="bdh-item-row" data-array="malignancies" data-index="{{m.index}}">
            <input type="text" class="bdh-aff-input bdh-aff-name" data-field="name" value="{{m.name}}" placeholder="Name"/>
            <input type="text" class="bdh-aff-input" data-field="description" value="{{m.description}}" placeholder="Effect"/>
            <a class="bdh-del" data-action="removeAffliction" data-array="malignancies" data-index="{{m.index}}" title="Remove">✖</a>
          </div>
        {{/each}}
        {{#unless malignancies.length}}<div class="bdh-empty">None.</div>{{/unless}}
      </div>
      <div class="bdh-section">
        <div class="bdh-section-head">Mental Disorders <button type="button" class="bdh-add" data-action="addAffliction" data-array="mentalDisorders">＋</button></div>
        {{#each mentalDisorders as |m|}}
          <div class="bdh-item-row" data-array="mentalDisorders" data-index="{{m.index}}">
            <input type="text" class="bdh-aff-input bdh-aff-name" data-field="name" value="{{m.name}}" placeholder="Name"/>
            <input type="text" class="bdh-aff-input" data-field="description" value="{{m.description}}" placeholder="Effect"/>
            <a class="bdh-del" data-action="removeAffliction" data-array="mentalDisorders" data-index="{{m.index}}" title="Remove">✖</a>
          </div>
        {{/each}}
        {{#unless mentalDisorders.length}}<div class="bdh-empty">None.</div>{{/unless}}
      </div>
      <div class="bdh-section">
        <div class="bdh-section-head">Cybernetics <button type="button" class="bdh-add" data-action="createItem" data-type="cybernetic">＋</button></div>
        {{#each cybernetics as |c|}}
          <div class="bdh-item-row" data-item-id="{{c.id}}">
            <span class="bdh-name" data-action="editItem">{{c.name}}</span>
            <span class="bdh-desc-line">{{c.desc}}</span>
            {{#if c.installed}}<span class="bdh-tag">installed</span>{{/if}}
            <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
          </div>
        {{/each}}
        {{#unless cybernetics.length}}<div class="bdh-empty">None.</div>{{/unless}}
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Afflictions tab (corruption/insanity tracks, mutations/malignancies/disorders, cybernetics)"
```

---

### Task 6: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append:**

```css

/* Afflictions tab */
.better-dh2e .bdh-tracks { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:8px 14px; }
.better-dh2e .bdh-track { background:var(--bdh-panel); border:1px solid var(--bdh-brown); border-radius:5px; padding:6px 10px; }
.better-dh2e .bdh-track-head { display:flex; align-items:center; justify-content:space-between; font-variant:small-caps; letter-spacing:1px; font-weight:bold; color:var(--bdh-maroon); }
.better-dh2e .bdh-track-head input { width:64px; font-size:16px; font-weight:bold; }
.better-dh2e .bdh-track-tier { font-size:11px; color:var(--bdh-muted); margin:3px 0 6px; }
.better-dh2e .bdh-aff-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; padding:0 14px 12px; }
.better-dh2e .bdh-aff-grid .bdh-section { margin:0; }
.better-dh2e .bdh-aff-input { min-width:0; }
.better-dh2e .bdh-aff-name { flex:0 0 32%; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: Afflictions tab styles"
```

---

### Task 7: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)" → **Afflictions** tab):
- [ ] **Corruption** track: set value to 45 → tier shows **Soiled · test −10 · next test at 50**; press **⚅ Malignancy Test** → the roll dialog opens with **−10 pre-filled**; rolling posts a WP test card.
- [ ] **Insanity** track: set to 70 → **Unhinged · trauma −10 · next test at 80**; **⚅ Trauma Test** opens the dialog pre-filled.
- [ ] **Mutations / Malignancies / Mental Disorders**: press ＋ → a blank name+effect row; type into each, switch tabs and back → they persist; ✖ removes.
- [ ] **Cybernetics**: ＋ creates a cybernetic item (opens its sheet); shows here with an "installed" tag if its Installed box is checked; ✖ deletes.
- [ ] Corruption/Insanity values **persist** on reopen.
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§6 Afflictions):**
- Corruption + Insanity tracks (tier, penalty, next-at) + test buttons → Tasks 1/3/4/5. ✓
- Mutations / Malignancies / Mental Disorders embedded lists → Tasks 4/5. ✓
- Cybernetics (items) → Tasks 4/5 (reused item actions). ✓

**Deferred (declared):** auto-prompt on threshold crossing; applying results; Psychic/Advancement; attack pipeline. Track values to verify vs book (§10).

**Placeholder scan:** complete; checklist uses concrete values (45→Soiled −10; 70→Unhinged −10).

**Type/name consistency:** `corruptionTrack`/`insanityTrack`/`nextTestAt` signatures match helper/test/sheet. `rollAfflictionTest` exported and imported. Action names `rollAffliction`/`addAffliction`/`removeAffliction` match `DEFAULT_OPTIONS.actions`, handlers, and template `data-action`; cybernetics reuse `createItem`/`editItem`/`deleteItem`. `system.corruption`/`insanity` now on base (Task 2) → named inputs save via the `<div>`-rooted form. `system.afflictions.{mutations,malignancies,mentalDisorders}` (Plan 4) updated whole-array via nested SchemaField path. `.bdh-aff-input` wired in `_onRender` (which awaits super). `sys`/`items`/`firstLine`/`BDH` in scope.
