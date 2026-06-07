# Better DH2e — Plan 30: Playtester Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix one bug + three UX improvements from playtest feedback:
1. **Apply Damage button** appears per-viewer based on *target ownership* (GM always; a player only when their own character is the target; nobody else sees it).
2. **Called-Shot Location** row in the attack dialog shows only when Attack Type = Called Shot.
3. **Combat sub-tab** Favourite Talents/Traits sections appear only if the character has ≥1 of that category (skills unchanged).
4. **Aptitudes** editing (actor + talent) becomes a dropdown of unused aptitudes + Add button + ✕-per-aptitude; actor aptitudes editable in Custom mode only.

**Tech Stack:** Foundry v13/v14 (chat hook, DialogV2 render callback, ApplicationV2 actions), Handlebars. (No new pure logic → no Vitest additions; existing 102 tests stay green.)

**Scope:** the four items above. **Out of scope:** the "discuss separately" item (pending).

Builds on: `bindCardButtons` (the `renderChatMessageHTML` hook), the attack dialog, the Combat-tab favourites (Plan 9), the actor/talent aptitude editors.

---

## File Structure

```
scripts/rolls/attack.mjs          MODIFY  canApply (render always); bindCardButtons hides applyDamage for non-owners; dialog render callback for Called-Shot row
scripts/sheets/actor-sheet.mjs    MODIFY  hasTalents/hasTraits flags; availableAptitudes; addAptitude/removeAptitude actions
scripts/sheets/item-sheet.mjs     MODIFY  availableAptitudes (talent); addAptitude/removeAptitude actions
templates/actor/actor-sheet.hbs   MODIFY  Combat fav-section gating; aptitude editor (chips + dropdown/Add)
templates/item/item-sheet.hbs     MODIFY  talent aptitude editor (chips + dropdown/Add)
styles/better-dh2e.css            MODIFY  aptitude chip/add styles
```

---

### Task 1: Apply Damage button — per-viewer ownership

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1: Render the button whenever there's a target** (drop the `isGM` gate so the HTML always contains it when applicable). In `rollDamage`'s `cardData`:
```javascript
    targetName: f.targetName, canApply: !!f.targetUuid,
```
and in `rollOverheatDamage`'s `cardData` (the self-damage card, target = attacker, always present):
```javascript
    targetName: attacker.name, canApply: true,
```

- [ ] **Step 2: Hide it per-client for non-owners.** In `bindCardButtons` (runs on the `renderChatMessageHTML` hook per client), before the `querySelectorAll("[data-bdh]")` loop, remove the Apply Damage button when the current user doesn't own the target:
```javascript
export function bindCardButtons(message, html) {
  const flags = message.flags?.[NS];
  if (!flags) return;
  // Apply Damage is only usable by an owner of the target (GM owns everything) — hide it for everyone else.
  const applyBtn = html.querySelector('[data-bdh="applyDamage"]');
  if (applyBtn) {
    const target = flags.targetUuid ? fromUuidSync(flags.targetUuid) : null;
    if (!target?.isOwner) applyBtn.remove();
  }
  html.querySelectorAll("[data-bdh]").forEach((btn) => { /* ...unchanged... */ });
}
```
(`fromUuidSync` resolves world actor/token UUIDs synchronously; `actor.isOwner` is true for the GM on every actor and for a player only on their owned actor.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "fix: Apply Damage button shows per-viewer by target ownership (GM always; target owner only)"
```

---

### Task 2: Called-Shot Location shown only for Called Shot

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** In `rollAttack`'s `dialogContent`, give the Called-Shot Location row an id and (visually) start hidden — wrap it:
```javascript
    <div class="form-group" id="bdh-cs-row" style="display:none"><label>Called-Shot Location</label><select name="calledShotLocation">${locOpts}</select></div>
```
(Replace the existing Called-Shot Location `<div class="form-group">…`.)

- [ ] **Step 2:** Add a `render` callback to the attack `DialogV2.prompt({ ... })` that toggles the row based on the Attack Type select:
```javascript
    render: (event, dialog) => {
      const root = dialog.element;
      const sel = root.querySelector('[name="attackType"]');
      const row = root.querySelector('#bdh-cs-row');
      if (!sel || !row) return;
      const toggle = () => { row.style.display = sel.value === "calledShot" ? "" : "none"; };
      sel.addEventListener("change", toggle);
      toggle();
    },
```
(Add this as a sibling option to `window`/`content`/`ok`/`rejectClose`. The toggle runs on render — default Attack Type is Standard, so the row starts hidden; selecting Called Shot reveals it. If `DialogV2.prompt` doesn't surface a `render` option in this Foundry build, attach the same listener via the dialog instance's render lifecycle — but `render` is the supported config callback.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: attack dialog reveals Called-Shot Location only when Called Shot is selected"
```

---

### Task 3: Combat favourites — Talents/Traits sections only if any exist

**Files:** `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Context flags.** In `_prepareContext`, near the `favTalents`/`favTraits` build, add:
```javascript
    context.hasTalents = items.some((i) => i.type === "talent");
    context.hasTraits = items.some((i) => i.type === "trait");
```

- [ ] **Step 2: Template.** In the Combat sub-tab, gate the Favourite Talents + Favourite Traits sections (the `★ Favourite Talents` block at ~line 145-151 and `★ Favourite Traits` at ~152-158). Wrap each:
```handlebars
            {{#if hasTalents}}
            <div class="bdh-section-head">★ Favourite Talents</div>
            {{#each favTalents as |t|}} … {{/each}}
            {{#unless favTalents.length}}<div class="bdh-empty">Star talents on the Abilities tab.</div>{{/unless}}
            {{/if}}
            {{#if hasTraits}}
            <div class="bdh-section-head">★ Favourite Traits</div>
            {{#each favTraits as |t|}} … {{/each}}
            {{#unless favTraits.length}}<div class="bdh-empty">Star traits on the Abilities tab.</div>{{/unless}}
            {{/if}}
```
(Keep the inner markup exactly as-is; only wrap each section in `{{#if hasTalents}}` / `{{#if hasTraits}}`. Leave the Favourite Skills section unchanged — it always shows.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs
git commit -m "feat: Combat tab hides Favourite Talents/Traits sections when the character has none"
```

---

### Task 4: Aptitudes — dropdown + Add + ✕ (actor Custom-only, talent)

**Files:** `scripts/sheets/actor-sheet.mjs`, `scripts/sheets/item-sheet.mjs`, `templates/actor/actor-sheet.hbs`, `templates/item/item-sheet.hbs`, `styles/better-dh2e.css`

- [ ] **Step 1: Actor context.** In `_prepareContext`, add the not-yet-taken aptitudes:
```javascript
    context.availableAptitudes = BDH.aptitudes.filter((a) => !(this.document.system.aptitudes ?? []).includes(a));
```

- [ ] **Step 2: Actor actions.** In actor-sheet.mjs add (near the other buy/edit actions):
```javascript
  /** Action: add the picked aptitude to the actor (Custom mode). */
  static async #onAddAptitude(event, target) {
    const pick = target.closest(".bdh-apt-add")?.querySelector(".bdh-apt-pick")?.value;
    if (!pick) return;
    const list = this.actor.system.aptitudes ?? [];
    if (list.includes(pick)) return;
    await this.actor.update({ "system.aptitudes": [...list, pick] });
  }
  /** Action: remove an aptitude from the actor. */
  static async #onRemoveAptitude(event, target) {
    const apt = target.dataset.aptitude;
    await this.actor.update({ "system.aptitudes": (this.actor.system.aptitudes ?? []).filter((a) => a !== apt) });
  }
```
Register in `DEFAULT_OPTIONS.actions`: `addAptitude: DarkHeresyActorSheet.#onAddAptitude, removeAptitude: DarkHeresyActorSheet.#onRemoveAptitude`.

- [ ] **Step 3: Actor template.** Replace the aptitudes `<select multiple …>` (Advancement tab, ~line 408-409) with:
```handlebars
      <div class="bdh-section-head">Aptitudes <span class="bdh-hint2">the character's fixed aptitudes</span></div>
      <div class="bdh-apt-list">
        {{#each system.aptitudes as |a|}}<span class="bdh-apt-chip">{{a}}{{#if @root.isCustom}} <a data-action="removeAptitude" data-aptitude="{{a}}" title="Remove">✕</a>{{/if}}</span>{{/each}}
        {{#unless system.aptitudes.length}}<span class="bdh-empty">None.</span>{{/unless}}
      </div>
      {{#if isCustom}}
        <div class="bdh-apt-add">
          <select class="bdh-apt-pick">{{#each availableAptitudes}}<option value="{{this}}">{{this}}</option>{{/each}}</select>
          <button type="button" data-action="addAptitude">Add</button>
        </div>
      {{/if}}
```
(Note `@root.isCustom` inside the `{{#each}}`, per the project's Handlebars gotcha.)

- [ ] **Step 4: Talent context + actions.** In item-sheet.mjs, in (or after) the `context.isTalent` setup, add:
```javascript
    if (context.isTalent) {
      context.availableAptitudes = BDH.aptitudes.filter((a) => !(system.aptitudes ?? []).includes(a));
    }
```
Add the actions:
```javascript
  static async #onAddAptitude(event, target) {
    const pick = target.closest(".bdh-apt-add")?.querySelector(".bdh-apt-pick")?.value;
    if (!pick) return;
    const list = this.document.system.aptitudes ?? [];
    if (list.includes(pick)) return;
    await this.document.update({ "system.aptitudes": [...list, pick] });
  }
  static async #onRemoveAptitude(event, target) {
    const apt = target.dataset.aptitude;
    await this.document.update({ "system.aptitudes": (this.document.system.aptitudes ?? []).filter((a) => a !== apt) });
  }
```
Register in the item sheet's `DEFAULT_OPTIONS.actions`: `addAptitude: DarkHeresyItemSheet.#onAddAptitude, removeAptitude: DarkHeresyItemSheet.#onRemoveAptitude`.

- [ ] **Step 5: Talent template.** Replace the talent aptitudes `<select multiple …>` (item-sheet.hbs ~line 13) with:
```handlebars
      <label>Aptitudes</label>
      <div class="bdh-apt-list">
        {{#each system.aptitudes as |a|}}<span class="bdh-apt-chip">{{a}} <a data-action="removeAptitude" data-aptitude="{{a}}" title="Remove">✕</a></span>{{/each}}
        {{#unless system.aptitudes.length}}<span class="bdh-empty">None.</span>{{/unless}}
      </div>
      <div class="bdh-apt-add"><select class="bdh-apt-pick">{{#each availableAptitudes}}<option value="{{this}}">{{this}}</option>{{/each}}</select><button type="button" data-action="addAptitude">Add</button></div>
```

- [ ] **Step 6: Styles.** Append to `styles/better-dh2e.css`:
```css

/* Aptitude chips + add control (actor advancement + talent sheet) */
.better-dh2e .bdh-apt-list { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0; }
.better-dh2e .bdh-apt-chip { background:var(--bdh-panel); border:1px solid var(--bdh-brown); border-radius:10px; padding:1px 8px; font-size:12px; }
.better-dh2e .bdh-apt-chip a { color:var(--bdh-maroon); cursor:pointer; margin-left:4px; }
.better-dh2e .bdh-apt-add { display:flex; gap:6px; align-items:center; }
```

- [ ] **Step 7: Verify and commit.** `node --check scripts/sheets/actor-sheet.mjs scripts/sheets/item-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs scripts/sheets/item-sheet.mjs templates/actor/actor-sheet.hbs templates/item/item-sheet.hbs styles/better-dh2e.css
git commit -m "feat: aptitude editor — chips with ✕ + dropdown/Add (actor Custom-only, talent)"
```

---

### Task 5: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (dh2e sandbox; ideally test with a GM login + a player login):
- [ ] **Apply Damage (bug):** as GM, attack/target an NPC and a PC → **Apply Damage shows for the GM** in both cases. As a player whose character is targeted by the GM → the player **sees** Apply Damage; a player whose character is *not* the target **does not see** it (and the GM still does). A player rolling damage at an NPC → GM sees Apply, the rolling player doesn't.
- [ ] **Called-Shot Location:** the attack dialog shows the location row **only** when Attack Type = Called Shot (hidden for Standard/etc.); switching back hides it.
- [ ] **Combat favourites:** a character with no talents shows **no** "Favourite Talents" section (same for traits); a character with talents shows it (even with none starred yet). Skills section always shows.
- [ ] **Aptitudes:** on a character in **Custom**, aptitudes show as chips with ✕, plus a dropdown (only unused aptitudes) + Add; adding/removing works and updates buy costs. In Simple/Play, chips are read-only (no ✕/Add). On a **talent** item sheet, the same chip + dropdown/Add editor works.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** Apply-Damage ownership (Task 1); Called-Shot conditional (Task 2); Combat fav gating (Task 3); aptitude editor (Task 4). ✓

**Deferred (declared):** the separate item.

**Placeholder scan:** complete; checklist concrete (GM vs player visibility; no-talents hides section; Custom-only aptitudes).

**Type/name consistency:** Task 1 — `canApply` becomes `!!f.targetUuid` (render) and `bindCardButtons` removes the button per-client via `fromUuidSync(targetUuid)?.isOwner`. Task 2 — the dialog `render` callback toggles `#bdh-cs-row` off `name="attackType"`. Task 3 — `hasTalents`/`hasTraits` gate the two fav sections; skills untouched. Task 4 — actor + item each get `availableAptitudes` (BDH.aptitudes minus current) + `addAptitude`/`removeAptitude` actions operating on `system.aptitudes`; actor editor gated by `isCustom` (chips read-only otherwise, with `@root.isCustom` inside the `{{#each}}`); both registered in their sheets' `actions`. CSS adds the chip/add styling.
