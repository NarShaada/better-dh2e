# Better DH2e — Plan 12: Advancement Control Center + Custom Mode + Fatigue Wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Advancement tab's **control center** (Aptitudes picker, Total/Spent/Free XP ledger, Simple/Custom toggles) and a working **Custom mode** that overlays free-edit affordances across the sheet (read-only in play mode, editable only in Custom). Plus **fatigue wiring**: +/- buttons on the bar (play mode) and an editable fatigue **max override** (Custom).

**Architecture:** A transient sheet mode (`_advancementMode`: none/custom/simple) like `hideUntrained`; toggling re-renders, so every tab's affordances reflect the mode. The Custom editables are **named form inputs** (`system.*`) rendered only when Custom is on — they save via the existing `submitOnChange`, no new handlers. New actions: `setMode`, `adjustFatigue`. Data-model additions support the new editables.

**Tech Stack:** Foundry v13 (ApplicationV2 `actions`, named form inputs, `foundry.data.fields`), Vitest, Handlebars.

**Scope of THIS plan:** control center; Custom-mode editables (characteristic value=`base` + bonus=`unnatural`, skill rank, Spent, max wounds, fatigue max override, fate max, initiative characteristic); fatigue +/- buttons. The **Simple** toggle is present but shows a "next plan" notice.

**Out of scope (later):** Simple mode + cost tables + aptitude→cost maps (Plan 13); the fatigue characteristic-halving (its own pass); initiative → combat-tracker wiring (spec §13).

**Reference:** spec §6 (Advancement; Custom editables list) + §13 (fatigue: default max TB+WB, overridable in Custom; +/- in play). Mode is a transient UI toggle (resets on reopen). Aptitudes reuse `CONFIG.BDH.aptitudes`. Custom inputs bind: value→`base`, bonus→`unnatural`, skill→`skills.<k>.rank`, plus `experience.spent`, `wounds.max`, `fatigue.maxOverride`, `fate.max`, `initiative.characteristic`. The actor form root is a `<div>` so named inputs save.

---

## File Structure

```
scripts/data/actor/base-actor-model.mjs  MODIFY  experience{total,spent}; aptitudes; fatigue.maxOverride+derived; initiative.characteristic
scripts/data/actor/acolyte-model.mjs     MODIFY  remove its own experience (now on base)
scripts/data/actor/npc-model.mjs         MODIFY  remove its own experience if present
scripts/helpers/sheet-data.mjs           MODIFY  buildCharacteristics adds base + unnatural
test/sheet-data.test.mjs                 MODIFY  assert base/unnatural
scripts/sheets/actor-sheet.mjs           MODIFY  mode state; setMode/adjustFatigue; advancement/mode context
templates/actor/actor-sheet.hbs          MODIFY  Advancement tab; Custom affordances (char row, skills, fatigue bar, wounds, initiative, fate)
styles/better-dh2e.css                   MODIFY  control center + custom-input + fatigue-button styles
```

---

### Task 1: Data model additions

**Files:**
- Modify: `scripts/data/actor/base-actor-model.mjs`
- Modify: `scripts/data/actor/acolyte-model.mjs`, `scripts/data/actor/npc-model.mjs`

- [ ] **Step 1:** In `base-actor-model.mjs`, add these to `defineSchema()` (alongside `fate`/`fatigue`/etc.):

```javascript
      experience: new fields.SchemaField({
        total: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        spent: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
      }),
      aptitudes: new fields.ArrayField(new fields.StringField({ choices: BDH.aptitudes })),
      initiative: new fields.SchemaField({
        characteristic: new fields.StringField({ required: true, choices: Object.keys(BDH.characteristics), initial: "agility" })
      }),
```

- [ ] **Step 2:** In `base-actor-model.mjs`, change the `fatigue` field to add a nullable override:

```javascript
      fatigue: new fields.SchemaField({
        value: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
        maxOverride: new fields.NumberField({ required: false, integer: true, nullable: true, initial: null, min: 0 })
      }),
```

- [ ] **Step 3:** In `base-actor-model.mjs` `prepareDerivedData`, change the fatigue.max line to respect the override. Replace:
```javascript
    this.fatigue.max = fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
```
with:
```javascript
    this.fatigue.max = this.fatigue.maxOverride ?? fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
```

- [ ] **Step 4:** In `acolyte-model.mjs`, REMOVE its own `experience` field (now on base; the acolyte's `experience: SchemaField({ total })` is superseded — delete that line). Keep `bio`. In `npc-model.mjs`, if it defines an `experience` field, remove it too (keep faction/threatLevel).

- [ ] **Step 5:** Verify and commit. Run: `node --check scripts/data/actor/base-actor-model.mjs && node --check scripts/data/actor/acolyte-model.mjs && node --check scripts/data/actor/npc-model.mjs && npm test` — Expected: no output; tests PASS.

```bash
git add scripts/data/actor/base-actor-model.mjs scripts/data/actor/acolyte-model.mjs scripts/data/actor/npc-model.mjs
git commit -m "feat: advancement data fields (experience total/spent, aptitudes, fatigue override, initiative characteristic)"
```

---

### Task 2: buildCharacteristics carries base + unnatural (TDD)

**Files:**
- Modify: `test/sheet-data.test.mjs`, `scripts/helpers/sheet-data.mjs`

- [ ] **Step 1: Update the test.** In `test/sheet-data.test.mjs`, the `charStub()` builds characteristics with `{ total, bonus }`. Update it so each entry also has `base`/`unnatural` (e.g. set the default to `{ base: 25, advance: 0, unnatural: 0, total: 25, bonus: 2 }`, and `o.toughness = { base: 42, advance: 0, unnatural: 0, total: 42, bonus: 4 }`). Add a test inside `describe("buildCharacteristics", ...)`:

```javascript
  it("carries base and unnatural for Custom editing", () => {
    const rows = buildCharacteristics(charStub());
    const t = rows.find((r) => r.key === "toughness");
    expect(t.base).toBe(42);
    expect(t.unnatural).toBe(0);
  });
```

- [ ] **Step 2: Run — verify the new test FAILS.** `npx vitest run test/sheet-data.test.mjs`.

- [ ] **Step 3: Implement.** In `scripts/helpers/sheet-data.mjs`, in `buildCharacteristics`, add `base` and `unnatural` to the returned object:

```javascript
      base: c.base ?? 0,
      unnatural: c.unnatural ?? 0,
```
(alongside `key`/`short`/`label`/`value`/`bonus`/`isInfluence`).

- [ ] **Step 4: Run — verify PASS.** `npx vitest run test/sheet-data.test.mjs`.

- [ ] **Step 5: Commit**

```bash
git add test/sheet-data.test.mjs scripts/helpers/sheet-data.mjs
git commit -m "feat: buildCharacteristics carries base/unnatural for Custom editing (TDD)"
```

---

### Task 3: Actor sheet — mode state, actions, context

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add the mode state field** to the class (near `_hideUntrained`):

```javascript
  /** Advancement mode overlay: "none" | "custom" | "simple" (transient per open sheet). */
  _advancementMode = "none";
```

- [ ] **Step 2: Add two handlers** (after an existing handler, e.g. `#onToggleUntrained`):

```javascript
  /** Action: toggle an advancement mode (press again to return to play mode). */
  static #onSetMode(event, target) {
    const m = target.dataset.mode;
    this._advancementMode = this._advancementMode === m ? "none" : m;
    this.render();
  }

  /** Action: nudge current fatigue by +/-1 (play mode). */
  static async #onAdjustFatigue(event, target) {
    const delta = Number(target.dataset.delta);
    const next = Math.max(0, (this.actor.system.fatigue.value ?? 0) + delta);
    await this.actor.update({ "system.fatigue.value": next });
  }
```

- [ ] **Step 3: Register the actions** in `DEFAULT_OPTIONS.actions` (append with a comma on the previous entry):

```javascript
      setMode: DarkHeresyActorSheet.#onSetMode,
      adjustFatigue: DarkHeresyActorSheet.#onAdjustFatigue
```

- [ ] **Step 4: Add advancement/mode context.** In `_prepareContext`, before `return context;`, add (reuses `sys`):

```javascript
    context.advancementMode = this._advancementMode;
    context.isCustom = this._advancementMode === "custom";
    context.isSimple = this._advancementMode === "simple";
    context.aptitudeChoices = Object.fromEntries(BDH.aptitudes.map((a) => [a, a]));
    context.experience = {
      total: sys.experience.total, spent: sys.experience.spent,
      free: sys.experience.total - sys.experience.spent
    };
    context.charChoices = Object.fromEntries(Object.keys(BDH.characteristics).map((k) => [k, BDH.characteristics[k].short]));
```

(Note: `buildCharacteristics` now provides `base`/`unnatural` on each `context.characteristics` row, and `buildSkills` already provides `rank`. `aptitudeChoices`/`charChoices` are key→label maps for `selectOptions`. `system.aptitudes`/`system.initiative.characteristic`/`system.experience.*`/`system.fate.max`/`system.wounds.max`/`system.fatigue.maxOverride` are read directly in the template.)

- [ ] **Step 5: Verify and commit**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: advancement mode state, setMode/adjustFatigue actions, control-center context"
```

---

### Task 4: Advancement tab template (control center)

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Replace the Advancement placeholder.** Change:

```handlebars
  <section class="tab {{tabs.advancement.cssClass}}" data-group="primary" data-tab="advancement"><p class="placeholder">Advancement — later plan.</p></section>
```
to:
```handlebars
  <section class="tab {{tabs.advancement.cssClass}}" data-group="primary" data-tab="advancement">
    <div class="bdh-adv-ctl">
      <div class="bdh-adv-modes">
        <button type="button" class="bdh-mode {{#if isSimple}}on{{/if}}" data-action="setMode" data-mode="simple">Simple</button>
        <button type="button" class="bdh-mode {{#if isCustom}}on{{/if}}" data-action="setMode" data-mode="custom">Custom</button>
        <span class="bdh-mode-hint">{{#if isCustom}}Custom: edit freely across the sheet.{{else if isSimple}}Simple advancement arrives in the next plan.{{else}}Pick a mode to edit; press again to return to play.{{/if}}</span>
      </div>
      <div class="bdh-xp">
        <label>Total</label><input type="number" name="system.experience.total" value="{{experience.total}}" min="0"/>
        <label>Spent</label>{{#if isCustom}}<input type="number" name="system.experience.spent" value="{{experience.spent}}" min="0"/>{{else}}<span class="bdh-xp-v">{{experience.spent}}</span>{{/if}}
        <label>Free</label><span class="bdh-xp-v bdh-xp-free">{{experience.free}}</span>
      </div>
    </div>
    <div class="bdh-section">
      <div class="bdh-section-head">Aptitudes <span class="bdh-hint2">the character's fixed aptitudes</span></div>
      <select class="bdh-apt-select" name="system.aptitudes" multiple size="10">{{selectOptions aptitudeChoices selected=system.aptitudes}}</select>
    </div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Advancement control center (mode toggles, XP ledger, aptitudes picker)"
```

---

### Task 5: Custom affordances — characteristics, skills, fatigue bar

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Characteristic row.** Change the characteristic box markup (in the Stats char row) from:

```handlebars
          <div class="bonus">{{c.bonus}}</div>
          <div class="box rollable" data-action="rollCharacteristic" data-characteristic="{{c.key}}"><div class="val">{{c.value}}</div><div class="nm">{{c.short}}</div></div>
```
to:
```handlebars
          {{#if isCustom}}
            <input class="bonus bdh-edit" type="number" name="system.characteristics.{{c.key}}.unnatural" value="{{c.unnatural}}" title="Unnatural bonus"/>
          {{else}}
            <div class="bonus">{{c.bonus}}</div>
          {{/if}}
          {{#if isCustom}}
            <div class="box"><input class="val bdh-edit" type="number" name="system.characteristics.{{c.key}}.base" value="{{c.base}}"/><div class="nm">{{c.short}}</div></div>
          {{else}}
            <div class="box rollable" data-action="rollCharacteristic" data-characteristic="{{c.key}}"><div class="val">{{c.value}}</div><div class="nm">{{c.short}}</div></div>
          {{/if}}
```

- [ ] **Step 2: Skill rows.** Change the skill row's value span. From:

```handlebars
            <span class="sval">{{s.total}}</span>
```
to:
```handlebars
            {{#if isCustom}}
              <select class="sval bdh-edit" name="system.skills.{{s.key}}.rank">{{selectOptions ../rankChoices selected=s.rank}}</select>
            {{else}}
              <span class="sval">{{s.total}}</span>
            {{/if}}
```

(NOTE: this needs a `rankChoices` map in context. Add to Task 3 Step 4: `context.rankChoices = { untrained: "Untrained −20", known: "Known +0", trained: "Trained +10", experienced: "Experienced +20", veteran: "Veteran +30" };` — and because `selectOptions` is inside an `{{#each skills}}` block, reference it as `../rankChoices`.)

- [ ] **Step 3: Fatigue bar** (Stats page). Change the fatigue block from:

```handlebars
    <div class="fatigue">
      <span class="lbl">Fatigue</span>
      <span class="bar"><i style="width:{{fatiguePct}}%"></i></span>
      <span class="v">{{system.fatigue.value}} / {{system.fatigue.max}}</span>
    </div>
```
to:
```handlebars
    <div class="fatigue">
      <span class="lbl">Fatigue</span>
      <button type="button" class="bdh-fat-btn" data-action="adjustFatigue" data-delta="-1" title="−1">−</button>
      <span class="bar"><i style="width:{{fatiguePct}}%"></i></span>
      <button type="button" class="bdh-fat-btn" data-action="adjustFatigue" data-delta="1" title="+1">＋</button>
      <span class="v">{{system.fatigue.value}} / {{#if isCustom}}<input class="bdh-edit bdh-fat-max" type="number" name="system.fatigue.maxOverride" value="{{system.fatigue.maxOverride}}" placeholder="{{system.fatigue.max}}" min="0"/>{{else}}{{system.fatigue.max}}{{/if}}</span>
    </div>
```

- [ ] **Step 4: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Custom affordances on Stats (characteristic base/unnatural, skill rank, fatigue +/- and max)"
```

---

### Task 6: Custom affordances — Combat (wounds max, initiative) + header (fate max); rankChoices context

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs` (add `rankChoices` to context)
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1:** In `actor-sheet.mjs` `_prepareContext`, add to the advancement context block:

```javascript
    context.rankChoices = { untrained: "Untrained −20", known: "Known +0", trained: "Trained +10", experienced: "Experienced +20", veteran: "Veteran +30" };
```

- [ ] **Step 2: Combat Wounds — max editable only in Custom.** Change the Wounds inputs block from:

```handlebars
              <label>Max</label><input type="number" name="system.wounds.max" value="{{system.wounds.max}}"/>
```
to:
```handlebars
              <label>Max</label>{{#if isCustom}}<input type="number" name="system.wounds.max" value="{{system.wounds.max}}"/>{{else}}<span class="bdh-ro">{{system.wounds.max}}</span>{{/if}}
```

- [ ] **Step 3: Combat Initiative — show chosen characteristic; dropdown in Custom.** Change:

```handlebars
            <div class="bdh-init">Initiative: 1d10 + {{agilityBonus}} (Ag)</div>
```
to:
```handlebars
            <div class="bdh-init">Initiative: 1d10 +
              {{#if isCustom}}<select name="system.initiative.characteristic">{{selectOptions charChoices selected=system.initiative.characteristic}}</select>{{else}}<b>{{initBonus}}</b> ({{initShort}}){{/if}}
            </div>
```
(This needs `initBonus`/`initShort` in context — add in Step 5.)

- [ ] **Step 4: Header Fate — max editable only in Custom.** Change the header fate block from:

```handlebars
    <div class="fate">
      <div class="lbl">Fate</div>
      <div class="v">{{system.fate.value}} / {{system.fate.max}}</div>
    </div>
```
to:
```handlebars
    <div class="fate">
      <div class="lbl">Fate</div>
      <div class="v">{{system.fate.value}} / {{#if isCustom}}<input class="bdh-edit bdh-fate-max" type="number" name="system.fate.max" value="{{system.fate.max}}" min="0"/>{{else}}{{system.fate.max}}{{/if}}</div>
    </div>
```

- [ ] **Step 5:** In `actor-sheet.mjs` `_prepareContext`, add (so the play-mode initiative shows the chosen characteristic's bonus):

```javascript
    const initKey = sys.initiative.characteristic;
    context.initBonus = sys.characteristics[initKey].bonus;
    context.initShort = BDH.characteristics[initKey].short;
```

- [ ] **Step 6: Verify and commit**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs
git commit -m "feat: Custom affordances on Combat (wounds max, initiative dropdown) + header (fate max); rankChoices"
```

---

### Task 7: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append:**

```css

/* Advancement control center + Custom-mode editables */
.better-dh2e .bdh-adv-ctl { display:flex; flex-wrap:wrap; align-items:center; gap:14px; padding:8px 14px; }
.better-dh2e .bdh-adv-modes { display:flex; align-items:center; gap:8px; }
.better-dh2e .bdh-mode { background:var(--bdh-panel); color:var(--bdh-maroon); border:1px solid var(--bdh-brown); border-radius:5px; padding:4px 14px; cursor:pointer; font-variant:small-caps; letter-spacing:1px; }
.better-dh2e .bdh-mode.on { background:var(--bdh-maroon); color:var(--bdh-parch); }
.better-dh2e .bdh-mode-hint { font-size:11px; color:var(--bdh-muted); font-style:italic; }
.better-dh2e .bdh-xp { display:flex; align-items:center; gap:6px; }
.better-dh2e .bdh-xp label { font-size:10px; text-transform:uppercase; color:var(--bdh-muted); letter-spacing:1px; }
.better-dh2e .bdh-xp input, .better-dh2e .bdh-xp .bdh-xp-v { width:70px; text-align:right; font-weight:bold; }
.better-dh2e .bdh-xp-free { color:#3d6a4a; }
.better-dh2e .bdh-apt-select { width:calc(100% - 16px); margin:4px 8px 8px; min-height:180px; }
.better-dh2e .bdh-edit { background:#fff6df; border:1px solid var(--bdh-gold); border-radius:3px; }
.better-dh2e .char .box input.val { width:80%; text-align:center; font-size:18px; font-weight:bold; }
.better-dh2e input.bonus { width:60%; text-align:center; }
.better-dh2e .skill select.sval { min-width:90px; }
.better-dh2e .bdh-fat-btn { flex:0 0 auto; width:20px; height:18px; line-height:1; background:var(--bdh-panel); border:1px solid var(--bdh-brown); border-radius:3px; cursor:pointer; color:var(--bdh-maroon); }
.better-dh2e .bdh-fat-max, .better-dh2e .bdh-fate-max { width:48px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: Advancement + Custom-mode styles"
```

---

### Task 8: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)"):
- [ ] **Advancement tab**: mode buttons (Simple/Custom), Total (editable) / Spent / **Free = Total − Spent**, and an Aptitudes multi-select. Pick a few aptitudes → reopen, persist. Set Total to 5000 → Free updates.
- [ ] Press **Custom** → it highlights, and **Simple** shows a "next plan" hint.
- [ ] With **Custom on**, go to **Stats**: each characteristic shows an **editable value (base)** and an **editable bonus (unnatural)**; set Toughness unnatural to 2 → its play-mode bonus becomes base-tens + 2. Skills show **rank dropdowns**.
- [ ] **Combat** (Custom): Wounds **Max** is editable; Initiative shows a **characteristic dropdown**; set it to Perception → in play mode the line reads "1d10 + <Per bonus> (Per)". **Header**: Fate **max** is editable.
- [ ] Turn **Custom off** → all those revert to read-only display; characteristics are click-to-roll again, skills roll on click.
- [ ] **Fatigue bar** (play mode, Custom off): **−/＋** buttons change current fatigue by 1 (clamped at 0); the bar fill updates.
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§6 Advancement / §13 fatigue):**
- Control center (aptitudes, Total/Spent/Free, mode toggles) → Tasks 1/3/4. ✓
- Custom editables (value=base, bonus=unnatural, skill rank, Spent, wounds max, fatigue max, fate max, initiative char) → Tasks 1/2/3/5/6. ✓
- Fatigue +/- (play) + max override (Custom) → Tasks 1/3/5. ✓
- Mode = transient toggle, read-only in play → Task 3 state + template `{{#if isCustom}}`. ✓

**Deferred (declared):** Simple mode + costs (Plan 13); fatigue halving; initiative→combat-tracker.

**Placeholder scan:** complete; checklist concrete (Toughness unnatural 2; Free = Total − Spent).

**Type/name consistency:** action names `setMode`/`adjustFatigue` match `DEFAULT_OPTIONS.actions`, handlers, template `data-action`. All Custom inputs are named `system.*` paths that exist after Task 1 (`experience.total/spent`, `aptitudes`, `fatigue.maxOverride`, `initiative.characteristic`, plus existing `characteristics.<k>.base/unnatural`, `skills.<k>.rank`, `wounds.max`, `fate.max`) → save via the `<div>`-rooted form. `buildCharacteristics` provides `base`/`unnatural` (Task 2); `rankChoices`/`aptitudeChoices`/`charChoices`/`initBonus`/`initShort`/`experience` in context. Buttons are `type="button"`. Mode is transient (resets on reopen). Plan 13's Simple-mode `+5`/`+` overlays the SAME characteristic/skill rows when `isSimple`.
