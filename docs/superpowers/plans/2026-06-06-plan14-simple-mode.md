# Better DH2e — Plan 14: Simple Advancement Mode (buying + log)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Simple advancement mode**: priced buy affordances overlaid on the sheet (characteristics: dots + "+ cost"; skills: "+ cost"; specialist skills: add/advance specialties with cost; talents: a "Buy" with cost + a tier/2-aptitudes guard), each charging **Free XP** and appending to an always-visible **purchase log** on the Advancement tab.

**Architecture:** XP cost tables live in config, keyed by aptitude-match count (0/1/2). Pure, tested helpers price each advance (matches × level). The sheet augments its characteristic/skill/talent view-models with the next cost when in Simple mode, and new buy actions apply the advance + `spent += cost` + append a log entry, all in one `actor.update`. The log is append-only here; **refund is Plan 15**.

**Tech Stack:** Foundry v13 (ApplicationV2 actions, `actor.update`, `item.update`), Vitest, Handlebars.

**Scope:** the cost math, the Simple-mode buy buttons (characteristics/skills/specialties/talents), Free-XP gating, talent validation, and the append-only log display.

**Out of scope:** **refund/remove** (Plan 15); the attack pipeline. Cost tables are the confirmed DH2e values.

**Reference:** spec §6. Costs (by 2/1/0 aptitude matches): characteristic (5 tiers) 100/250/500/750/1250 · 250/500/750/1000/1500 · 500/750/1000/1500/2500; skill (Known/Trained/Exp/Vet) 100/200/300/400 · 200/400/600/800 · 300/600/900/1200; talent (Tier 1/2/3) 200/300/400 · 300/450/600 · 600/900/1200. Aptitude match = how many of an advance's 2 aptitudes the character has (`system.aptitudes`). Influence is not advanced. A specialty's *creation* is its Known purchase (skill level 0). **Template rule:** top-level flags inside `{{#each}}` use `@root.` (memory `handlebars-root-in-each-loops`).

---

## File Structure

```
scripts/config.mjs                       MODIFY  BDH.xpCosts tables
scripts/data/actor/base-actor-model.mjs  MODIFY  advancementLog array
scripts/data/item/talent-model.mjs       MODIFY  purchased flag
scripts/helpers/advancement-costs.mjs    NEW     pure cost helpers
test/advancement-costs.test.mjs          NEW     Vitest
scripts/sheets/actor-sheet.mjs           MODIFY  cost augmentation; buy actions; log context
templates/actor/actor-sheet.hbs          MODIFY  Simple buy affordances + Advancement log
styles/better-dh2e.css                   MODIFY  buy buttons, dots, log
```

---

### Task 1: Config + model fields

**Files:** `scripts/config.mjs`, `scripts/data/actor/base-actor-model.mjs`, `scripts/data/item/talent-model.mjs`

- [ ] **Step 1:** In `scripts/config.mjs`, after `BDH.specialtyRanks`, add the cost tables:
```javascript
/** XP cost tables, keyed by aptitude-match count (0/1/2), arrays indexed by advance level. */
BDH.xpCosts = {
  characteristic: { 2: [100, 250, 500, 750, 1250], 1: [250, 500, 750, 1000, 1500], 0: [500, 750, 1000, 1500, 2500] },
  skill:          { 2: [100, 200, 300, 400],        1: [200, 400, 600, 800],         0: [300, 600, 900, 1200] },
  talent:         { 2: [200, 300, 400],             1: [300, 450, 600],              0: [600, 900, 1200] }
};
```

- [ ] **Step 2:** In `base-actor-model.mjs` `defineSchema()`, add (alongside `experience`):
```javascript
      advancementLog: new fields.ArrayField(new fields.SchemaField({
        type:   new fields.StringField({ required: true, initial: "" }),
        label:  new fields.StringField({ required: true, initial: "" }),
        detail: new fields.StringField({ required: true, initial: "" }),
        cost:   new fields.NumberField({ required: true, integer: true, initial: 0 })
      })),
```

- [ ] **Step 3:** In `talent-model.mjs` `defineSchema()`, add to the returned object (after `favourite`):
```javascript
      purchased:     new fields.BooleanField({ required: true, initial: false })
```
(add a comma after the previous `favourite` line).

- [ ] **Step 4: Verify and commit.** Run: `node --check scripts/config.mjs && node --check scripts/data/actor/base-actor-model.mjs && node --check scripts/data/item/talent-model.mjs && npm test` — Expected: pass.

```bash
git add scripts/config.mjs scripts/data/actor/base-actor-model.mjs scripts/data/item/talent-model.mjs
git commit -m "feat: XP cost tables, advancement log field, talent purchased flag"
```

---

### Task 2: Pure cost helpers (TDD)

**Files:** Create `test/advancement-costs.test.mjs`, `scripts/helpers/advancement-costs.mjs`

- [ ] **Step 1: Failing test** `test/advancement-costs.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { aptitudeMatches, characteristicCost, skillCost, talentCost, RANK_ORDER } from "../scripts/helpers/advancement-costs.mjs";

describe("aptitudeMatches", () => {
  it("counts how many advance aptitudes the character has (0/1/2)", () => {
    expect(aptitudeMatches(["Agility", "Defence"], ["Agility", "Defence", "Toughness"])).toBe(2);
    expect(aptitudeMatches(["Agility", "Defence"], ["Agility"])).toBe(1);
    expect(aptitudeMatches(["Agility", "Defence"], ["Strength"])).toBe(0);
  });
});
describe("characteristicCost", () => {
  it("prices the tier being bought by match count; null when maxed", () => {
    expect(characteristicCost(2, 0)).toBe(100);
    expect(characteristicCost(2, 4)).toBe(1250);
    expect(characteristicCost(0, 0)).toBe(500);
    expect(characteristicCost(2, 5)).toBeNull();
  });
});
describe("skillCost", () => {
  it("prices by current rank (untrained->known=level 0); null at veteran", () => {
    expect(skillCost(2, "untrained")).toBe(100);
    expect(skillCost(2, "known")).toBe(200);
    expect(skillCost(1, "trained")).toBe(600);
    expect(skillCost(2, "veteran")).toBeNull();
  });
});
describe("talentCost", () => {
  it("prices by tier and match count", () => {
    expect(talentCost(2, 1)).toBe(200);
    expect(talentCost(0, 3)).toBe(1200);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/advancement-costs.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/advancement-costs.mjs`:
```javascript
// scripts/helpers/advancement-costs.mjs — PURE (config import only).
import { BDH } from "../config.mjs";

export const RANK_ORDER = ["untrained", "known", "trained", "experienced", "veteran"];

/** How many of an advance's aptitudes the character has (0/1/2). */
export function aptitudeMatches(advanceAptitudes, charAptitudes) {
  const set = new Set(charAptitudes);
  return advanceAptitudes.filter((a) => set.has(a)).length;
}

/** Cost to buy the next characteristic advance; advancesOwned = tiers already bought (0..4). Null if maxed. */
export function characteristicCost(matches, advancesOwned) {
  const table = BDH.xpCosts.characteristic[matches];
  return advancesOwned >= 0 && advancesOwned < table.length ? table[advancesOwned] : null;
}

/** Cost to advance a skill from its current rank to the next; null if already veteran. */
export function skillCost(matches, currentRank) {
  const level = RANK_ORDER.indexOf(currentRank);
  const table = BDH.xpCosts.skill[matches];
  return level >= 0 && level < table.length ? table[level] : null;
}

/** Cost of a talent by tier (1..3) and match count. */
export function talentCost(matches, tier) {
  const table = BDH.xpCosts.talent[matches];
  return tier >= 1 && tier <= table.length ? table[tier - 1] : null;
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/advancement-costs.test.mjs`.

- [ ] **Step 5: Commit**
```bash
git add test/advancement-costs.test.mjs scripts/helpers/advancement-costs.mjs
git commit -m "feat: pure advancement cost helpers with unit tests"
```

---

### Task 3: Sheet — cost augmentation + log context

**Files:** `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Import the helpers** after the existing imports:
```javascript
import { aptitudeMatches, characteristicCost, skillCost, talentCost, RANK_ORDER } from "../helpers/advancement-costs.mjs";
```

- [ ] **Step 2: Augment view-models + log context.** In `_prepareContext`, AFTER `context.characteristics`, `context.skills`, and `context.talents` are all built, and after `context.isSimple` is set, add:
```javascript
    // Simple-mode cost data (cheap; the template reads it only when isSimple).
    const apts = sys.aptitudes;
    context.characteristics = context.characteristics.map((c) => {
      if (c.key === "influence") return { ...c, noAdvance: true };
      const owned = (sys.characteristics[c.key].advance ?? 0) / 5;
      const matches = aptitudeMatches(BDH.characteristics[c.key].aptitudes, apts);
      return { ...c, owned, advDots: [0, 1, 2, 3, 4].map((i) => i < owned), nextCost: characteristicCost(matches, owned) };
    });
    context.skills = context.skills.map((s) => {
      const matches = aptitudeMatches(BDH.skills[s.key].aptitudes, apts);
      if (s.specialist) {
        return { ...s, addCost: skillCost(matches, "untrained"), specialties: s.specialties.map((sp) => ({ ...sp, nextCost: skillCost(matches, sp.rank) })) };
      }
      return { ...s, nextCost: skillCost(matches, s.rank) };
    });
    context.talents = context.talents.map((t) => {
      const tsys = items.get(t.id).system;
      const valid = (tsys.aptitudes?.length === 2) && tsys.tier >= 1;
      const cost = valid ? talentCost(aptitudeMatches(tsys.aptitudes, apts), tsys.tier) : null;
      return { ...t, cost, valid, purchased: tsys.purchased ?? false };
    });
    context.advancementLog = sys.advancementLog;
```
(`items` is the `this.document.items` local; `context.talents` rows carry `id`; talent `system.aptitudes`/`tier`/`purchased` exist after Task 1.)

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: Simple-mode cost augmentation (characteristics/skills/talents) + log context"
```

---

### Task 4: Sheet — buy actions

**Files:** `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add a small free-XP helper + the buy handlers** (place after the existing `#onSetMode`/advancement handlers). All guard on Simple mode implicitly (only the Simple template exposes them):

```javascript
  /** Append a log entry + charge spent in one update payload; returns false if too expensive. */
  #chargeXP(extraUpdates, entry) {
    const sys = this.actor.system;
    const free = sys.experience.total - sys.experience.spent;
    if (entry.cost > free) { ui.notifications.warn(`Not enough XP: needs ${entry.cost}, ${free} free.`); return null; }
    return {
      ...extraUpdates,
      "system.experience.spent": sys.experience.spent + entry.cost,
      "system.advancementLog": [...sys.advancementLog, entry]
    };
  }

  /** Action: buy the next +5 characteristic advance (Simple). */
  static async #onBuyCharacteristic(event, target) {
    const key = target.dataset.characteristic;
    const owned = (this.actor.system.characteristics[key].advance ?? 0) / 5;
    const matches = aptitudeMatches(CONFIG.BDH.characteristics[key].aptitudes, this.actor.system.aptitudes);
    const cost = characteristicCost(matches, owned);
    if (cost == null) return;
    const label = game.i18n.localize(CONFIG.BDH.characteristics[key].label);
    const upd = this.#chargeXP({ [`system.characteristics.${key}.advance`]: (owned + 1) * 5 },
      { type: "characteristic", label, detail: `+5 (advance ${owned + 1})`, cost });
    if (upd) await this.actor.update(upd);
  }

  /** Action: advance a standard skill to the next rank (Simple). */
  static async #onBuySkill(event, target) {
    const key = target.dataset.skill;
    const rank = this.actor.system.skills[key].rank;
    const next = RANK_ORDER[RANK_ORDER.indexOf(rank) + 1];
    const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
    const cost = skillCost(matches, rank);
    if (cost == null || !next) return;
    const label = game.i18n.localize(CONFIG.BDH.skills[key].label);
    const upd = this.#chargeXP({ [`system.skills.${key}.rank`]: next },
      { type: "skill", label, detail: `→ ${next}`, cost });
    if (upd) await this.actor.update(upd);
  }

  /** Action: advance an existing specialty to the next rank (Simple). */
  static async #onBuySpecialty(event, target) {
    const key = target.dataset.skill;
    const idx = Number(target.dataset.specialty);
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    const sp = list[idx];
    const next = RANK_ORDER[RANK_ORDER.indexOf(sp.rank) + 1];
    const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
    const cost = skillCost(matches, sp.rank);
    if (cost == null || !next) return;
    sp.rank = next;
    const label = `${game.i18n.localize(CONFIG.BDH.skills[key].label)} (${sp.name})`;
    const upd = this.#chargeXP({ [`system.skills.${key}.specialties`]: list },
      { type: "specialty", label, detail: `→ ${next}`, cost });
    if (upd) await this.actor.update(upd);
  }

  /** Action: buy a talent (Simple) — requires tier + exactly 2 aptitudes; charge once. */
  static async #onBuyTalent(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (!item || item.system.purchased) return;
    if ((item.system.aptitudes?.length ?? 0) !== 2 || !(item.system.tier >= 1)) {
      ui.notifications.warn("Set a tier and exactly two aptitudes on the talent before buying.");
      return;
    }
    const cost = talentCost(aptitudeMatches(item.system.aptitudes, this.actor.system.aptitudes), item.system.tier);
    const upd = this.#chargeXP({}, { type: "talent", label: item.name, detail: `Tier ${item.system.tier}`, cost });
    if (!upd) return;
    await item.update({ "system.purchased": true });
    await this.actor.update(upd);
  }
```

- [ ] **Step 2: Make `#onAddSpecialty` charge in Simple mode.** Replace the existing `#onAddSpecialty` (Plan 13) with a mode-aware version:
```javascript
  /** Action: add a specialty (free in Custom; charges the Known cost in Simple). */
  static async #onAddSpecialty(event, target) {
    const key = target.dataset.skill;
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    list.push({ name: "New Specialty", rank: "known", favourite: false });
    if (this._advancementMode === "simple") {
      const matches = aptitudeMatches(CONFIG.BDH.skills[key].aptitudes, this.actor.system.aptitudes);
      const cost = skillCost(matches, "untrained");
      const upd = this.#chargeXP({ [`system.skills.${key}.specialties`]: list },
        { type: "specialty", label: `${game.i18n.localize(CONFIG.BDH.skills[key].label)} (new)`, detail: "→ Known", cost });
      if (upd) await this.actor.update(upd);
      return;
    }
    await this.actor.update({ [`system.skills.${key}.specialties`]: list });
  }
```

- [ ] **Step 3: Register the four buy actions** in `DEFAULT_OPTIONS.actions` (append, comma the previous):
```javascript
      buyCharacteristic: DarkHeresyActorSheet.#onBuyCharacteristic,
      buySkill: DarkHeresyActorSheet.#onBuySkill,
      buySpecialty: DarkHeresyActorSheet.#onBuySpecialty,
      buyTalent: DarkHeresyActorSheet.#onBuyTalent
```

- [ ] **Step 4: Verify and commit.** Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: Simple-mode buy actions (characteristic/skill/specialty/talent) charging Free XP + logging"
```

---

### Task 5: Templates — Simple buy affordances + Advancement log

**Files:** `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Characteristic buy row.** In the characteristic loop, after the `{{#if @root.isCustom}}…{{else}}…{{/if}}` that renders the box (i.e. just before the closing `</div>` of the `.char` element), add:
```handlebars
          {{#if @root.isSimple}}{{#unless c.noAdvance}}
            <div class="char-buy">
              <span class="adv-dots">{{#each c.advDots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
              {{#if c.nextCost}}<button type="button" class="bdh-buy" data-action="buyCharacteristic" data-characteristic="{{c.key}}">＋ {{c.nextCost}}</button>{{else}}<span class="bdh-maxed">max</span>{{/if}}
            </div>
          {{/unless}}{{/if}}
```

- [ ] **Step 2: Standard skill buy button.** In the standard skill row (the `{{else}}` branch), after the value `{{#if @root.isCustom}}…{{else}}…{{/if}}`, add (before the row's closing `</div>`):
```handlebars
              {{#if @root.isSimple}}{{#if s.nextCost}}<button type="button" class="bdh-buy" data-action="buySkill" data-skill="{{s.key}}">＋ {{s.nextCost}}</button>{{else}}<span class="bdh-maxed">max</span>{{/if}}{{/if}}
```

- [ ] **Step 3: Specialist group — Simple.** Two edits in the specialist branch:
  (a) The group head ＋ currently shows on `{{#if @root.isCustom}}`. Change it to show in either advancement mode, with the cost in Simple:
```handlebars
              <div class="skill-group-head"><span>{{localize s.label}}</span>{{#if @root.isCustom}}<button type="button" class="bdh-add" data-action="addSpecialty" data-skill="{{s.key}}" title="Add specialty">＋</button>{{/if}}{{#if @root.isSimple}}<button type="button" class="bdh-buy" data-action="addSpecialty" data-skill="{{s.key}}" title="Add specialty">＋ {{s.addCost}}</button>{{/if}}</div>
```
  (b) The specialty row currently branches `{{#if @root.isCustom}} name+rank+remove {{else}} name+dots+total {{/if}}`. Add a Simple arm so the play `{{else}}` only applies when NOT simple. Replace the specialty row's inner conditional with:
```handlebars
                  {{#if @root.isCustom}}
                    <input class="snm bdh-edit bdh-spec-input" type="text" data-skill="{{s.key}}" data-specialty="{{sp.index}}" data-field="name" value="{{sp.name}}" placeholder="Specialty"/>
                    <select class="sval bdh-edit bdh-spec-input" data-skill="{{s.key}}" data-specialty="{{sp.index}}" data-field="rank">{{selectOptions @root.specialtyRankChoices selected=sp.rank}}</select>
                    <a class="bdh-del" data-action="removeSpecialty" data-skill="{{s.key}}" data-specialty="{{sp.index}}" title="Remove">✖</a>
                  {{else if @root.isSimple}}
                    <input class="snm bdh-edit bdh-spec-input" type="text" data-skill="{{s.key}}" data-specialty="{{sp.index}}" data-field="name" value="{{sp.name}}" placeholder="Specialty"/>
                    <span class="tier">{{#each sp.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
                    <span class="sval">{{sp.total}}</span>
                    {{#if sp.nextCost}}<button type="button" class="bdh-buy" data-action="buySpecialty" data-skill="{{s.key}}" data-specialty="{{sp.index}}">＋ {{sp.nextCost}}</button>{{else}}<span class="bdh-maxed">max</span>{{/if}}
                  {{else}}
                    <span class="snm">{{sp.name}}</span>
                    <span class="tier">{{#each sp.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
                    <span class="sval">{{sp.total}}</span>
                  {{/if}}
```
  (Also: the specialty row's `data-action="rollSkill"` is currently gated `{{#unless @root.isCustom}}`. Change it to also gate off in Simple so the name input/buy work cleanly: `{{#unless @root.isCustom}}{{#unless @root.isSimple}}data-action="rollSkill"{{/unless}}{{/unless}}` — i.e. roll only in play mode.)

- [ ] **Step 4: Talent ＋ gating + Buy buttons.** In the Abilities **Talents** section: (a) gate the existing create ＋ to advancement mode — wrap the talent create button in `{{#if @root.isCustom}}…{{/if}}{{#if @root.isSimple}}…{{/if}}` (or `{{#if @root.advancementMode}}` if a truthy "none"/string check is awkward — use two ifs). Simplest: replace its `data-action="createItem" data-type="talent"` button so it only renders when `@root.isCustom` OR `@root.isSimple`. (b) In each talent row, when Simple, show the buy state. Add to the talent row (after the existing tier/desc, before delete):
```handlebars
            {{#if @root.isSimple}}
              {{#if t.purchased}}<span class="bdh-cost-done">{{t.cost}} xp ✓</span>
              {{else if t.valid}}<button type="button" class="bdh-buy" data-action="buyTalent">Buy {{t.cost}}</button>
              {{else}}<span class="bdh-warn">set tier + 2 aptitudes</span>{{/if}}
            {{/if}}
```
(The talent row already carries `data-item-id`; `#onBuyTalent` reads it via `closest`. Read the current Talents-section markup and place the create-＋ gate + the buy block to match its structure.)

- [ ] **Step 5: Advancement log.** In the Advancement tab `<section>` (after the aptitudes section), add:
```handlebars
    <div class="bdh-section">
      <div class="bdh-section-head">Advancement Log</div>
      {{#each advancementLog as |e|}}
        <div class="bdh-log-row"><span class="bdh-log-what">{{e.label}}</span><span class="bdh-log-detail">{{e.detail}}</span><span class="bdh-log-cost">{{e.cost}} xp</span></div>
      {{/each}}
      {{#unless advancementLog.length}}<div class="bdh-empty">No Simple-advancement purchases yet.</div>{{/unless}}
    </div>
```

- [ ] **Step 6: Commit**
```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Simple-mode buy affordances (characteristics/skills/specialties/talents) + Advancement log"
```

---

### Task 6: Styles

**Files:** `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append:**
```css

/* Simple advancement — buy affordances + log */
.better-dh2e .bdh-buy { background:#3d5a2a; color:var(--bdh-parch); border:none; border-radius:3px; font-size:11px; padding:1px 7px; cursor:pointer; white-space:nowrap; }
.better-dh2e .bdh-maxed { font-size:10px; color:var(--bdh-muted); text-transform:uppercase; }
.better-dh2e .bdh-warn { font-size:10px; color:var(--bdh-maroon); font-style:italic; }
.better-dh2e .bdh-cost-done { font-size:11px; color:#3d6a4a; }
.better-dh2e .char-buy { display:flex; align-items:center; justify-content:center; gap:6px; margin-top:3px; }
.better-dh2e .char-buy .adv-dots { display:inline-flex; gap:2px; }
.better-dh2e .char-buy .adv-dots i { width:6px; height:6px; border:1px solid var(--bdh-brown); border-radius:50%; display:inline-block; }
.better-dh2e .char-buy .adv-dots i.on { background:var(--bdh-maroon); border-color:var(--bdh-maroon); }
.better-dh2e .bdh-log-row { display:flex; align-items:center; gap:8px; padding:2px 10px; font-size:12px; border-bottom:1px solid #e2d2ac; }
.better-dh2e .bdh-log-detail { flex:1; color:var(--bdh-muted); font-size:11px; }
.better-dh2e .bdh-log-cost { font-weight:bold; color:var(--bdh-maroon); }
```

- [ ] **Step 2: Commit**
```bash
git add styles/better-dh2e.css
git commit -m "feat: Simple-advancement buy/log styles"
```

---

### Task 7: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (Daren Vholk; on the **Advancement** tab set **Total** to e.g. 5000 and pick a couple of **aptitudes**, e.g. Agility + Fieldcraft; press **Simple**):
- [ ] **Characteristics** (Stats): each (except **Influence**) shows 5 **dots** + a **＋ ‹cost›**; the cost reflects aptitude matches (a 2-aptitude characteristic is cheaper). Buy one → a dot fills, the value rises +5, **Free** drops by the cost, and a line appears in the **Advancement Log**. At 5 dots it shows **max**.
- [ ] **Skills**: each shows **＋ ‹cost›**; buy Dodge → rank steps up (Known→Trained…), Free drops, log line added; Veteran shows **max**.
- [ ] **Specialist skills**: the group head shows **＋ ‹addCost›**; pressing it adds a specialty at Known and charges; each specialty shows **＋ ‹cost›** to advance + an editable name. (Names persist; advancing logs.)
- [ ] **Talents** (Abilities): the create **＋** appears only in Custom/Simple. A talent with a tier + **2 aptitudes** shows **Buy ‹cost›** → buying charges, logs, and flips to **‹cost› xp ✓**; a talent missing aptitudes shows **set tier + 2 aptitudes** (no charge).
- [ ] **Gating**: buying something costing more than **Free** shows a warning and does nothing.
- [ ] Turn **Simple off** → all buy buttons disappear; play mode normal. The **log persists** and is visible on the Advancement tab in any mode.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** cost tables (Task 1) + pure helpers (Task 2, TDD); characteristics dots+price, skills price, specialist add/advance with cost, talents Buy+validation (Tasks 3–5); Free-XP gating via `#chargeXP` (Task 4); always-visible append-only log (Tasks 1/3/5). ✓

**Deferred (declared):** refund/remove (Plan 15); attack pipeline.

**Placeholder scan:** complete; checklist concrete (5000 XP, Agility+Fieldcraft, Dodge step-up, talent 2-aptitude gate).

**Type/name consistency:** `BDH.xpCosts`/`advancementLog`/talent `purchased` (Task 1) feed the helpers (Task 2) and sheet (Tasks 3/4). Buy actions `buyCharacteristic`/`buySkill`/`buySpecialty`/`buyTalent` match `DEFAULT_OPTIONS.actions` + template `data-action`; `addSpecialty` reused (mode-aware). `#chargeXP` centralises the Free-XP check + spent + log append. Influence excluded (`noAdvance`). Specialty creation = Known cost (`skillCost(matches,"untrained")`). Talent validity = exactly 2 aptitudes + tier≥1. **All top-level flags inside `{{#each}}` use `@root.`** (isSimple, isCustom, specialtyRankChoices). Specialty roll gated to play-only (off in Custom and Simple). Log read from `sys.advancementLog`. Costs displayed come from the same helpers the actions charge with (consistent).
