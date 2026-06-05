# Better DH2e — Plan 9: Favourite Traits & Skills (+ 3-per-category cap)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the favourite mechanic to **traits** and **skills** (same star), cap favourites at **3 per category** (talents / traits / skills), and surface favourite traits + skills on the Combat sub-tab — with favourite **skills clickable to roll** (reusing the skill dialog).

**Architecture:** Traits gain a `favourite` field (like talents); skills gain a per-skill `favourite` flag on the actor. The existing `toggleFavourite` action gains a 3-cap (per item type); a new `toggleSkillFavourite` action toggles `system.skills.<key>.favourite` with its own 3-cap. The Combat context adds favourite traits + skills; the Investigation skill rows and Abilities trait rows gain a star.

**Tech Stack:** Foundry v13 (ApplicationV2 `actions`, `item`/`actor.update`, `ui.notifications.warn`), Vitest, Handlebars.

**Scope of THIS plan:** trait/skill favourite fields; the cap; the toggles; Combat display of favourite traits + skills (skills roll on click).

**Out of scope:** the initiative dropdown + combat-tracker wiring (spec §13, future); Afflictions/Psychic/Advancement.

**Reference:** spec §6 (favourites). Cap = **3 per category**. Skill favourites live on the actor (`system.skills.<key>.favourite`); trait/talent favourites on the item (`system.favourite`). Reuses `rollSkill` for clickable favourite skills. Nested `actor.update({"system.skills.<key>.favourite": ...})` is a valid SchemaField path (not an array index).

---

## File Structure

```
scripts/data/item/trait-model.mjs        MODIFY  add `favourite`
scripts/data/actor/base-actor-model.mjs  MODIFY  add `favourite` per skill (skillsSchema)
scripts/helpers/sheet-data.mjs           MODIFY  buildSkills carries `favourite`
test/sheet-data.test.mjs                 MODIFY  assert favourite
scripts/sheets/actor-sheet.mjs           MODIFY  cap on toggleFavourite; toggleSkillFavourite; trait favourite + favTraits/favSkills context
templates/actor/actor-sheet.hbs          MODIFY  trait star; skill star; Combat fav traits + skills
styles/better-dh2e.css                   MODIFY  (minor) skill-row star spacing
```

---

### Task 1: Favourite fields on trait + skill

**Files:**
- Modify: `scripts/data/item/trait-model.mjs`
- Modify: `scripts/data/actor/base-actor-model.mjs`

- [ ] **Step 1:** Replace `scripts/data/item/trait-model.mjs` with (adds `favourite`):

```javascript
// scripts/data/item/trait-model.mjs
import { BaseItemModel } from "./base-item-model.mjs";

const fields = foundry.data.fields;

export class TraitModel extends BaseItemModel {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      favourite: new fields.BooleanField({ required: true, initial: false })
    };
  }
}
```

- [ ] **Step 2:** In `scripts/data/actor/base-actor-model.mjs`, in the `skillsSchema()` function, add a `favourite` field to each skill's `SchemaField`. Change:

```javascript
    schema[key] = new fields.SchemaField({
      rank: new fields.StringField({
        required: true,
        choices: Object.keys(BDH.skillRanks),
        initial: "untrained"
      })
    });
```
to:
```javascript
    schema[key] = new fields.SchemaField({
      rank: new fields.StringField({
        required: true,
        choices: Object.keys(BDH.skillRanks),
        initial: "untrained"
      }),
      favourite: new fields.BooleanField({ required: true, initial: false })
    });
```

- [ ] **Step 3: Syntax-check and commit**

Run: `node --check scripts/data/item/trait-model.mjs && node --check scripts/data/actor/base-actor-model.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/data/item/trait-model.mjs scripts/data/actor/base-actor-model.mjs
git commit -m "feat: favourite field on traits and per-skill"
```

---

### Task 2: buildSkills carries `favourite` (TDD)

**Files:**
- Modify: `test/sheet-data.test.mjs`
- Modify: `scripts/helpers/sheet-data.mjs`

- [ ] **Step 1: Update the test** — in `test/sheet-data.test.mjs`, in the `skillStub()` helper add a favourite to one skill, and add an assertion. Change the `skillStub` to set `o.parry = { rank: "trained", total: 60, favourite: true };` (add this line alongside the existing `o.dodge`/`o.awareness` overrides), and add this test inside the `describe("buildSkills", ...)` block:

```javascript
  it("carries the favourite flag", () => {
    const list = buildSkills(skillStub());
    expect(list.find((s) => s.key === "parry").favourite).toBe(true);
    expect(list.find((s) => s.key === "dodge").favourite).toBe(false);
  });
```

- [ ] **Step 2: Run — verify FAIL** (favourite undefined). `npx vitest run test/sheet-data.test.mjs` → the new test FAILS.

- [ ] **Step 3: Implement** — in `scripts/helpers/sheet-data.mjs`, in `buildSkills`, add `favourite` to the returned object. Change the returned object to include:

```javascript
        favourite: s.favourite ?? false,
```
(add it alongside the existing `key`, `label`, `rank`, `tier`, `dots`, `trained`, `total` properties).

- [ ] **Step 4: Run — verify PASS.** `npx vitest run test/sheet-data.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add test/sheet-data.test.mjs scripts/helpers/sheet-data.mjs
git commit -m "feat: buildSkills carries the favourite flag (TDD)"
```

---

### Task 3: Actor sheet — cap, skill-favourite action, context

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add the 3-cap to `#onToggleFavourite`.** Replace the existing handler:

```javascript
  /** Action: toggle a talent's favourite flag. */
  static async #onToggleFavourite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item) await item.update({ "system.favourite": !item.system.favourite });
  }
```
with:
```javascript
  /** Action: toggle a talent/trait favourite (max 3 of each type). */
  static async #onToggleFavourite(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item) return;
    const next = !item.system.favourite;
    if (next && this.actor.items.filter((i) => i.type === item.type && i.system.favourite).length >= 3) {
      ui.notifications.warn(`You can favourite at most 3 ${item.type}s.`);
      return;
    }
    await item.update({ "system.favourite": next });
  }
```

- [ ] **Step 2: Add a skill-favourite handler** right after `#onToggleFavourite`:

```javascript
  /** Action: toggle a skill favourite (max 3). */
  static async #onToggleSkillFavourite(event, target) {
    const key = target.closest("[data-skill]")?.dataset.skill;
    if (!key) return;
    const skills = this.actor.system.skills;
    const next = !skills[key].favourite;
    if (next && Object.values(skills).filter((s) => s.favourite).length >= 3) {
      ui.notifications.warn("You can favourite at most 3 skills.");
      return;
    }
    await this.actor.update({ [`system.skills.${key}.favourite`]: next });
  }
```

- [ ] **Step 3: Register `toggleSkillFavourite`** in `DEFAULT_OPTIONS.actions` (after `toggleFavourite: ...` — add a comma):

```javascript
      toggleSkillFavourite: DarkHeresyActorSheet.#onToggleSkillFavourite
```

- [ ] **Step 4: Trait favourite in context.** In `_prepareContext`, change the `context.traits` mapping to include `favourite`:

```javascript
    context.traits = items.filter((i) => i.type === "trait").map((t) => ({
      id: t.id, name: t.name, desc: firstLine(t.system.description), favourite: t.system.favourite
    }));
```

- [ ] **Step 5: Favourite traits + skills in the Combat context.** In `_prepareContext`, right after the existing `context.favTalents = ...` line, add:

```javascript
    context.favTraits = items.filter((i) => i.type === "trait" && i.system.favourite)
      .map((t) => ({ id: t.id, name: t.name, desc: firstLine(t.system.description) }));
    context.favSkills = Object.entries(sys.skills).filter(([, s]) => s.favourite)
      .map(([key, s]) => ({ key, label: BDH.skills[key].label, total: s.total }));
```
(`sys` is the `this.document.system` local already defined in the Combat context block from Plan 8.)

- [ ] **Step 6: Syntax-check and run tests**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: 3-per-category favourite cap; skill favourite toggle; favourite traits/skills context"
```

---

### Task 4: Templates — trait/skill stars + Combat favourites

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Add a star to Abilities trait rows.** Change the trait row from:

```handlebars
        <div class="bdh-item-row" data-item-id="{{tr.id}}">
          <span class="bdh-name" data-action="editItem">{{tr.name}}</span>
          <span class="bdh-desc-line">{{tr.desc}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
```
to:
```handlebars
        <div class="bdh-item-row" data-item-id="{{tr.id}}">
          <a class="bdh-fav {{#if tr.favourite}}on{{/if}}" data-action="toggleFavourite" title="Favourite">★</a>
          <span class="bdh-name" data-action="editItem">{{tr.name}}</span>
          <span class="bdh-desc-line">{{tr.desc}}</span>
          <a class="bdh-del" data-action="deleteItem" title="Delete">✖</a>
        </div>
```

- [ ] **Step 2: Add a star to Investigation skill rows.** Change the skill row from:

```handlebars
          <div class="skill {{#unless s.trained}}untrained{{/unless}}" data-action="rollSkill" data-skill="{{s.key}}">
            <span class="snm">{{localize s.label}}</span>
            <span class="tier">{{#each s.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
            <span class="sval">{{s.total}}</span>
          </div>
```
to:
```handlebars
          <div class="skill {{#unless s.trained}}untrained{{/unless}}" data-action="rollSkill" data-skill="{{s.key}}">
            <a class="bdh-fav {{#if s.favourite}}on{{/if}}" data-action="toggleSkillFavourite" title="Favourite">★</a>
            <span class="snm">{{localize s.label}}</span>
            <span class="tier">{{#each s.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
            <span class="sval">{{s.total}}</span>
          </div>
```
(The star's `data-action="toggleSkillFavourite"` is inner, so clicking the star favourites; clicking elsewhere on the row still rolls the skill.)

- [ ] **Step 3: Add favourite traits + skills to the Combat sub-tab.** Right AFTER the existing "★ Favourite Talents" `<div class="bdh-section">...</div>` block (inside the first `bdh-combat-col`), add:

```handlebars
          <div class="bdh-section">
            <div class="bdh-section-head">★ Favourite Traits</div>
            {{#each favTraits as |t|}}
              <div class="bdh-item-row" data-item-id="{{t.id}}"><span class="bdh-name" data-action="editItem">{{t.name}}</span><span class="bdh-desc-line">{{t.desc}}</span></div>
            {{/each}}
            {{#unless favTraits.length}}<div class="bdh-empty">Star traits on the Abilities tab.</div>{{/unless}}
          </div>
          <div class="bdh-section">
            <div class="bdh-section-head">★ Favourite Skills</div>
            {{#each favSkills as |s|}}
              <div class="bdh-item-row" data-skill="{{s.key}}">
                <span class="bdh-name" data-action="rollSkill">{{localize s.label}}</span>
                <span class="bdh-desc-line"></span>
                <span class="bdh-craft">{{s.total}}</span>
              </div>
            {{/each}}
            {{#unless favSkills.length}}<div class="bdh-empty">Star skills on the Investigation tab.</div>{{/unless}}
          </div>
```

- [ ] **Step 4: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: trait/skill favourite stars; favourite traits & skills on Combat (skills roll on click)"
```

---

### Task 5: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append** (small spacing so the star sits nicely in the skill row):

```css

/* Favourite star inside the Investigation skill rows */
.better-dh2e .skill .bdh-fav { flex:0 0 auto; font-size:11px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: favourite-star spacing in skill rows"
```

---

### Task 6: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)"):
- [ ] **Abilities tab** → trait rows now have a **★**; star a trait → it turns gold and shows under **★ Favourite Traits** on Combat.
- [ ] **Stats → Investigation** → each skill row has a **★**; star a skill → it appears under **★ Favourite Skills** on Combat; **clicking the skill name there opens the roll dialog** (and clicking the star on Investigation toggles favourite without rolling).
- [ ] **Cap**: favourite a 4th talent (or trait, or skill) → a warning toast appears and it is NOT favourited (max 3 each).
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§6 favourites):**
- Favourite traits + skills (same star) → Tasks 1/3/4. ✓
- 3-per-category cap → Task 3 (`#onToggleFavourite` + `#onToggleSkillFavourite`). ✓
- Favourite skills clickable to roll on Combat → Task 4 (`rollSkill` on the name). ✓

**Deferred (declared):** initiative dropdown + combat-tracker (spec §13); Afflictions/Psychic/Advancement.

**Placeholder scan:** complete; checklist uses concrete behaviour (4th favourite warns).

**Type/name consistency:** `toggleSkillFavourite` matches `DEFAULT_OPTIONS.actions`, the handler, and the template `data-action`; the nested skill-row `data-action="toggleSkillFavourite"` is inner to the row's `data-action="rollSkill"`, so `closest` resolves the star first. `buildSkills` now returns `favourite`, consumed by the Investigation star. `system.favourite` exists on talent (Plan 4) and now trait (Task 1); `system.skills.<key>.favourite` added in Task 1. Combat `favTraits`/`favSkills` match the template `{{#each}}`. `ui.notifications`/`BDH.skills`/`firstLine`/`sys` are available in scope.
