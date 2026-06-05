# Better DH2e — Plan 7: Gear Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the **Gear** tab: list the character's **Weapons**, **Protection** (armour + force fields), and **Gear**, with **equip toggles** (armour enforces "one non-additive piece at a time"), an editable **quantity** on gear, and a **carried-weight** readout. Create/edit/delete and drag-in reuse Plan 6.

**Architecture:** The actor sheet groups owned items by type into the context (with brief display summaries) and computes carried weight. A new `toggleEquipped` action flips `system.equipped` (and, for a non-additive armour, unequips other non-additive armour via `updateEmbeddedDocuments`). Quantity uses a no-`name` number input whose `change` updates the embedded item — wired in an `_onRender` override that **calls `super` first** (to preserve the inherited `ActorSheetV2` DragDrop binding).

**Tech Stack:** Foundry v13 (`ActorSheetV2`, ApplicationV2 `actions`, `item.update`, `actor.updateEmbeddedDocuments`), Handlebars.

**Scope of THIS plan:** Gear tab content, equip toggles + armour rule, gear quantity, carried-weight total.

**Out of scope (later plans):** the Combat sub-tab's armour row / equipped-weapon attack buttons (Plan 8 reads these equipped flags); full encumbrance engine (max from SB+TB table + penalties — only a carried-weight number here); Afflictions/Psychic/Advancement.

**Reference:** spec §6 (Gear = Weapons / Protection / Gear; equipped feeds Combat; armour one-non-stacking-at-a-time). Verified prior: `ActorSheetV2._onRender` binds DragDrop — our override must `await super._onRender(...)`. No-`name` inputs are excluded from the form submit (so quantity won't hit `actor.update`); we update the item directly on `change`.

---

## File Structure

```
scripts/sheets/actor-sheet.mjs    MODIFY  import BDH; group weapons/armour/forceFields/gear + carriedWeight; toggleEquipped action; _onRender qty wiring
templates/actor/actor-sheet.hbs   MODIFY  fill the Gear tab section
styles/better-dh2e.css            MODIFY  equip toggle / subhead / qty / gear-bar styles
```

---

### Task 1: Actor sheet — gear context, equip action, quantity wiring

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add the BDH import** at the top, after the existing imports:

```javascript
import { BDH } from "../config.mjs";
```

- [ ] **Step 2: Add the `toggleEquipped` handler** right after the existing `static async #onToggleFavourite(...)` method:

```javascript
  /** Action: toggle an item's equipped flag. Armour: only one non-additive piece equipped at a time. */
  static async #onToggleEquipped(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const next = !item.system.equipped;
    if (item.type === "armour" && next && !item.system.additive) {
      const others = this.actor.items.filter(
        (i) => i.type === "armour" && i.id !== id && i.system.equipped && !i.system.additive
      );
      if (others.length) {
        await this.actor.updateEmbeddedDocuments("Item", others.map((o) => ({ _id: o.id, "system.equipped": false })));
      }
    }
    await item.update({ "system.equipped": next });
  }
```

- [ ] **Step 3: Register the action.** In `DEFAULT_OPTIONS.actions`, add a `toggleEquipped` entry alongside the others:

```javascript
      toggleEquipped: DarkHeresyActorSheet.#onToggleEquipped
```
(append it after `toggleFavourite: DarkHeresyActorSheet.#onToggleFavourite` — mind the comma.)

- [ ] **Step 4: Group gear items + carried weight in the context.** In `_prepareContext`, right after the existing `context.traits = ...` line (and before `return context;`), add:

```javascript
    const LOC = { head: "Head", body: "Body", rightArm: "R Arm", leftArm: "L Arm", rightLeg: "R Leg", leftLeg: "L Leg" };
    context.weapons = items.filter((i) => i.type === "weapon").map((w) => ({
      id: w.id, name: w.name, equipped: w.system.equipped,
      summary: `${BDH.weaponClasses[w.system.weaponClass] ?? w.system.weaponClass} · ${w.system.damage} ${BDH.damageTypes[w.system.damageType] ?? ""} · Pen ${w.system.penetration}`
    }));
    context.armour = items.filter((i) => i.type === "armour").map((a) => ({
      id: a.id, name: a.name, equipped: a.system.equipped, additive: a.system.additive,
      ap: Object.entries(a.system.locations).filter(([, v]) => v > 0).map(([k, v]) => `${LOC[k]} ${v}`).join(", ") || "—"
    }));
    context.forceFields = items.filter((i) => i.type === "forceField").map((f) => ({
      id: f.id, name: f.name, equipped: f.system.equipped, pr: f.system.protectionRating
    }));
    context.gear = items.filter((i) => i.type === "gear").map((g) => ({
      id: g.id, name: g.name, desc: firstLine(g.system.description),
      craft: BDH.craftsmanship[g.system.craftsmanship] ?? g.system.craftsmanship, quantity: g.system.quantity
    }));
    context.carriedWeight = items.reduce((sum, i) => {
      const w = i.system.weight ?? 0;
      if (i.type === "gear") return sum + w * (i.system.quantity ?? 1);
      if (i.type === "weapon" || i.type === "armour" || i.type === "forceField") return sum + w;
      return sum;
    }, 0);
```

(Note: `firstLine` is the local helper already defined in `_prepareContext` from Plan 6 — reuse it.)

- [ ] **Step 5: Add an `_onRender` override** for the quantity inputs. Add this method to the class (e.g. right after `_prepareContext`). It MUST call `super._onRender` first to keep the inherited DragDrop:

```javascript
  async _onRender(context, options) {
    await super._onRender(context, options);
    // Gear quantity: a no-name input that updates the embedded item directly (so it isn't part of the actor form submit).
    for (const input of this.element.querySelectorAll(".bdh-qty")) {
      input.addEventListener("change", (event) => {
        const id = event.currentTarget.closest("[data-item-id]")?.dataset.itemId;
        const item = this.actor.items.get(id);
        if (item) item.update({ "system.quantity": Math.max(0, Math.floor(Number(event.currentTarget.value) || 0)) });
      });
    }
  }
```

- [ ] **Step 6: Syntax-check and run tests**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: Gear-tab context (weapons/armour/force fields/gear + carried weight), equip toggle, gear quantity"
```

---

### Task 2: Template — Gear tab

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Replace the Gear placeholder.** Change:

```handlebars
  <section class="tab {{tabs.gear.cssClass}}" data-group="primary" data-tab="gear"><p class="placeholder">Gear — later plan.</p></section>
```
to:
```handlebars
  <section class="tab {{tabs.gear.cssClass}}" data-group="primary" data-tab="gear">
    <div class="bdh-gear-bar">Weight carried: <b>{{carriedWeight}}</b></div>

    <div class="bdh-section">
      <div class="bdh-section-head">⚔ Weapons <button type="button" class="bdh-add" data-action="createItem" data-type="weapon">＋</button></div>
      {{#each weapons as |w|}}
        <div class="bdh-item-row" data-item-id="{{w.id}}">
          <a class="bdh-eq {{#if w.equipped}}on{{/if}}" data-action="toggleEquipped" title="Equipped">{{#if w.equipped}}✓{{else}}○{{/if}}</a>
          <span class="bdh-name" data-action="editItem">{{w.name}}</span>
          <span class="bdh-desc-line">{{w.summary}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless weapons.length}}<div class="bdh-empty">No weapons.</div>{{/unless}}
    </div>

    <div class="bdh-section">
      <div class="bdh-section-head">🛡 Protection</div>
      <div class="bdh-subhead">Armour <span class="bdh-hint2">one non-additive worn at a time</span> <button type="button" class="bdh-add" data-action="createItem" data-type="armour">＋</button></div>
      {{#each armour as |a|}}
        <div class="bdh-item-row" data-item-id="{{a.id}}">
          <a class="bdh-eq {{#if a.equipped}}on{{/if}}" data-action="toggleEquipped" title="Equipped">{{#if a.equipped}}✓{{else}}○{{/if}}</a>
          <span class="bdh-name" data-action="editItem">{{a.name}}{{#if a.additive}} <span class="bdh-tag">additive</span>{{/if}}</span>
          <span class="bdh-desc-line">{{a.ap}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless armour.length}}<div class="bdh-empty">No armour.</div>{{/unless}}
      <div class="bdh-subhead">Force Fields <button type="button" class="bdh-add" data-action="createItem" data-type="forceField">＋</button></div>
      {{#each forceFields as |f|}}
        <div class="bdh-item-row" data-item-id="{{f.id}}">
          <a class="bdh-eq {{#if f.equipped}}on{{/if}}" data-action="toggleEquipped" title="Equipped">{{#if f.equipped}}✓{{else}}○{{/if}}</a>
          <span class="bdh-name" data-action="editItem">{{f.name}}</span>
          <span class="bdh-desc-line">PR {{f.pr}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless forceFields.length}}<div class="bdh-empty">No force fields.</div>{{/unless}}
    </div>

    <div class="bdh-section">
      <div class="bdh-section-head">🎒 Gear <button type="button" class="bdh-add" data-action="createItem" data-type="gear">＋</button></div>
      {{#each gear as |g|}}
        <div class="bdh-item-row" data-item-id="{{g.id}}">
          <span class="bdh-name" data-action="editItem">{{g.name}}</span>
          <span class="bdh-desc-line">{{g.desc}}</span>
          <span class="bdh-craft">{{g.craft}}</span>
          <span class="bdh-qty-wrap">×<input type="number" class="bdh-qty" value="{{g.quantity}}" min="0"/></span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
      {{/each}}
      {{#unless gear.length}}<div class="bdh-empty">No gear.</div>{{/unless}}
    </div>
  </section>
```

- [ ] **Step 2: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Gear tab content (weapons / protection / gear)"
```

---

### Task 3: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append:**

```css

/* Gear tab */
.better-dh2e .bdh-gear-bar { margin:8px 14px 0; font-size:12px; color:var(--bdh-muted); }
.better-dh2e .bdh-gear-bar b { color:var(--bdh-ink); font-size:14px; }
.better-dh2e .bdh-subhead { display:flex; align-items:center; gap:8px; padding:3px 10px; font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--bdh-muted); background:#e2d2ac; }
.better-dh2e .bdh-subhead .bdh-hint2 { text-transform:none; letter-spacing:0; font-style:italic; opacity:.8; }
.better-dh2e .bdh-eq { flex:0 0 auto; width:18px; text-align:center; color:var(--bdh-muted); cursor:pointer; font-weight:bold; }
.better-dh2e .bdh-eq.on { color:#3d6a4a; }
.better-dh2e .bdh-tag { font-size:9px; text-transform:uppercase; letter-spacing:1px; color:var(--bdh-muted); border:1px solid #b3a070; border-radius:8px; padding:0 5px; }
.better-dh2e .bdh-craft { flex:0 0 auto; font-size:11px; color:var(--bdh-muted); }
.better-dh2e .bdh-qty-wrap { flex:0 0 auto; font-size:11px; color:var(--bdh-muted); }
.better-dh2e .bdh-qty { width:44px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: Gear tab styles (equip toggle, subheads, quantity)"
```

---

### Task 4: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)" → Gear tab):
- [ ] Three sections show: **Weapons**, **Protection** (Armour + Force Fields subheads), **Gear**, each with a ＋ and empty hints.
- [ ] Create a **Weapon** (＋) → appears with its class · damage · Pen summary; click the **○** → turns to **✓** (equipped, green).
- [ ] Create two **Armour** items, both non-additive → equipping the second **auto-unequips the first** (one-at-a-time). Mark one **additive** on its sheet → it can stay equipped alongside a non-additive piece.
- [ ] Create a **Force Field** → shows "PR n"; equip toggles.
- [ ] Create a **Gear** item → shows craftsmanship + a **quantity** box; change the quantity to 5, switch tabs and back → it stays 5; the **Weight carried** total reflects weight×qty.
- [ ] **Drag** any item from the sidebar onto the actor → lands in the right section.
- [ ] Click a name → item sheet opens; **✖** deletes.
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§6 Gear):**
- Weapons / Protection (armour + force field) / Gear sections → Tasks 1/2. ✓
- Equip toggles; armour one-non-additive-at-a-time → Task 1 `#onToggleEquipped`. ✓
- Gear quantity on the actor tab → Task 1 `_onRender` + Task 2 input. ✓
- Carried weight readout → Task 1 `carriedWeight`. ✓

**Deferred (declared):** Combat armour row / equipped-weapon attacks (Plan 8); full encumbrance engine (max + penalties); other tabs.

**Placeholder scan:** complete; checklist uses concrete behaviour (second armour unequips first; qty persists).

**Type/name consistency:** `toggleEquipped` matches `DEFAULT_OPTIONS.actions`, the handler, and the template `data-action`; `createItem`/`editItem`/`deleteItem` reused from Plan 6. Context keys (`weapons`/`armour`/`forceFields`/`gear`/`carriedWeight`) match the template `{{#each}}`. The `.bdh-qty` input has **no `name`** (excluded from the actor form) and is wired by class in the `_onRender` change handler, which **awaits `super._onRender`** to preserve DragDrop. `BDH.weaponClasses`/`damageTypes`/`craftsmanship` exist in config; armour `locations` keys match the `LOC` map. `system.equipped` exists on weapon/armour/forceField models; `system.quantity` on gear.
