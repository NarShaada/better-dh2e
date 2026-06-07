# Better DH2e — Plan 28: Psy Rating + Psyker Class

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the psychic foundation — the **psyker class** (bound/unbound/daemonic) and **psy rating** advancement. Custom mode edits both freely; Simple mode buys psy-rating increases (200 × new level) but only once the character already has rating ≥ 1 (the first rating is Custom-only); psyker class is editable in Custom only and only when rating > 0.

**Architecture:** `psyRating` is an existing actor field; add `psykerClass`. A pure `psyRatingCost(newLevel)=200×newLevel` helper feeds a Simple-mode buy that reuses the existing `#chargeXP` + refundable advancement-log machinery (mirrors the characteristic/skill buys). The Psychic tab renders psy rating + class mode-aware (Custom edit / Simple buy / play read-only).

**Tech Stack:** Foundry v13/v14 DataModels + ApplicationV2, Vitest, Handlebars.

**Scope:** psyker class field + psy-rating buy/refund + the Psychic-tab UI for both. **Out of scope:** manifesting powers, phenomena/perils, power data model (later sub-projects); carrying old psy class on already-migrated worlds (deferred until full re-migration).

**Reference (confirmed):** psyker class ∈ {bound (default), unbound, daemonic}; only meaningful at PR>0; editable Custom-only. Psy rating: Custom = any value (incl. first 0→1); Simple = buy next for 200×(new level) only when PR≥1 (first level not buyable in Simple); play = read-only. Bought levels refundable newest-first.

Builds on the advancement system (Plans 12/14/15): `#chargeXP`, `advancementLog`, `#onRefund`, the per-tab Simple-buy pattern, `isCustom`/`isSimple` context.

---

## File Structure

```
scripts/config.mjs                       MODIFY  BDH.psykerClasses
scripts/data/actor/base-actor-model.mjs  MODIFY  add psykerClass field
scripts/helpers/advancement-costs.mjs    MODIFY  psyRatingCost
test/advancement-costs.test.mjs          MODIFY  psyRatingCost test
scripts/sheets/actor-sheet.mjs           MODIFY  Psychic context (class + PR buy); #onBuyPsyRating; register; refund case
templates/actor/actor-sheet.hbs          MODIFY  Psychic tab: mode-aware PR + psyker class
```

---

### Task 1: Config + actor field + cost helper (TDD)

**Files:** `scripts/config.mjs`, `scripts/data/actor/base-actor-model.mjs`; `test/advancement-costs.test.mjs`, `scripts/helpers/advancement-costs.mjs`.

- [ ] **Step 1: Config.** In `scripts/config.mjs`, add (near the other BDH lookups):
```javascript
BDH.psykerClasses = { bound: "Bound", unbound: "Unbound", daemonic: "Daemonic" };
```

- [ ] **Step 2: Actor field.** In `scripts/data/actor/base-actor-model.mjs` `defineSchema()`, add alongside `psyRating`:
```javascript
      psykerClass: new fields.StringField({ required: true, choices: Object.keys(BDH.psykerClasses), initial: "bound" }),
```

- [ ] **Step 3: Failing test.** In `test/advancement-costs.test.mjs`, add `psyRatingCost` to the import and append:
```javascript
describe("psyRatingCost", () => {
  it("is 200 × the new level", () => {
    expect(psyRatingCost(1)).toBe(200);
    expect(psyRatingCost(2)).toBe(400);
    expect(psyRatingCost(3)).toBe(600);
    expect(psyRatingCost(5)).toBe(1000);
  });
});
```

- [ ] **Step 4: Run — FAIL.** `npx vitest run test/advancement-costs.test.mjs`.

- [ ] **Step 5: Implement** in `scripts/helpers/advancement-costs.mjs`:
```javascript
/** XP cost to reach a given psy rating level (200 per level: 1st=200, 2nd=400, ...). */
export function psyRatingCost(newLevel) {
  return 200 * newLevel;
}
```

- [ ] **Step 6: Run — PASS.** `npx vitest run test/advancement-costs.test.mjs`, then `node --check scripts/config.mjs scripts/data/actor/base-actor-model.mjs && npm test`.

- [ ] **Step 7: Commit.**
```bash
git add scripts/config.mjs scripts/data/actor/base-actor-model.mjs scripts/helpers/advancement-costs.mjs test/advancement-costs.test.mjs
git commit -m "feat: psykerClass field + psykerClasses config + psyRatingCost helper (TDD)"
```

---

### Task 2: Psychic tab — class + psy-rating buy/refund

**Files:** `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Import** `psyRatingCost` (merge into the existing `advancement-costs.mjs` import in actor-sheet.mjs).

- [ ] **Step 2: Context.** In `_prepareContext`, where the Psychic data is built (near `context.psychicPowers`), add:
```javascript
    const pr = this.document.system.psyRating ?? 0;
    context.showPsyker = pr > 0;                                  // psyker class only meaningful at PR > 0
    context.psykerClassChoices = CONFIG.BDH.psykerClasses;
    context.psykerClassLabel = CONFIG.BDH.psykerClasses[this.document.system.psykerClass] ?? "—";
    context.canBuyPsyRating = context.isSimple && pr >= 1;        // first rating is Custom-only
    context.psyRatingNextCost = psyRatingCost(pr + 1);
```
(Reuse the existing `context.isCustom` / `context.isSimple`. `this.document.type === "npc"` already blocks Simple mode for NPCs from Plan-12 work — psy buys are Custom-edit for NPCs.)

- [ ] **Step 3: Template.** In `templates/actor/actor-sheet.hbs`, replace the Psychic tab's psy-rating bar (`<div class="bdh-psy-bar">…`) with a mode-aware version + a psyker-class row:
```handlebars
    <div class="bdh-psy-bar">
      <label>Psy Rating</label>
      {{#if isCustom}}
        <input type="number" name="system.psyRating" value="{{system.psyRating}}" min="0"/>
      {{else}}
        <span class="bdh-pr-val">{{system.psyRating}}</span>
        {{#if canBuyPsyRating}}<button type="button" class="bdh-buy" data-action="buyPsyRating">＋ {{psyRatingNextCost}}</button>{{/if}}
      {{/if}}
    </div>
    {{#if showPsyker}}
      <div class="bdh-psy-class">
        <label>Psyker Class</label>
        {{#if isCustom}}
          <select class="bdh-edit" name="system.psykerClass">{{selectOptions psykerClassChoices selected=system.psykerClass}}</select>
        {{else}}
          <span>{{psykerClassLabel}}</span>
        {{/if}}
      </div>
    {{/if}}
```
(The named inputs auto-save via `submitOnChange`. When PR goes 0→1 in Custom, the class row appears on the next render.)

- [ ] **Step 4: Buy handler.** In `actor-sheet.mjs`, add (next to `#onBuyCharacteristic`):
```javascript
  /** Action: buy the next psy rating (Simple) — 200 × new level; first rating is Custom-only. */
  static async #onBuyPsyRating(event, target) {
    const pr = this.actor.system.psyRating ?? 0;
    if (pr < 1) return;                       // can't buy the first rating in Simple
    const next = pr + 1;
    const cost = psyRatingCost(next);
    const upd = this.#chargeXP({ "system.psyRating": next },
      { type: "psyRating", label: "Psy Rating", detail: `→ ${next}`, cost, ref: "", specialtyId: "", toRank: String(next) });
    if (upd) await this.actor.update(upd);
  }
```
Register in `DEFAULT_OPTIONS.actions`: `buyPsyRating: DarkHeresyActorSheet.#onBuyPsyRating` (append, comma the previous).

- [ ] **Step 5: Refund case.** In `#onRefund`, add a branch (next to the `characteristic`/`skill` ones):
```javascript
    } else if (entry.type === "psyRating") {
      const cur = sys.psyRating ?? 0;
      if (cur !== Number(entry.toRank)) { ui.notifications.warn("Refund later Psy Rating advances first."); return; }
      extra["system.psyRating"] = cur - 1;
```
(Newest-first: only the entry whose `toRank` equals the current rating refunds — i.e. the highest bought level. Bought entries are always level ≥ 2, so this never drops below 1.)

- [ ] **Step 6: Verify and commit.** `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs
git commit -m "feat: Psychic tab — psyker class (Custom-only, PR>0) + psy-rating buy/refund (Simple, 200×level)"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (an acolyte on the dh2e/bdh-test world):
- [ ] **Custom mode:** Psy Rating is an editable number (set 0→1→3, any value). With PR > 0, a **Psyker Class** dropdown appears (Bound/Unbound/Daemonic), editable; set PR back to 0 → the class row disappears.
- [ ] **Simple mode, PR 0:** Psy Rating shows read-only **0**, **no buy button** (first rating is Custom-only), no class row.
- [ ] **Simple mode, PR ≥ 1** (set it in Custom first): a **＋ 400** buy appears (for 1→2); buying deducts 400 XP, bumps PR to 2, and shows **＋ 600** for the next; the buy is logged in the Advancement ledger and **refundable** (newest-first; refunding 3→2 before 2→1).
- [ ] **Play mode:** Psy Rating + class are read-only.
- [ ] **NPC:** Custom-only (no Simple buys), psy rating/class editable in Custom.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + field + cost helper (Task 1, TDD); class UI + PR buy/refund (Task 2); ✓.

**Deferred (declared):** manifest/phenomena/power-model (next sub-projects); old-psy-class on migrated worlds.

**Placeholder scan:** complete; checklist concrete (Simple 1→2 = 400, 2→3 = 600; class hidden at PR 0).

**Type/name consistency:** `psyRatingCost(newLevel)=200×newLevel` matches the Task-1 test + the buy handler + the context `psyRatingNextCost`. `psykerClass` field uses `choices: Object.keys(BDH.psykerClasses)` (initial "bound"). Buy mirrors `#onBuyCharacteristic` via `#chargeXP` (logs `type:"psyRating"`, `toRank:String(next)`); refund mirrors the characteristic case (guard `cur === Number(entry.toRank)`). Context reuses `isCustom`/`isSimple`; `showPsyker = psyRating > 0` gates the class row; `canBuyPsyRating = isSimple && pr >= 1` gates the buy (first rating Custom-only). The Psychic tab's old always-editable `system.psyRating` input becomes Custom-only.
