# Better DH2e — Plan 11: Psychic Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the **Psychic** tab: a **Psy Rating** integer at the top, then the **Psychic Powers** list (psychicPower items, reusing create/edit/delete + drag-in). Deliberately minimal this version.

**Architecture:** Add `psyRating` (int) to the base actor model; the named input saves via the form. Powers are `psychicPower` items grouped into the context; the tab reuses the existing item-row pattern.

**Tech Stack:** Foundry v13 (named form input, item actions), Handlebars.

**Scope of THIS plan:** the Psy Rating field + the powers list.

**Out of scope:** Focus-power tests, Phenomena/Perils, push/sustain, attack powers — the full psychic automation is the future phase (spec §9). Advancement; the full attack pipeline.

**Reference:** spec §4 (Psy Rating = a simple integer on the Psychic tab) + §6 (Psychic kept simple; powers are descriptive items). Reuses `createItem`/`editItem`/`deleteItem` (Plan 6) and inherited drag-to-add.

---

## File Structure

```
scripts/data/actor/base-actor-model.mjs  MODIFY  add `psyRating` int
scripts/sheets/actor-sheet.mjs           MODIFY  group psychicPower items
templates/actor/actor-sheet.hbs          MODIFY  fill the Psychic tab
styles/better-dh2e.css                   MODIFY  psy-rating bar
```

---

### Task 1: `psyRating` field

**Files:**
- Modify: `scripts/data/actor/base-actor-model.mjs`

- [ ] **Step 1:** Add to the `defineSchema()` object (alongside `corruption`/`insanity`):

```javascript
      psyRating: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
```

- [ ] **Step 2: Syntax-check and commit**

Run: `node --check scripts/data/actor/base-actor-model.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/data/actor/base-actor-model.mjs
git commit -m "feat: psyRating field on the actor model"
```

---

### Task 2: Group psychic powers in the context

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1:** In `_prepareContext`, before `return context;` (alongside the other item groupings, reusing the `items`/`firstLine` locals), add:

```javascript
    context.psychicPowers = items.filter((i) => i.type === "psychicPower").map((p) => ({
      id: p.id, name: p.name, desc: firstLine(p.system.description)
    }));
```

- [ ] **Step 2: Syntax-check and run tests**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: group psychic-power items for the Psychic tab"
```

---

### Task 3: Psychic tab template

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Replace the Psychic placeholder.** Change:

```handlebars
  <section class="tab {{tabs.psychic.cssClass}}" data-group="primary" data-tab="psychic"><p class="placeholder">Psychic — later plan.</p></section>
```
to:
```handlebars
  <section class="tab {{tabs.psychic.cssClass}}" data-group="primary" data-tab="psychic">
    <div class="bdh-psy-bar"><label>Psy Rating</label><input type="number" name="system.psyRating" value="{{system.psyRating}}" min="0"/></div>
    <div class="bdh-section">
      <div class="bdh-section-head">Psychic Powers <button type="button" class="bdh-add" data-action="createItem" data-type="psychicPower">＋</button></div>
      {{#each psychicPowers as |p|}}
        <div class="bdh-item-row" data-item-id="{{p.id}}">
          <span class="bdh-name" data-action="editItem">{{p.name}}</span>
          <span class="bdh-desc-line">{{p.desc}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless psychicPowers.length}}<div class="bdh-empty">No powers — drag one in or press ＋.</div>{{/unless}}
    </div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Psychic tab (psy rating + powers list)"
```

---

### Task 4: Styles + deploy & verify

**Files:**
- Modify: `styles/better-dh2e.css`

- [ ] **Step 1: Append:**

```css

/* Psychic tab */
.better-dh2e .bdh-psy-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; }
.better-dh2e .bdh-psy-bar label { font-variant:small-caps; letter-spacing:1px; color:var(--bdh-maroon); font-weight:bold; }
.better-dh2e .bdh-psy-bar input { width:64px; font-size:16px; font-weight:bold; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: Psychic tab styles"
```

- [ ] **Step 3: Deploy** — `npm run deploy`.
- [ ] **Step 4: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 5: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)" → **Psychic** tab):
- [ ] A **Psy Rating** input at the top; set it to 3 → reopen, persists.
- [ ] **Psychic Powers** section with ＋; create a power → opens its sheet, set name/description → shows in the list with the description's first line.
- [ ] **Drag** a psychic-power item from the sidebar onto the actor → lands in the list.
- [ ] Click a power name → its sheet opens; ✖ deletes.
- [ ] **F12 console**: no errors.

- [ ] **Step 6:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§4/§6 Psychic):**
- Psy Rating int at top → Tasks 1/3 (`system.psyRating` named input). ✓
- Powers list → Tasks 2/3 (reused item actions). ✓

**Deferred (declared):** all psychic automation (focus tests, phenomena/perils, push/sustain) — future phase §9.

**Placeholder scan:** complete; checklist concrete (Psy Rating 3 persists).

**Type/name consistency:** `system.psyRating` (Task 1 field) matches the named input (saves via the `<div>`-rooted form). `psychicPowers` context matches the template `{{#each}}`. Powers reuse `createItem`/`editItem`/`deleteItem` (`psychicPower` type registered in Plan 4). `firstLine` in scope.
