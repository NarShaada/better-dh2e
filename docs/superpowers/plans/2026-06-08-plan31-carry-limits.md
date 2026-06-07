# Better DH2e — Plan 31: Weight Carry Limits

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show carry / lift / push weight limits (DH2e Table 7-26) on the Gear tab, derived from the character's **Strength Bonus + Toughness Bonus**, and turn the carried-weight figure **red** when it exceeds the carry limit.

**Architecture:** A pure `carryLimits(sbPlusTb)` helper indexes a 21-row table (sum 0–20, clamped). The actor sheet adds the live `strength.bonus + toughness.bonus` (already derived — unnatural + fatigue impairment folded in), looks up the limits, and flags over-encumbrance for the existing "Weight carried" bar.

**Tech Stack:** Foundry v13/v14 ApplicationV2 sheet context, Vitest, Handlebars, CSS.

**Scope:** the table + helper, the Gear-tab display (carry/lift/push + red-when-over). **Out of scope:** any mechanical penalty for being over-encumbered (movement/agility hit) — display only, GM adjudicates.

**Reference (confirmed):** Table 7-26 values below; sum is `SB + TB` clamped to 0–20; bonuses are the live derived values (impairment/unnatural already applied); show "carried / carry" (carried red when over) + "Lift · Push" beside it.

Builds on: `context.carriedWeight` (actor-sheet, ~line 478) and the `bdh-gear-bar` "Weight carried" line (actor-sheet.hbs ~line 244); derived `characteristics.*.bonus`.

---

## File Structure

```
scripts/helpers/encumbrance-data.mjs   NEW     CARRY_TABLE + carryLimits
test/encumbrance-data.test.mjs         NEW     Vitest
scripts/sheets/actor-sheet.mjs         MODIFY  carry/lift/push limits + overEncumbered in context
templates/actor/actor-sheet.hbs        MODIFY  Gear-tab weight bar
styles/better-dh2e.css                 MODIFY  over-encumbered red + aux text
```

---

### Task 1: Encumbrance table + helper (TDD)

**Files:** create `test/encumbrance-data.test.mjs`, `scripts/helpers/encumbrance-data.mjs`.

- [ ] **Step 1: Failing test** `test/encumbrance-data.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { carryLimits, CARRY_TABLE } from "../scripts/helpers/encumbrance-data.mjs";

describe("carryLimits (Table 7-26)", () => {
  it("reads the table by SB+TB", () => {
    expect(carryLimits(0)).toEqual({ carry: 0.9, lift: 2.25, push: 4.5 });
    expect(carryLimits(8)).toEqual({ carry: 56, lift: 112, push: 224 });
    expect(carryLimits(13)).toEqual({ carry: 225, lift: 450, push: 900 });
    expect(carryLimits(20)).toEqual({ carry: 2250, lift: 4500, push: 9000 });
  });
  it("clamps out-of-range sums to 0..20", () => {
    expect(carryLimits(25)).toEqual(carryLimits(20));
    expect(carryLimits(-3)).toEqual(carryLimits(0));
  });
  it("floors fractional sums", () => {
    expect(carryLimits(8.9)).toEqual(carryLimits(8));
  });
  it("has 21 rows", () => { expect(CARRY_TABLE.length).toBe(21); });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/encumbrance-data.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/encumbrance-data.mjs`:
```javascript
// scripts/helpers/encumbrance-data.mjs — PURE. DH2e Table 7-26 (Carrying, Lifting, & Pushing).

/** Indexed by (Strength Bonus + Toughness Bonus), 0..20. Weights in kg. */
export const CARRY_TABLE = [
  { carry: 0.9,  lift: 2.25, push: 4.5 },
  { carry: 2.25, lift: 4.5,  push: 9 },
  { carry: 4.5,  lift: 9,    push: 18 },
  { carry: 9,    lift: 18,   push: 36 },
  { carry: 18,   lift: 36,   push: 72 },
  { carry: 27,   lift: 54,   push: 108 },
  { carry: 36,   lift: 72,   push: 144 },
  { carry: 45,   lift: 90,   push: 180 },
  { carry: 56,   lift: 112,  push: 224 },
  { carry: 67,   lift: 134,  push: 268 },
  { carry: 78,   lift: 156,  push: 312 },
  { carry: 90,   lift: 180,  push: 360 },
  { carry: 112,  lift: 224,  push: 448 },
  { carry: 225,  lift: 450,  push: 900 },
  { carry: 337,  lift: 674,  push: 1348 },
  { carry: 450,  lift: 900,  push: 1800 },
  { carry: 675,  lift: 1350, push: 2700 },
  { carry: 900,  lift: 1800, push: 3600 },
  { carry: 1350, lift: 2700, push: 5400 },
  { carry: 1800, lift: 3600, push: 7200 },
  { carry: 2250, lift: 4500, push: 9000 },
];

/** Carry/lift/push limits for a given Strength-Bonus + Toughness-Bonus sum (clamped 0..20). */
export function carryLimits(sbPlusTb) {
  const i = Math.max(0, Math.min(20, Math.floor(sbPlusTb || 0)));
  return CARRY_TABLE[i];
}
```

- [ ] **Step 4: Run — PASS + check.** `npx vitest run test/encumbrance-data.test.mjs`, then `node --check scripts/helpers/encumbrance-data.mjs && npm test`.

- [ ] **Step 5: Commit.**
```bash
git add scripts/helpers/encumbrance-data.mjs test/encumbrance-data.test.mjs
git commit -m "feat: encumbrance table (DH2e 7-26) + carryLimits helper (TDD)"
```

---

### Task 2: Gear-tab display

**Files:** `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`, `styles/better-dh2e.css`

- [ ] **Step 1: Import** `carryLimits` (merge into actor-sheet.mjs's helper imports):
```javascript
import { carryLimits } from "../helpers/encumbrance-data.mjs";
```

- [ ] **Step 2: Context.** In `_prepareContext`, right after `context.carriedWeight` is set (~line 478-481), add:
```javascript
    const encSum = (this.document.system.characteristics.strength.bonus ?? 0) + (this.document.system.characteristics.toughness.bonus ?? 0);
    const limits = carryLimits(encSum);
    context.carryLimit = limits.carry;
    context.liftLimit = limits.lift;
    context.pushLimit = limits.push;
    context.overEncumbered = context.carriedWeight > limits.carry;
```

- [ ] **Step 3: Template.** In `templates/actor/actor-sheet.hbs`, replace the gear weight bar (~line 244):
```handlebars
    <div class="bdh-gear-bar">Weight carried: <b class="{{#if overEncumbered}}bdh-over{{/if}}">{{carriedWeight}}</b> / {{carryLimit}} kg <span class="bdh-enc-aux">Lift {{liftLimit}} · Push {{pushLimit}}</span></div>
```

- [ ] **Step 4: Styles.** Append to `styles/better-dh2e.css`:
```css

/* Encumbrance (Gear tab) */
.better-dh2e .bdh-over { color:#a01818; }
.better-dh2e .bdh-enc-aux { color:var(--bdh-brown); font-size:11px; margin-left:8px; }
```
(If a red "over/warn" colour class already exists in the stylesheet, reuse it instead of `bdh-over` and update the template accordingly.)

- [ ] **Step 5: Verify and commit.** `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs styles/better-dh2e.css
git commit -m "feat: Gear tab shows carry/lift/push limits + reddens carried weight when over carry limit"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (an actor on the dh2e sandbox, Gear tab):
- [ ] The weight bar reads **"Weight carried: {carried} / {carry} kg  Lift {lift} · Push {push}"**, with the limits matching the character's SB+TB row (e.g. SB 4 + TB 3 = sum 7 → carry 45 / lift 90 / push 180).
- [ ] Add/own enough gear to exceed the carry limit → the **carried number turns red**; drop below → back to normal.
- [ ] A fatigued character (whose Strength/Toughness bonus is halved) shows **lower** limits (sum uses the impaired bonuses); an unnatural-bonus character shows **higher**.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** table + helper (Task 1, TDD); Gear-tab limits + red-over-limit (Task 2). ✓

**Deferred (declared):** mechanical over-encumbrance penalties (display only).

**Placeholder scan:** complete; checklist concrete (sum 7 → 45/90/180; red when over).

**Type/name consistency:** `carryLimits(sbPlusTb)` returns `{carry, lift, push}`; the test asserts the exact table rows (incl. the 13-jump to 225/450/900) + clamping + floor + 21 rows. Context computes `encSum = strength.bonus + toughness.bonus` (derived, so impairment/unnatural apply) and sets `carryLimit`/`liftLimit`/`pushLimit`/`overEncumbered = carriedWeight > carry`. The template reddens `{{carriedWeight}}` via `bdh-over` when `overEncumbered` and shows "/ {{carryLimit}} kg" + "Lift {{liftLimit}} · Push {{pushLimit}}". CSS adds `bdh-over` + `bdh-enc-aux` (or reuses an existing red class).
