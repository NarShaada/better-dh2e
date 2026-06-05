# Better DH2e — Plan 6: Actor Item Management + Abilities & Notes Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the character sheet show what a character owns. Add generic item-management controls (create / edit / delete / drag-in already works) and render the **Abilities** tab (talents & traits, with a favourite star) and the **Notes** tab (a freeform text box).

**Architecture:** Dropping items onto the actor already creates owned items via the inherited `ActorSheetV2._onDropItem` — no wiring needed. We add `data-action` handlers for create/edit/delete/favourite to the existing `DarkHeresyActorSheet`, group `actor.items` by type in the sheet context, and fill in the Abilities & Notes tab sections (currently placeholders). A `notes` field is added to the actor model.

**Tech Stack:** Foundry v13 (`ActorSheetV2` inherited DragDrop, ApplicationV2 `actions`, `Actor#createEmbeddedDocuments`, `item.sheet.render`, `item.delete`, `item.update`), Handlebars.

**Scope of THIS plan:** the `notes` actor field; create/edit/delete/favourite actions; Abilities tab (talents + traits); Notes tab. Drag-to-add already works via the base class.

**Out of scope (later plans):** Gear tab (Plan 7), Combat sub-tab (Plan 8), Afflictions (Plan 9), Psychic (Plan 10), Advancement. Item *sorting*, delete-confirmation dialogs.

**Reference:** spec §6 (Abilities "keep + favourite star"; Notes "text"). Verified v13: `ActorSheetV2` binds DragDrop in its own `_onRender` and `_onDropItem` creates the embedded item (`Item.implementation.create(item.toObject(), {parent: this.actor})`) — **do not override `_onRender` without calling `super`**, or the drop binding breaks. The actor sheet root is already a `<div>` (Plan 4 fix), so `name="system.notes"` saves via `submitOnChange`. Action buttons must be `type="button"` (else they submit the form).

---

## File Structure

```
scripts/data/actor/base-actor-model.mjs  MODIFY  add `notes` StringField
scripts/data/actor/npc-model.mjs         MODIFY  remove its own `notes` (now on base)
scripts/sheets/actor-sheet.mjs           MODIFY  group owned items; create/edit/delete/favourite actions
templates/actor/actor-sheet.hbs          MODIFY  fill Abilities + Notes sections
styles/better-dh2e.css                   MODIFY  item-list + notes styles
```

---

### Task 1: Add the `notes` actor field

**Files:**
- Modify: `scripts/data/actor/base-actor-model.mjs`
- Modify: `scripts/data/actor/npc-model.mjs`

- [ ] **Step 1:** In `base-actor-model.mjs`, add a `notes` field to the object returned by `defineSchema()` (alongside `injuries`):

```javascript
      notes: new fields.StringField({ required: true, initial: "" }),
```

- [ ] **Step 2:** In `npc-model.mjs`, REMOVE its own `notes` line (it currently has `notes: new fields.HTMLField({ required: true, initial: "" })` — delete that line so the base StringField is used). Keep `faction` and `threatLevel`.

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/data/actor/base-actor-model.mjs && node --check scripts/data/actor/npc-model.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/data/actor/base-actor-model.mjs scripts/data/actor/npc-model.mjs
git commit -m "feat: unified actor notes field (plain text) on the base model"
```

---

### Task 2: Actor sheet — owned-item context + actions

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add four action handlers** inside the class, right after the existing `static #onRollSkill(...)` method:

```javascript
  /** Action: create a new owned item of the given type and open its sheet. */
  static async #onCreateItem(event, target) {
    const type = target.dataset.type;
    const name = `New ${game.i18n.localize(`TYPES.Item.${type}`)}`;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{ name, type }]);
    created?.sheet.render(true);
  }

  /** Action: open an owned item's sheet for editing. */
  static #onEditItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(id)?.sheet.render(true);
  }

  /** Action: delete an owned item. */
  static async #onDeleteItem(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    await this.actor.items.get(id)?.delete();
  }

  /** Action: toggle a talent's favourite flag. */
  static async #onToggleFavourite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item) await item.update({ "system.favourite": !item.system.favourite });
  }
```

- [ ] **Step 2: Register those actions.** In `DEFAULT_OPTIONS.actions`, change:

```javascript
    actions: {
      toggleUntrained: DarkHeresyActorSheet.#onToggleUntrained,
      rollCharacteristic: DarkHeresyActorSheet.#onRollCharacteristic,
      rollSkill: DarkHeresyActorSheet.#onRollSkill
    }
```
to:
```javascript
    actions: {
      toggleUntrained: DarkHeresyActorSheet.#onToggleUntrained,
      rollCharacteristic: DarkHeresyActorSheet.#onRollCharacteristic,
      rollSkill: DarkHeresyActorSheet.#onRollSkill,
      createItem: DarkHeresyActorSheet.#onCreateItem,
      editItem: DarkHeresyActorSheet.#onEditItem,
      deleteItem: DarkHeresyActorSheet.#onDeleteItem,
      toggleFavourite: DarkHeresyActorSheet.#onToggleFavourite
    }
```

- [ ] **Step 3: Group owned items in the context.** In `_prepareContext`, right before `return context;`, add:

```javascript
    const items = this.document.items;
    context.talents = items.filter((i) => i.type === "talent").map((t) => ({
      id: t.id, name: t.name, favourite: t.system.favourite, tier: t.system.tier,
      aptitudes: (t.system.aptitudes ?? []).join(", ")
    }));
    context.traits = items.filter((i) => i.type === "trait").map((t) => ({ id: t.id, name: t.name }));
```

- [ ] **Step 4: Syntax-check and run tests**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: actor item create/edit/delete/favourite actions; group talents & traits"
```

---

### Task 3: Template — Abilities & Notes sections

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Replace the Abilities placeholder.** Change:

```handlebars
  <section class="tab {{tabs.abilities.cssClass}}" data-group="primary" data-tab="abilities"><p class="placeholder">Abilities — later plan.</p></section>
```
to:
```handlebars
  <section class="tab {{tabs.abilities.cssClass}}" data-group="primary" data-tab="abilities">
    <div class="bdh-section">
      <div class="bdh-section-head">Talents <button type="button" class="bdh-add" data-action="createItem" data-type="talent">＋</button></div>
      {{#each talents as |t|}}
        <div class="bdh-item-row" data-item-id="{{t.id}}">
          <a class="bdh-fav {{#if t.favourite}}on{{/if}}" data-action="toggleFavourite" title="Favourite">★</a>
          <span class="bdh-name" data-action="editItem">{{t.name}}</span>
          <span class="bdh-meta">Tier {{t.tier}}{{#if t.aptitudes}} · {{t.aptitudes}}{{/if}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless talents.length}}<div class="bdh-empty">No talents — drag one in or press ＋.</div>{{/unless}}
    </div>

    <div class="bdh-section">
      <div class="bdh-section-head">Traits <button type="button" class="bdh-add" data-action="createItem" data-type="trait">＋</button></div>
      {{#each traits as |tr|}}
        <div class="bdh-item-row" data-item-id="{{tr.id}}">
          <span class="bdh-name" data-action="editItem">{{tr.name}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless traits.length}}<div class="bdh-empty">No traits.</div>{{/unless}}
    </div>
  </section>
```

- [ ] **Step 2: Replace the Notes placeholder.** Change:

```handlebars
  <section class="tab {{tabs.notes.cssClass}}" data-group="primary" data-tab="notes"><p class="placeholder">Notes — later plan.</p></section>
```
to:
```handlebars
  <section class="tab {{tabs.notes.cssClass}}" data-group="primary" data-tab="notes">
    <textarea class="bdh-notes" name="system.notes" rows="16" placeholder="Freeform notes…">{{system.notes}}</textarea>
  </section>
```

- [ ] **Step 3: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Abilities tab (talents/traits) and Notes tab content"
```

---

### Task 4: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append to `styles/better-dh2e.css`:**

```css

/* Item-list sections on actor tabs (Abilities, later Gear/Afflictions/Psychic) */
.better-dh2e .bdh-section { margin:8px 14px; background:var(--bdh-panel); border:1px solid var(--bdh-brown); border-radius:5px; overflow:hidden; }
.better-dh2e .bdh-section-head { display:flex; align-items:center; gap:8px; background:var(--bdh-brown); color:var(--bdh-parch); font-variant:small-caps; letter-spacing:1px; padding:3px 10px; font-size:13px; }
.better-dh2e .bdh-add { margin-left:auto; background:var(--bdh-parch); color:var(--bdh-maroon); border:none; border-radius:3px; font-weight:bold; cursor:pointer; padding:0 8px; }
.better-dh2e .bdh-item-row { display:flex; align-items:center; gap:8px; padding:3px 10px; border-bottom:1px dotted #cbb88c; font-size:12px; }
.better-dh2e .bdh-item-row:last-child { border-bottom:none; }
.better-dh2e .bdh-fav { color:#b3a070; cursor:pointer; }
.better-dh2e .bdh-fav.on { color:var(--bdh-gold); }
.better-dh2e .bdh-name { font-weight:bold; color:var(--bdh-maroon); cursor:pointer; }
.better-dh2e .bdh-name:hover { text-decoration:underline; }
.better-dh2e .bdh-meta { color:var(--bdh-muted); font-size:11px; }
.better-dh2e .bdh-del { margin-left:auto; color:#7a1f1f; cursor:pointer; }
.better-dh2e .bdh-empty { padding:5px 10px; color:var(--bdh-muted); font-style:italic; font-size:11px; }
.better-dh2e .bdh-notes { display:block; width:calc(100% - 28px); margin:8px 14px; padding:8px; box-sizing:border-box; min-height:280px; resize:vertical; border:1px solid var(--bdh-brown); border-radius:4px; background:#fff8e7; color:var(--bdh-ink); font-family:Georgia, serif; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: styles for actor item-list sections and notes"
```

---

### Task 5: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → open "Daren Vholk (Test Acolyte)"):
- [ ] **Abilities tab** → two sections (Talents, Traits), each empty with a hint and a ＋ button.
- [ ] Press **＋ on Talents** → a new talent item is created and its edit sheet opens; set its name/tier, close → it appears in the Talents list with "Tier N".
- [ ] **Drag** a Talent item from the sidebar onto the actor → it's added to the list (inherited behaviour).
- [ ] Click the **★** on a talent → toggles gold (favourite on/off); reopen sheet → state persists.
- [ ] Click a talent's **name** → its item sheet opens. Click **✖** → it's removed from the list.
- [ ] **Traits** section behaves the same (create / drag / edit / delete; no star).
- [ ] **Notes tab** → type into the box, switch tabs and back (or reopen) → text persists.
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§6):**
- Abilities = talents + traits with favourite star → Tasks 2/3. ✓
- Notes = text box → Tasks 1/3. ✓
- Item management (create/edit/delete; drag-in inherited) → Task 2. ✓

**Deferred (declared):** Gear/Combat/Afflictions/Psychic/Advancement tabs; item sorting; delete confirmation.

**Placeholder scan:** all code complete; checklist uses concrete actions (create talent, star toggles, notes persist).

**Type/name consistency:** action names `createItem`/`editItem`/`deleteItem`/`toggleFavourite` match `DEFAULT_OPTIONS.actions`, the handlers, and the template `data-action`. Handlers read `data-item-id` from `closest("[data-item-id]")` (present on each `.bdh-item-row`) and `data-type` from the create button. `context.talents`/`context.traits` match the template `{{#each}}`. `name="system.notes"` matches the new base-model field and saves through the `<div>`-rooted form. Action buttons are `type="button"`. No `_onRender` override (preserves inherited DragDrop).
