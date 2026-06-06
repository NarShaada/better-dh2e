# Better DH2e — Plan 19: Characteristic Impairment + Red Display

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the two characteristic-impairment effects and surface them in **red**: an equipped armour **caps Agility** at its craftsmanship-adjusted max-Agility; **fatigue halves** any characteristic whose bonus is below current fatigue. Both reduce the effective value (cascading into skills/movement) and render red on the sheet. Completes the **alpha** gate.

**Architecture:** Pure, tested impairment helpers run inside the actor system model's `prepareDerivedData` **after** characteristic totals and **before** the skills loop — so skills, movement, soak etc. all use the impaired values automatically. `buildCharacteristics` exposes an `impaired` flag; the characteristic box renders red (play/Simple modes; Custom keeps editing the base uncolored). `fatigue.max` is computed from the **unimpaired** TB/WB.

**Tech Stack:** Foundry v13 (TypeDataModel `prepareDerivedData`, `this.parent.items`), Vitest, Handlebars.

**Scope:** Agility cap from `maxAgility` (craftsmanship-adjusted, most-restrictive wins, 0 = none), fatigue halving (bonus < fatigue → `ceil(total/2)`, unnatural stays on top), red display. **Out of scope:** weight→encumbrance.

**Reference:** confirmed rules — armour: Poor restricts 10 more Agility, Good/Best 10 less; cap = `maxAgility + craftAdj` (only when `maxAgility>0`), most restrictive equipped armour wins; effective Agility = `min(total, cap)`, shown red. Fatigue: any characteristic whose **bonus < current fatigue** is halved (`ceil(total/2)`); the bonus is recomputed `floor(halvedTotal/10)+unnatural` (unnatural stays on top), shown red. `characteristicBonus()` recomputes from base+advance, so impaired bonuses are recomputed inline from the overridden total.

---

## File Structure

```
scripts/helpers/impairment-data.mjs      NEW     pure: craftAgilityAdj, effectiveAgilityCap, applyImpairments
test/impairment-data.test.mjs            NEW     Vitest
scripts/data/actor/base-actor-model.mjs  MODIFY  reorder fatigue.max up; run impairment before skills (reads equipped armour)
scripts/helpers/sheet-data.mjs           MODIFY  buildCharacteristics exposes `impaired`
test/sheet-data.test.mjs                 MODIFY  impaired assertion
templates/actor/actor-sheet.hbs          MODIFY  red `impaired` class on the characteristic box (play/Simple only)
styles/better-dh2e.css                   MODIFY  impaired = red value/bonus
```

---

### Task 1: Pure impairment helpers (TDD)

**Files:** create `test/impairment-data.test.mjs`, `scripts/helpers/impairment-data.mjs`.

- [ ] **Step 1: Failing test** `test/impairment-data.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { craftAgilityAdj, effectiveAgilityCap, applyImpairments } from "../scripts/helpers/impairment-data.mjs";

describe("craftAgilityAdj", () => {
  it("poor -10, good/best +10, normal 0", () => {
    expect(craftAgilityAdj("poor")).toBe(-10);
    expect(craftAgilityAdj("good")).toBe(10);
    expect(craftAgilityAdj("best")).toBe(10);
    expect(craftAgilityAdj("normal")).toBe(0);
  });
});
describe("effectiveAgilityCap", () => {
  it("maxAgility + craft adj; ignores maxAgility 0; most restrictive wins; null if none", () => {
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "normal" }])).toBe(30);
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "poor" }])).toBe(20);
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "good" }])).toBe(40);
    expect(effectiveAgilityCap([{ maxAgility: 0, craftsmanship: "poor" }])).toBeNull();
    expect(effectiveAgilityCap([{ maxAgility: 30, craftsmanship: "normal" }, { maxAgility: 20, craftsmanship: "normal" }])).toBe(20);
    expect(effectiveAgilityCap([])).toBeNull();
  });
});
describe("applyImpairments", () => {
  it("caps Agility to the armour cap and flags it", () => {
    const chars = { agility: { total: 50, bonus: 5, unnatural: 0 } };
    applyImpairments(chars, 0, 30);
    expect(chars.agility.total).toBe(30);
    expect(chars.agility.bonus).toBe(3);
    expect(chars.agility.impaired).toBe(true);
  });
  it("no cap leaves Agility alone", () => {
    const chars = { agility: { total: 50, bonus: 5, unnatural: 0 } };
    applyImpairments(chars, 0, null);
    expect(chars.agility.total).toBe(50);
    expect(chars.agility.impaired).toBeFalsy();
  });
  it("halves a characteristic whose bonus < fatigue (round up), unnatural stays on top", () => {
    const chars = { strength: { total: 35, bonus: 6, unnatural: 3 } };
    applyImpairments(chars, 7, null);            // bonus 6 < fatigue 7 -> halve
    expect(chars.strength.total).toBe(18);       // ceil(35/2)
    expect(chars.strength.bonus).toBe(4);        // floor(18/10) + 3
    expect(chars.strength.impaired).toBe(true);
  });
  it("does not halve when bonus >= fatigue", () => {
    const chars = { strength: { total: 35, bonus: 6, unnatural: 3 } };
    applyImpairments(chars, 6, null);            // 6 < 6 is false
    expect(chars.strength.total).toBe(35);
    expect(chars.strength.impaired).toBeFalsy();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/impairment-data.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/impairment-data.mjs`:
```javascript
// scripts/helpers/impairment-data.mjs — PURE. Characteristic impairment: armour Agility cap + fatigue halving.

/** Armour craftsmanship effect on the Agility restriction (Poor restricts 10 more; Good/Best 10 less). */
export function craftAgilityAdj(craftsmanship) {
  return { poor: -10, good: 10, best: 10 }[craftsmanship] ?? 0;
}

/** Most-restrictive (lowest) Agility cap across equipped armour with a maxAgility (>0); null if none. */
export function effectiveAgilityCap(armours) {
  const caps = armours
    .filter((a) => (a.maxAgility ?? 0) > 0)
    .map((a) => a.maxAgility + craftAgilityAdj(a.craftsmanship));
  return caps.length ? Math.min(...caps) : null;
}

/** Mutate `chars` in place: cap Agility at `agilityCap`, then halve any characteristic whose bonus < fatigue.
 *  Bonus is recomputed from the overridden total as floor(total/10)+unnatural (unnatural stays on top). */
export function applyImpairments(chars, fatigueValue, agilityCap) {
  const recompute = (c) => Math.floor(c.total / 10) + (c.unnatural ?? 0);
  if (agilityCap != null && chars.agility && chars.agility.total > agilityCap) {
    chars.agility.total = Math.max(0, agilityCap);
    chars.agility.bonus = recompute(chars.agility);
    chars.agility.impaired = true;
  }
  for (const c of Object.values(chars)) {
    if (c.bonus < fatigueValue) {
      c.total = Math.ceil(c.total / 2);
      c.bonus = recompute(c);
      c.impaired = true;
    }
  }
  return chars;
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/impairment-data.test.mjs`.

- [ ] **Step 5: Commit**
```bash
git add scripts/helpers/impairment-data.mjs test/impairment-data.test.mjs
git commit -m "feat: pure impairment helpers (armour Agility cap + fatigue halving) with tests"
```

---

### Task 2: Wire impairment into the actor model

**Files:** `scripts/data/actor/base-actor-model.mjs`

The current `prepareDerivedData` is:
```javascript
  prepareDerivedData() {
    for (const c of Object.values(this.characteristics)) {
      c.total = characteristicTotal(c);
      c.bonus = characteristicBonus(c);
    }
    for (const [key, skill] of Object.entries(this.skills)) { /* skill totals */ }
    this.fatigue.max = this.fatigue.maxOverride ?? fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
    this.movement = movement(this.characteristics.agility.bonus, this.size);
  }
```

- [ ] **Step 1: Import the impairment helpers** at the top:
```javascript
import { effectiveAgilityCap, applyImpairments } from "../../helpers/impairment-data.mjs";
```

- [ ] **Step 2: Reorder + insert impairment.** Restructure `prepareDerivedData` so `fatigue.max` is computed from the UNIMPAIRED bonuses, then impairment runs, then skills + movement use the impaired values:
```javascript
  prepareDerivedData() {
    for (const c of Object.values(this.characteristics)) {
      c.total = characteristicTotal(c);
      c.bonus = characteristicBonus(c);
    }
    // Fatigue max from UNIMPAIRED Toughness/Willpower bonuses (impairment must not shrink the max).
    this.fatigue.max = this.fatigue.maxOverride ?? fatigueMax(this.characteristics.toughness.bonus, this.characteristics.willpower.bonus);
    // Impairment: armour Agility cap + fatigue halving (mutates this.characteristics, sets `impaired`).
    const equippedArmour = this.parent.items.filter((i) => i.type === "armour" && i.system.equipped).map((i) => i.system);
    applyImpairments(this.characteristics, this.fatigue.value, effectiveAgilityCap(equippedArmour));
    // Skills + movement use the (possibly impaired) characteristic totals/bonuses.
    for (const [key, skill] of Object.entries(this.skills)) {
      const charTotal = this.characteristics[BDH.skills[key].characteristic].total;
      if (BDH.skills[key].specialist) {
        for (const sp of skill.specialties) sp.total = skillTotal(charTotal, sp.rank);
      } else {
        skill.total = skillTotal(charTotal, skill.rank);
      }
    }
    this.movement = movement(this.characteristics.agility.bonus, this.size);
  }
```
(`this.parent` is the Actor; `this.parent.items` is the prepared embedded-item collection — items are prepared before the system model's `prepareDerivedData`, so reading equipped armour here is safe. Adapt to the file's actual loop/variable names; keep the existing skill loop body.)

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/data/actor/base-actor-model.mjs && npm test`.
```bash
git add scripts/data/actor/base-actor-model.mjs
git commit -m "feat: apply Agility cap + fatigue halving in derived data (before skills) so impairment cascades"
```

---

### Task 3: buildCharacteristics exposes `impaired` (TDD)

**Files:** `test/sheet-data.test.mjs`, `scripts/helpers/sheet-data.mjs`

- [ ] **Step 1: Update the test.** In `test/sheet-data.test.mjs`, set an impaired flag on one characteristic in `charStub()` (e.g. `o.agility = { base: 30, advance: 0, unnatural: 0, total: 30, bonus: 3, impaired: true };` — preserve the stub's existing fields/style), and add inside `describe("buildCharacteristics", ...)`:
```javascript
  it("carries the impaired flag", () => {
    const rows = buildCharacteristics(charStub());
    expect(rows.find((r) => r.key === "agility").impaired).toBe(true);
    expect(rows.find((r) => r.key === "toughness").impaired).toBe(false);
  });
```

- [ ] **Step 2: Run — verify the new test FAILS.** `npx vitest run test/sheet-data.test.mjs`.

- [ ] **Step 3: Implement.** In `buildCharacteristics`, add to the returned object:
```javascript
      impaired: c.impaired ?? false,
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/sheet-data.test.mjs`.

- [ ] **Step 5: Commit**
```bash
git add test/sheet-data.test.mjs scripts/helpers/sheet-data.mjs
git commit -m "feat: buildCharacteristics carries the impaired flag (TDD)"
```

---

### Task 4: Red display

**Files:** `templates/actor/actor-sheet.hbs`, `styles/better-dh2e.css`

- [ ] **Step 1: Template.** On the characteristic box, add an `impaired` class in **play/Simple** modes (not Custom, where the base is being edited). Change the char wrapper:
```handlebars
        <div class="char {{#if c.isInfluence}}inf{{/if}}{{#unless @root.isCustom}}{{#if c.impaired}} impaired{{/if}}{{/unless}}" data-characteristic="{{c.key}}">
```
(Keep the rest of the char-box markup unchanged.)

- [ ] **Step 2: CSS.** Append:
```css

/* Impaired characteristic (armour Agility cap or fatigue halving) — show value + bonus red */
.better-dh2e .char.impaired .box .val { color:#a02020; }
.better-dh2e .char.impaired .bonus { color:#a02020; }
```

- [ ] **Step 3: Commit**
```bash
git add templates/actor/actor-sheet.hbs styles/better-dh2e.css
git commit -m "feat: red display for impaired characteristics"
```

---

### Task 5: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (Daren Vholk or Sgt. Kesh):
- [ ] **Agility cap**: give the character an equipped armour with **Max Agility 30** (on its item sheet); the actor's **Agility** shows the capped value in **red** if its real Agility is higher (e.g. Ag 42 → red **30**), and the **bonus** drops accordingly. **Poor** craftsmanship on that armour caps at 20; **Good/Best** at 40. Two restrictive armours → the **lowest** cap applies. Max Agility **0** → no cap.
- [ ] **Cascade**: an Agility-based skill (Dodge/Acrobatics) and **movement** reflect the capped Agility.
- [ ] **Fatigue halving**: set **current fatigue** above a characteristic's bonus (e.g. fatigue 4 with a characteristic whose bonus is 3) → that characteristic shows **red**, halved (`ceil`), bonus = tens-of-half + unnatural; its skills drop too. Below the bonus → normal.
- [ ] **Custom mode**: the red doesn't bleed into the editable base fields (you still edit the un-impaired base).
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix. **This completes alpha.**

---

## Self-Review

**Coverage:** pure helpers (Task 1, TDD); derived wiring before skills, fatigue.max from unimpaired bonuses (Task 2); `impaired` in buildCharacteristics (Task 3, TDD); red display play/Simple-only (Task 4). ✓ Alpha gate (craftsmanship + ammo from Plan 18, impairment here) complete.

**Deferred (declared):** weight→encumbrance.

**Placeholder scan:** complete; checklist concrete (Max Ag 30 → red 30; Poor→20; fatigue 4 vs bonus 3).

**Type/name consistency:** helpers match Task-1 tests + the model caller; `applyImpairments` mutates `this.characteristics` and recomputes bonus inline as `floor(total/10)+unnatural` (NOT `characteristicBonus`, which recomputes from base+advance). `effectiveAgilityCap` reads equipped armour `system.{maxAgility,craftsmanship}` (maxAgility added in Plan 18). Impairment runs after the char loop + `fatigue.max` (unimpaired) and before skills/movement, so the cascade is automatic. `buildCharacteristics` adds `impaired`; the template adds the `impaired` class only when `!@root.isCustom`; CSS reddens the play-mode `.val`/`.bonus`. `this.parent.items` is the prepared item collection.
