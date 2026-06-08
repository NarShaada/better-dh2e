# Better DH2e — Plan 33: Force Field Automation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an attack **hits** a target wearing an **equipped force field**, automatically roll the field (1d100): ≤ protection rating = **Success** (blocks), ≤ overload value = also an **Overload**. Post a skill-roll-style card. No further automation (GM applies the outcome).

**Architecture:** A pure `forceFieldResult(roll, protection, overload)` helper (TDD). `rollAttack` calls a `rollForceField(targetActor)` after the attack card when the to-hit succeeded; it finds the equipped field, rolls, and renders a dedicated `forcefield-card.hbs`.

**Tech Stack:** Foundry v13/v14 (Roll, renderTemplate, ChatMessage), Vitest, Handlebars.

**Scope:** the auto field test + its card. **Out of scope:** what Success/Overload mechanically *do* (GM adjudicates — fields blocking damage, overload burning out, etc.).

**Reference (confirmed):** triggers **on a hit** against a target with an equipped force field; `success = roll ≤ protectionRating`; `overload = roll ≤ overload`; card looks like a skill roll — **Target** = protection rating, the modifier slot relabeled **Overload** = overload value, **Result** = the d100; just "Success"/"Failure" (no DoS/DoF); an **"Overload!"** line printed prominently like Psychic Phenomena.

The `forceField` model already has `protectionRating`, `overload`, `equipped`. Mirrors `templates/chat/test-card.hbs` + the `performTest` roll/sound pattern.

---

## File Structure

```
scripts/helpers/force-field-data.mjs   NEW     forceFieldResult (pure)
test/force-field-data.test.mjs         NEW     Vitest
templates/chat/forcefield-card.hbs     NEW     the field-test card
scripts/rolls/attack.mjs               MODIFY  rollForceField + trigger after a hit
```

---

### Task 1: Pure helper (TDD)

**Files:** create `test/force-field-data.test.mjs`, `scripts/helpers/force-field-data.mjs`.

- [ ] **Step 1: Failing test** `test/force-field-data.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { forceFieldResult } from "../scripts/helpers/force-field-data.mjs";

describe("forceFieldResult", () => {
  it("blocks when roll <= protection", () => {
    expect(forceFieldResult(30, 60, 10)).toEqual({ success: true, overload: false });
    expect(forceFieldResult(60, 60, 10)).toEqual({ success: true, overload: false }); // boundary
    expect(forceFieldResult(70, 60, 10)).toEqual({ success: false, overload: false });
  });
  it("overloads when roll <= overload", () => {
    expect(forceFieldResult(5, 60, 10)).toEqual({ success: true, overload: true });
    expect(forceFieldResult(10, 60, 10)).toEqual({ success: true, overload: true }); // boundary
    expect(forceFieldResult(11, 60, 10)).toEqual({ success: true, overload: false });
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/force-field-data.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/force-field-data.mjs`:
```javascript
// scripts/helpers/force-field-data.mjs — PURE. Force-field test resolution.

/** Resolve a force-field 1d100: success if roll <= protection; overload if roll <= overload value. */
export function forceFieldResult(roll, protection, overload) {
  return { success: roll <= protection, overload: roll <= overload };
}
```

- [ ] **Step 4: Run — PASS + check.** `npx vitest run test/force-field-data.test.mjs`, then `node --check scripts/helpers/force-field-data.mjs && npm test`.

- [ ] **Step 5: Commit.**
```bash
git add scripts/helpers/force-field-data.mjs test/force-field-data.test.mjs
git commit -m "feat: forceFieldResult helper (TDD)"
```

---

### Task 2: Card + auto-trigger on a hit

**Files:** create `templates/chat/forcefield-card.hbs`; modify `scripts/rolls/attack.mjs`.

- [ ] **Step 1: Card** `templates/chat/forcefield-card.hbs` (mirror test-card.hbs; "Overload" replaces the modifier slot; "Overload!" printed like phenomena):
```handlebars
{{!-- templates/chat/forcefield-card.hbs --}}
<div class="bdh-card {{#if success}}ok{{else}}fail{{/if}}">
  <header class="bdh-card-head">{{fieldName}} — Force Field</header>
  <div class="bdh-card-grid">
    <span class="k">Target</span><span class="v">{{protection}}</span>
    <span class="k">Overload</span><span class="v">{{overloadRating}}</span>
    <span class="k">Result</span><span class="v"><b>{{roll}}</b></span>
  </div>
  <div class="bdh-card-result {{#if success}}ok{{else}}fail{{/if}}">
    {{#if success}}Success{{else}}Failure{{/if}}
  </div>
  {{#if overloaded}}<div class="bdh-phenomena">⚡ Overload!</div>{{/if}}
</div>
```

- [ ] **Step 2: Handler** in `scripts/rolls/attack.mjs` — import the helper and add `rollForceField` near the other follow-up handlers:
```javascript
import { forceFieldResult } from "../helpers/force-field-data.mjs";
```
```javascript
/** Auto-roll an equipped force field for a hit target. No-op if the target has no equipped field. */
async function rollForceField(actor) {
  const field = actor?.items.find((i) => i.type === "forceField" && i.system.equipped);
  if (!field) return;
  const roll = await new Roll("1d100").evaluate();
  const res = forceFieldResult(roll.total, field.system.protectionRating, field.system.overload);
  const content = await renderTemplate("systems/better-dh2e/templates/chat/forcefield-card.hbs", {
    fieldName: field.name,
    protection: field.system.protectionRating,
    overloadRating: field.system.overload,
    roll: roll.total,
    success: res.success,
    overloaded: res.overload,
  });
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), content, rolls: [roll] };
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
}
```

- [ ] **Step 3: Trigger** in `rollAttack`, right AFTER the attack `ChatMessage.create` (the `const msg = await ChatMessage.create(messageData)` line, before `return msg`):
```javascript
  // Force field: a hit target with an equipped field auto-tests it.
  if (success && targetToken?.actor) await rollForceField(targetToken.actor);
```
(`success` and `targetToken` are already in scope in `rollAttack`.)

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add templates/chat/forcefield-card.hbs scripts/rolls/attack.mjs
git commit -m "feat: equipped force field auto-rolls on a hit (Success/Overload card)"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (give a target token a force field on its Gear tab, equip it, set e.g. Protection 60 / Overload 10):
- [ ] Attack and **hit** that target → a second card appears: **"[Field] — Force Field"**, Target 60 / Overload 10 / Result d100, "Success" when roll ≤ 60 else "Failure".
- [ ] A roll ≤ 10 shows the prominent **⚡ Overload!** line (and Success).
- [ ] A **missed** attack produces **no** field card; a target with **no equipped** field produces none.
- [ ] The card plays the dice sound (rolls attached) and respects roll mode.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** pure resolver (Task 1, TDD); card + auto-trigger-on-hit (Task 2). ✓

**Deferred (declared):** the mechanical consequences of Success/Overload (GM adjudicates).

**Placeholder scan:** complete; checklist concrete (Protection 60 / Overload 10; ≤10 → Overload!; miss → no card).

**Type/name consistency:** `forceFieldResult(roll, protection, overload) → {success, overload}` matches the Task-1 test + `rollForceField`'s use. The field reads `system.protectionRating` / `system.overload` / `system.equipped` (the actual model fields). Trigger uses `rollAttack`'s existing `success` + `targetToken`. Card mirrors `test-card.hbs` with the modifier slot relabeled **Overload** and an **Overload!** line styled like `.bdh-phenomena`.
