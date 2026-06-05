# Better DH2e — Plan 2: Sheet Framework & Stats Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the bare ApplicationV2 shell into a themed, tabbed character sheet whose **Stats tab** renders the characteristic row (squares + bonus boxes, Influence offset, FFG short names), a Fatigue bar, and a working **Investigation** sub-tab (skill list + "hide untrained" toggle).

**Architecture:** View-model construction (turning `actor.system` into render-ready arrays) lives in **pure, Foundry-free functions** in `scripts/helpers/sheet-data.mjs`, unit-tested with Vitest. The ApplicationV2 sheet uses the verified v13 tab system (`static TABS` for a `primary` group and a `secondary` Investigation/Combat group; `_prepareTabs` for each since there is >1 group) and one Handlebars template. Tab switching and `.active` toggling are handled by Foundry's `_onClickTab`/`changeTab`; our CSS hides inactive `.tab` sections.

**Tech Stack:** Foundry VTT v13 (ApplicationV2 `HandlebarsApplicationMixin` + `ActorSheetV2`, `static TABS`/`_prepareTabs`/`changeTab`, `actions`), native ES modules, Vitest, Handlebars, CSS.

**Scope of THIS plan:** view-model helpers; parchment theme CSS incl. tab visibility; the sheet template (header, primary nav, Stats section with char row + Fatigue bar + secondary nav + Investigation skills + Combat placeholder, and placeholder sections for the other six primary tabs); the sheet class (TABS, context, `toggleUntrained` action); deploy + browser verification using the existing `bdh-test` world.

**Out of scope (later plans):** click-to-roll dialogs (rolls plan); the Combat sub-tab content (needs armour/force-field item types — a later plan); Abilities/Gear/Notes/Afflictions/Psychic/Advancement tab content; the remaining item types; item edit sheets. Characteristic squares and skill rows render display-only (no roll wiring yet).

**Reference:** spec `docs/superpowers/specs/2026-06-05-better-dh2e-character-sheet-design.md` (§6 sheet, §11 rolls deferred); mockups `docs/superpowers/specs/mockups/stats-investigation.html`. Verified v13 tab API: `static TABS = { group: { initial, tabs:[{id,label}] } }`; `_prepareTabs(group)` → record keyed by id with `{group,id,active,cssClass,label}`; nav `<nav class="tabs" data-group=G><a class="item {{cssClass}}" data-group=G data-tab=ID>`; sections `<section class="tab {{cssClass}}" data-group=G data-tab=ID>`.

---

## File Structure

```
scripts/helpers/sheet-data.mjs    NEW  pure view-model builders (chars, skills, fatigue %)
test/sheet-data.test.mjs          NEW  Vitest unit tests for the builders
scripts/sheets/actor-sheet.mjs    MODIFY  add TABS, _prepareContext view-models, toggleUntrained action
templates/actor/actor-sheet.hbs   NEW  the real sheet template (header + tabs + Stats)
templates/actor/actor-shell.hbs   DELETE  replaced by actor-sheet.hbs
styles/better-dh2e.css            MODIFY  parchment theme: tabs, char row, fatigue bar, skills
lang/en.json                      MODIFY  add Investigation/Combat sub-tab labels
```

---

### Task 1: View-model builders (TDD)

`sheet-data.mjs` imports only `../config.mjs` (no Foundry), so it is unit-testable. It reads the already-derived `.total`/`.bonus`/`.rank` values off `actor.system` (computed by Plan 1's DataModel) and shapes them for rendering.

**Files:**
- Create: `test/sheet-data.test.mjs`
- Create: `scripts/helpers/sheet-data.mjs`

- [ ] **Step 1: Write the failing tests**

```javascript
// test/sheet-data.test.mjs
import { describe, it, expect } from "vitest";
import { buildCharacteristics, buildSkills, fatiguePercent } from "../scripts/helpers/sheet-data.mjs";
import { BDH } from "../scripts/config.mjs";

function charStub() {
  const o = {};
  for (const k of Object.keys(BDH.characteristics)) o[k] = { total: 25, bonus: 2 };
  o.toughness = { total: 42, bonus: 4 };
  o.influence = { total: 37, bonus: 3 };
  return o;
}

function skillStub() {
  const o = {};
  for (const k of Object.keys(BDH.skills)) o[k] = { rank: "untrained", total: 5 };
  o.dodge = { rank: "trained", total: 45 };
  o.awareness = { rank: "known", total: 28 };
  return o;
}

describe("buildCharacteristics", () => {
  it("returns all ten in config order with short names", () => {
    const rows = buildCharacteristics(charStub());
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({ key: "weaponSkill", short: "WS" });
    expect(rows[9].key).toBe("influence");
  });
  it("carries total as value and bonus, and flags influence", () => {
    const rows = buildCharacteristics(charStub());
    const t = rows.find((r) => r.key === "toughness");
    expect(t.value).toBe(42);
    expect(t.bonus).toBe(4);
    expect(t.isInfluence).toBe(false);
    expect(rows.find((r) => r.key === "influence").isInfluence).toBe(true);
  });
});

describe("buildSkills", () => {
  it("maps rank to tier, dots and trained flag", () => {
    const list = buildSkills(skillStub());
    const dodge = list.find((s) => s.key === "dodge");
    expect(dodge.tier).toBe(2);
    expect(dodge.trained).toBe(true);
    expect(dodge.dots).toEqual([true, true, false, false]);
    const acro = list.find((s) => s.key === "acrobatics");
    expect(acro.tier).toBe(0);
    expect(acro.trained).toBe(false);
    expect(acro.dots).toEqual([false, false, false, false]);
  });
  it("sorts entries by label", () => {
    const labels = buildSkills(skillStub()).map((s) => s.label);
    expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)));
  });
});

describe("fatiguePercent", () => {
  it("computes a clamped, rounded percentage", () => {
    expect(fatiguePercent(1, 8)).toBe(13);
    expect(fatiguePercent(0, 8)).toBe(0);
    expect(fatiguePercent(10, 8)).toBe(100);
  });
  it("returns 0 when max is 0 or missing", () => {
    expect(fatiguePercent(3, 0)).toBe(0);
    expect(fatiguePercent(3, undefined)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they FAIL**

Run: `npx vitest run test/sheet-data.test.mjs`
Expected: FAIL — cannot import from `sheet-data.mjs`.

- [ ] **Step 3: Write the implementation**

```javascript
// scripts/helpers/sheet-data.mjs
// PURE view-model builders — import only ../config.mjs, nothing from Foundry.
import { BDH } from "../config.mjs";

const TIER_BY_RANK = { untrained: 0, known: 1, trained: 2, experienced: 3, veteran: 4 };

/** Ordered characteristic view-models for the Stats row. */
export function buildCharacteristics(characteristics) {
  return Object.keys(BDH.characteristics).map((key) => {
    const c = characteristics[key] ?? {};
    return {
      key,
      short: BDH.characteristics[key].short,
      label: BDH.characteristics[key].label,
      value: c.total ?? 0,
      bonus: c.bonus ?? 0,
      isInfluence: key === "influence"
    };
  });
}

/** Skill view-models, sorted by label, with a 0..4 tier, a 4-dot array, and a trained flag. */
export function buildSkills(skills) {
  return Object.keys(BDH.skills)
    .map((key) => {
      const s = skills[key] ?? {};
      const rank = s.rank ?? "untrained";
      const tier = TIER_BY_RANK[rank] ?? 0;
      return {
        key,
        label: BDH.skills[key].label,
        rank,
        tier,
        dots: [0, 1, 2, 3].map((i) => i < tier),
        trained: rank !== "untrained",
        total: s.total ?? 0
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Fatigue fill percentage (0..100). */
export function fatiguePercent(value, max) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}
```

- [ ] **Step 4: Run the tests to verify they PASS**

Run: `npx vitest run test/sheet-data.test.mjs`
Expected: PASS (all assertions).

- [ ] **Step 5: Commit**

```bash
git add test/sheet-data.test.mjs scripts/helpers/sheet-data.mjs
git commit -m "feat: add sheet view-model builders with unit tests"
```

---

### Task 2: Language labels for sub-tabs

**Files:**
- Modify: `lang/en.json`

- [ ] **Step 1: Add the two sub-tab labels.** Insert these lines after `"BDH.Sheet.Advancement": "Advancement"` (add a comma to that line first):

Change:
```json
  "BDH.Sheet.Advancement": "Advancement"
}
```
to:
```json
  "BDH.Sheet.Advancement": "Advancement",
  "BDH.Sheet.Investigation": "Investigation",
  "BDH.Sheet.Combat": "Combat"
}
```

- [ ] **Step 2: Validate JSON and commit**

Run: `node -e "JSON.parse(require('fs').readFileSync('lang/en.json','utf8')); console.log('ok')"`
Expected: `ok`

```bash
git add lang/en.json
git commit -m "feat: add Investigation/Combat sub-tab labels"
```

---

### Task 3: Parchment theme stylesheet

**Files:**
- Modify: `styles/better-dh2e.css` (replace the whole file)

- [ ] **Step 1: Replace `styles/better-dh2e.css` with:**

```css
/* Better DH2e — parchment theme (Plan 2: chrome, tabs, Stats tab). */
.better-dh2e { --bdh-parch:#e7d8b8; --bdh-panel:#efe6cd; --bdh-ink:#2b2017;
  --bdh-maroon:#5a2a2a; --bdh-brown:#6b4a2b; --bdh-gold:#b8902f; --bdh-muted:#7a5c30;
  color:var(--bdh-ink); font-family:Georgia, serif; }
.better-dh2e .window-content, .better-dh2e form { background:var(--bdh-parch); }

/* Header */
.better-dh2e .bdh-header { display:flex; align-items:center; gap:12px; padding:8px 10px; }
.better-dh2e .bdh-header img { width:48px; height:48px; border:2px solid var(--bdh-gold); border-radius:6px; flex:0 0 auto; object-fit:cover; }
.better-dh2e .bdh-header .name { flex:0 0 200px; }
.better-dh2e .bdh-header .name input { font-size:18px; font-weight:bold; width:100%; background:transparent; border:none; border-bottom:1px solid var(--bdh-brown); }
.better-dh2e .bdh-header .meta { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:2px 12px; font-size:11px; }
.better-dh2e .bdh-header .meta label { color:var(--bdh-muted); text-transform:uppercase; font-size:9px; margin-right:4px; }
.better-dh2e .bdh-header .fate { text-align:center; background:var(--bdh-panel); border:2px solid var(--bdh-gold); border-radius:6px; padding:3px 9px; }
.better-dh2e .bdh-header .fate .lbl { font-size:9px; text-transform:uppercase; color:var(--bdh-muted); }
.better-dh2e .bdh-header .fate .v { font-size:15px; font-weight:bold; color:var(--bdh-gold); }

/* Tabs */
.better-dh2e nav.tabs { display:flex; background:var(--bdh-maroon); border-radius:4px; overflow:hidden; }
.better-dh2e nav.tabs .item { flex:1; text-align:center; padding:7px 4px; color:var(--bdh-parch);
  font-variant:small-caps; letter-spacing:1px; font-size:13px; cursor:pointer; border-right:1px solid #3d1c1c; }
.better-dh2e nav.tabs .item.active { background:var(--bdh-parch); color:var(--bdh-maroon); font-weight:bold; }
.better-dh2e nav.tabs.secondary { background:transparent; border-bottom:2px solid var(--bdh-brown); border-radius:0; margin-top:8px; }
.better-dh2e nav.tabs.secondary .item { flex:0 0 auto; color:var(--bdh-muted); border:none; }
.better-dh2e nav.tabs.secondary .item.active { background:var(--bdh-brown); color:var(--bdh-parch); border-radius:5px 5px 0 0; }

/* Tab section visibility (Foundry toggles .active) */
.better-dh2e .tab { display:none; padding:8px 4px; }
.better-dh2e .tab.active { display:block; }

/* Characteristic row */
.better-dh2e .char-row { display:flex; gap:5px; align-items:flex-end; padding:6px 6px 10px; }
.better-dh2e .char { flex:1; }
.better-dh2e .char .bonus { width:60%; margin:0 auto; background:var(--bdh-maroon); color:var(--bdh-parch);
  text-align:center; font-size:11px; border-radius:3px 3px 0 0; }
.better-dh2e .char .box { background:var(--bdh-panel); border:2px solid var(--bdh-brown); border-radius:0 0 4px 4px; text-align:center; padding:5px 0 3px; }
.better-dh2e .char .box .val { font-size:20px; font-weight:bold; }
.better-dh2e .char .box .nm { font-size:9px; color:var(--bdh-muted); text-transform:uppercase; letter-spacing:1px; }
.better-dh2e .char.inf { margin-left:16px; border-left:2px dashed var(--bdh-gold); padding-left:8px; }
.better-dh2e .char.inf .box { border-color:var(--bdh-gold); }

/* Fatigue bar */
.better-dh2e .fatigue { display:flex; align-items:center; gap:8px; margin:0 6px 4px; background:var(--bdh-panel);
  border:1px solid var(--bdh-brown); border-radius:4px; padding:3px 8px; }
.better-dh2e .fatigue .lbl { font-size:9px; text-transform:uppercase; color:var(--bdh-muted); letter-spacing:1px; flex:0 0 60px; }
.better-dh2e .fatigue .bar { flex:1; height:8px; background:#d6c39a; border-radius:4px; overflow:hidden; }
.better-dh2e .fatigue .bar i { display:block; height:100%; background:#7a6a2a; }
.better-dh2e .fatigue .v { font-size:11px; font-weight:bold; }

/* Investigation skills */
.better-dh2e .inv-toolbar { display:flex; justify-content:flex-end; padding:6px 6px 2px; }
.better-dh2e .inv-toolbar button { font-size:10px; background:var(--bdh-panel); border:1px solid var(--bdh-brown);
  border-radius:4px; padding:3px 10px; cursor:pointer; color:var(--bdh-maroon); }
.better-dh2e .skills { columns:2; gap:24px; padding:2px 6px 12px; }
.better-dh2e .skill { display:flex; align-items:center; gap:8px; padding:2px 0; break-inside:avoid; font-size:12px; }
.better-dh2e .skill .tier { display:flex; gap:2px; margin-left:auto; }
.better-dh2e .skill .tier i { width:9px; height:9px; border:1px solid var(--bdh-brown); border-radius:2px; display:inline-block; }
.better-dh2e .skill .tier i.on { background:var(--bdh-maroon); }
.better-dh2e .skill .sval { font-weight:bold; min-width:24px; text-align:right; }
.better-dh2e .skill.untrained { opacity:.45; }
.better-dh2e form.hide-untrained .skill.untrained { display:none; }

/* Placeholders for not-yet-built tabs */
.better-dh2e .placeholder { color:var(--bdh-muted); font-style:italic; padding:12px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: parchment theme for sheet chrome, tabs, and Stats tab"
```

---

### Task 4: Sheet template

**Files:**
- Create: `templates/actor/actor-sheet.hbs`
- Delete: `templates/actor/actor-shell.hbs`

- [ ] **Step 1: Create `templates/actor/actor-sheet.hbs`:**

```handlebars
{{!-- templates/actor/actor-sheet.hbs --}}
<form class="better-dh2e {{#if hideUntrained}}hide-untrained{{/if}}">

  <header class="bdh-header">
    <img src="{{document.img}}" data-edit="img" alt="portrait"/>
    <div class="name"><input type="text" name="name" value="{{document.name}}" placeholder="Name"/></div>
    <div class="meta">
      {{#if system.bio}}
        <div><label>Home World</label><input type="text" name="system.bio.homeWorld" value="{{system.bio.homeWorld}}"/></div>
        <div><label>Background</label><input type="text" name="system.bio.background" value="{{system.bio.background}}"/></div>
        <div><label>Role</label><input type="text" name="system.bio.role" value="{{system.bio.role}}"/></div>
        <div><label>Elite</label><input type="text" name="system.bio.elite" value="{{system.bio.elite}}"/></div>
      {{/if}}
      {{#if system.faction}}
        <div><label>Faction</label><input type="text" name="system.faction" value="{{system.faction}}"/></div>
        <div><label>Threat</label><input type="number" name="system.threatLevel" value="{{system.threatLevel}}"/></div>
      {{/if}}
    </div>
    <div class="fate">
      <div class="lbl">Fate</div>
      <div class="v">{{system.fate.value}} / {{system.fate.max}}</div>
    </div>
  </header>

  <nav class="tabs primary" data-group="primary">
    {{#each tabs as |t|}}
      <a class="item {{t.cssClass}}" data-group="primary" data-tab="{{t.id}}">{{localize t.label}}</a>
    {{/each}}
  </nav>

  {{!-- STATS --}}
  <section class="tab {{tabs.stats.cssClass}}" data-group="primary" data-tab="stats">
    <div class="char-row">
      {{#each characteristics as |c|}}
        <div class="char {{#if c.isInfluence}}inf{{/if}}" data-characteristic="{{c.key}}">
          <div class="bonus">{{c.bonus}}</div>
          <div class="box"><div class="val">{{c.value}}</div><div class="nm">{{c.short}}</div></div>
        </div>
      {{/each}}
    </div>

    <div class="fatigue">
      <span class="lbl">Fatigue</span>
      <span class="bar"><i style="width:{{fatiguePct}}%"></i></span>
      <span class="v">{{system.fatigue.value}} / {{system.fatigue.max}}</span>
    </div>

    <nav class="tabs secondary" data-group="secondary">
      {{#each subtabs as |s|}}
        <a class="item {{s.cssClass}}" data-group="secondary" data-tab="{{s.id}}">{{localize s.label}}</a>
      {{/each}}
    </nav>

    <section class="tab {{subtabs.investigation.cssClass}}" data-group="secondary" data-tab="investigation">
      <div class="inv-toolbar">
        <button type="button" data-action="toggleUntrained">{{#if hideUntrained}}Show all{{else}}Hide untrained{{/if}}</button>
      </div>
      <div class="skills">
        {{#each skills as |s|}}
          <div class="skill {{#unless s.trained}}untrained{{/unless}}" data-skill="{{s.key}}">
            <span class="snm">{{localize s.label}}</span>
            <span class="tier">{{#each s.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
            <span class="sval">{{s.total}}</span>
          </div>
        {{/each}}
      </div>
    </section>

    <section class="tab {{subtabs.combat.cssClass}}" data-group="secondary" data-tab="combat">
      <p class="placeholder">Combat view — armour, weapons, wounds — arrives in a later plan.</p>
    </section>
  </section>

  {{!-- Other primary tabs: placeholders for later plans --}}
  <section class="tab {{tabs.abilities.cssClass}}" data-group="primary" data-tab="abilities"><p class="placeholder">Abilities — later plan.</p></section>
  <section class="tab {{tabs.gear.cssClass}}" data-group="primary" data-tab="gear"><p class="placeholder">Gear — later plan.</p></section>
  <section class="tab {{tabs.notes.cssClass}}" data-group="primary" data-tab="notes"><p class="placeholder">Notes — later plan.</p></section>
  <section class="tab {{tabs.afflictions.cssClass}}" data-group="primary" data-tab="afflictions"><p class="placeholder">Afflictions — later plan.</p></section>
  <section class="tab {{tabs.psychic.cssClass}}" data-group="primary" data-tab="psychic"><p class="placeholder">Psychic — later plan.</p></section>
  <section class="tab {{tabs.advancement.cssClass}}" data-group="primary" data-tab="advancement"><p class="placeholder">Advancement — later plan.</p></section>

</form>
```

- [ ] **Step 2: Delete the old shell template**

Run: `git rm templates/actor/actor-shell.hbs`
Expected: file removed (the sheet class will be repointed in Task 5).

- [ ] **Step 3: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: real actor sheet template (header, tabs, Stats/Investigation)"
```

---

### Task 5: Sheet class — TABS, context, action

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs` (replace the whole file)

- [ ] **Step 1: Replace `scripts/sheets/actor-sheet.mjs` with:**

```javascript
// scripts/sheets/actor-sheet.mjs
import { buildCharacteristics, buildSkills, fatiguePercent } from "../helpers/sheet-data.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class DarkHeresyActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  /** Investigation "hide untrained" filter state (per open sheet). */
  _hideUntrained = false;

  /** Action handler: toggle the hide-untrained filter and re-render. */
  static #onToggleUntrained(event, target) {
    this._hideUntrained = !this._hideUntrained;
    this.render();
  }

  static DEFAULT_OPTIONS = {
    classes: ["better-dh2e", "sheet", "actor"],
    position: { width: 800, height: 720 },
    window: { resizable: true },
    form: { submitOnChange: true },
    actions: {
      toggleUntrained: DarkHeresyActorSheet.#onToggleUntrained
    }
  };

  static PARTS = {
    sheet: { template: "systems/better-dh2e/templates/actor/actor-sheet.hbs" }
  };

  static TABS = {
    primary: {
      initial: "stats",
      tabs: [
        { id: "stats", label: "BDH.Sheet.Stats" },
        { id: "abilities", label: "BDH.Sheet.Abilities" },
        { id: "gear", label: "BDH.Sheet.Gear" },
        { id: "notes", label: "BDH.Sheet.Notes" },
        { id: "afflictions", label: "BDH.Sheet.Afflictions" },
        { id: "psychic", label: "BDH.Sheet.Psychic" },
        { id: "advancement", label: "BDH.Sheet.Advancement" }
      ]
    },
    secondary: {
      initial: "investigation",
      tabs: [
        { id: "investigation", label: "BDH.Sheet.Investigation" },
        { id: "combat", label: "BDH.Sheet.Combat" }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.document.system;
    context.document = this.document;
    context.system = system;
    context.characteristics = buildCharacteristics(system.characteristics);
    context.skills = buildSkills(system.skills);
    context.fatiguePct = fatiguePercent(system.fatigue?.value ?? 0, system.fatigue?.max ?? 0);
    context.hideUntrained = this._hideUntrained;
    // >1 tab group => context.tabs is not auto-injected; prepare both groups explicitly.
    context.tabs = this._prepareTabs("primary");
    context.subtabs = this._prepareTabs("secondary");
    return context;
  }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check scripts/sheets/actor-sheet.mjs`
Expected: no output (valid).

- [ ] **Step 3: Run the full unit suite (nothing should have broken)**

Run: `npm test`
Expected: PASS (Plan 1 derived tests + Task 1 sheet-data tests).

- [ ] **Step 4: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: sheet TABS, view-model context, and hide-untrained action"
```

---

### Task 6: Deploy & browser verification

**Files:** none (operational).

- [ ] **Step 1: Deploy**

Run: `npm run deploy`
Expected: "Deployed to …/systems/better-dh2e".

- [ ] **Step 2: Restart Foundry so client assets refresh**

Run: `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`
Expected: restarted; still listening on :30000.

- [ ] **Step 3: Manual browser checklist** (open the existing **BDH Test World**, the `bdh-test` world already seeded with actors):
- [ ] Open **"Daren Vholk (Test Acolyte)"** — the sheet is themed (parchment), header shows the name + Home World/Background/Role + Fate "3 / 4".
- [ ] The **characteristic row** shows ten squares with FFG short names; **Toughness box reads 42 with a 4 in the bonus tab**; Agility 30 / bonus 3; **Influence (Inf) is offset** with a divider.
- [ ] A **Fatigue bar** appears under the row (value 1 / max 7).
- [ ] Clicking the **primary tabs** (Abilities, Gear, …) switches to placeholder panels; clicking **Stats** returns.
- [ ] Within Stats, the **Investigation / Combat** sub-tabs toggle; Investigation shows the skill list (Awareness/Dodge non-greyed; the rest greyed).
- [ ] The **"Hide untrained"** button hides the greyed skills and flips to "Show all"; clicking again restores them.
- [ ] **F12 console**: no errors.
- [ ] Open the **NPC** actor — sheet renders with its characteristics; header shows Faction/Threat instead of bio.

- [ ] **Step 4: Commit a note if any fixes were needed** (only if Steps 1-3 surfaced changes; otherwise nothing to commit here).

---

## Self-Review

**Spec coverage (Plan 2 slice):**
- Themed, tabbed sheet (spec §6) → Tasks 3-5; parchment theme, working primary + secondary tabs. ✓
- Characteristic row: squares, bonus boxes, FFG short names, Influence offset → Task 4 template + Task 3 builder + Task 3 CSS. ✓
- Fatigue bar on Stats → Tasks 1/3/4 (`fatiguePercent`). ✓
- Investigation sub-tab: skills with tiers + "hide untrained" → Tasks 1/4/5 (`buildSkills`, `toggleUntrained` action). ✓
- Tab structure Stats·Abilities·Gear·Notes·Afflictions·Psychic·Advancement → Task 5 TABS. ✓

**Deferred (declared, not gaps):** click-to-roll (rolls plan), Combat sub-tab content + item lists (needs armour/force-field item types, later plan), the other six tabs' content, item edit sheets. The characteristic squares/skill rows carry `data-characteristic`/`data-skill` for later roll wiring but are display-only now.

**Placeholder scan:** every code step is complete; the manual checklist uses concrete expected values (T42→bonus 4, Fate 3/4, Fatigue 1/7). ✓

**Type/name consistency:** `buildCharacteristics`/`buildSkills`/`fatiguePercent` signatures match across `sheet-data.mjs`, the tests, and `actor-sheet.mjs`. Template variables (`tabs`, `subtabs`, `characteristics`, `skills`, `fatiguePct`, `hideUntrained`) all set in `_prepareContext`. Tab/section `data-group`/`data-tab` attributes match the verified v13 `changeTab` selectors (`.tabs [data-group][data-tab]`, `.tab[data-group]`). The `toggleUntrained` action name matches the template `data-action`. ✓
```
