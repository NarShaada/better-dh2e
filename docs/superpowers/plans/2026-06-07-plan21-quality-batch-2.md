# Better DH2e — Plan 21: Weapon Quality Batch 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six weapon qualities — **Felling(X)**, **Flame**, **Flexible**, **Graviton** (black ⚙, full automation), **Hallucinogenic(X)** (red ⚙, partial — auto-rolls the resist test, GM rolls the table), and **Force** (no gear — config stub, full handling ships with psykers).

**Architecture:** Extend the quality registry/config + pure helpers (`quality-modules.mjs`) and wire each at its existing pipeline hook point: Felling + Graviton at the soak step (`applyDamage`), Flame + Hallucinogenic as damage-card resist buttons (reusing the Shocking/Concussive pattern + `resolveDefender` + `promptTest`), Flexible at the evade step (drop Parry when the incoming weapon is Flexible). Force is config-only.

**Tech Stack:** Foundry v13 (ChatMessage flags/buttons, `performTest`, `promptTest`), Vitest, Handlebars.

**Scope:** the six qualities above. **Out of scope:** auto-applying On-Fire/Hallucinogen conditions (GM applies from the test/table), the Hallucinogen table itself, full Force/psyker handling.

**Reference (confirmed):**
- **Felling(X):** ignores X points of the target's **unnatural** Toughness (down to 0; normal TB unaffected). Effective soak TB = `storedToughnessBonus − min(unnatural, X)`.
- **Flame:** on damage, the target makes an **Agility** test or is set on fire (GM applies). Damage-card button, like Shocking.
- **Flexible:** the weapon **cannot be Parried** — the defender's evade only offers Dodge when the incoming weapon is Flexible.
- **Graviton:** deals **additional damage equal to the armour (AP) at the struck location** — `damage += AP(location)` before soak.
- **Hallucinogenic(X):** like Concussive — target makes a **Toughness** test at **−10·X**; on failure the GM rolls on the Hallucinogen table (manual → red ⚙).
- **Force:** no automation now; config stub so it's selectable.

Builds on Plan 20 (`concussiveValue`, the damage-card resist buttons, `resolveDefender`, `promptTest`, `qualityNotes`/`noteOn`, the 3-tier ⚙ marker) and `applyDamage`'s soak loop (`computeArmour` per-location AP, `soak`).

---

## File Structure

```
scripts/config.mjs                    MODIFY  felling/flexible +automation; add flame, force, graviton, hallucinogenic
scripts/helpers/quality-modules.mjs   MODIFY  qualityValue generic; fellingValue, felledToughnessBonus, hasFlame, hasFlexible, hasGraviton, hallucinogenicValue
test/quality-modules.test.mjs         MODIFY  tests for the new helpers
scripts/rolls/attack.mjs              MODIFY  applyDamage Felling+Graviton; damage-card Flame+Hallucinogenic buttons/handlers; rollEvade Flexible
templates/chat/damage-card.hbs        MODIFY  Flame + Hallucinogenic lines
```

---

### Task 1: Config + pure helpers (TDD)

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs): add `automation: "full"` to the existing `felling` and `flexible` entries, and add four new entries (mind commas):
```javascript
  flame:         { label: "Flame", takesValue: false, automation: "full" },
  force:         { label: "Force", takesValue: false },
  graviton:      { label: "Graviton", takesValue: false, automation: "full" },
  hallucinogenic:{ label: "Hallucinogenic", takesValue: true, automation: "partial" },
```
(`felling` already has `takesValue: true`; just add `automation: "full"`. Same for `flexible` (`takesValue: false`). `force` has no `automation` → no gear. `hallucinogenic` is the first `"partial"` → red ⚙.)

- [ ] **Step 2: Failing tests.** In `test/quality-modules.test.mjs`, add `fellingValue, felledToughnessBonus, hasFlame, hasFlexible, hasGraviton, hallucinogenicValue` to the import, and append:
```javascript
describe("fellingValue / hallucinogenicValue", () => {
  it("read the numeric X (0 if absent/blank)", () => {
    expect(fellingValue([{ key: "felling", value: "4" }])).toBe(4);
    expect(fellingValue(Q())).toBe(0);
    expect(hallucinogenicValue([{ key: "hallucinogenic", value: "2" }])).toBe(2);
    expect(hallucinogenicValue([{ key: "hallucinogenic", value: "" }])).toBe(0);
  });
});
describe("felledToughnessBonus", () => {
  it("removes the unnatural part up to X, never the natural part", () => {
    expect(felledToughnessBonus(5, 2, 4)).toBe(3);   // base 3 + unnat 2; Felling(4) strips 2 -> 3
    expect(felledToughnessBonus(5, 2, 1)).toBe(4);   // strips only 1
    expect(felledToughnessBonus(3, 0, 4)).toBe(3);   // no unnatural -> unchanged
    expect(felledToughnessBonus(6, 3, 3)).toBe(3);   // strips all 3 unnatural
  });
});
describe("flag helpers", () => {
  it("detect Flame / Flexible / Graviton", () => {
    expect(hasFlame(Q("flame"))).toBe(true);
    expect(hasFlexible(Q("flexible"))).toBe(true);
    expect(hasGraviton(Q("graviton"))).toBe(true);
    expect(hasFlame(Q())).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`. Add a generic value reader and refactor `concussiveValue` to use it, then add the new helpers:
```javascript
/** The numeric value of a weapon quality by key (0 if absent or blank). */
function qualityValue(qualities, key) {
  const q = Array.isArray(qualities) ? qualities.find((x) => x.key === key) : null;
  return q ? (Number(q.value) || 0) : 0;
}
export function concussiveValue(qualities) { return qualityValue(qualities, "concussive"); }
export function fellingValue(qualities) { return qualityValue(qualities, "felling"); }
export function hallucinogenicValue(qualities) { return qualityValue(qualities, "hallucinogenic"); }

/** Felling: ignore X points of the target's UNNATURAL Toughness (natural bonus untouched). */
export function felledToughnessBonus(toughnessBonus, unnatural, fellingX) {
  return toughnessBonus - Math.min(unnatural ?? 0, fellingX);
}

export function hasFlame(qualities) { return has(qualities, "flame"); }
export function hasFlexible(qualities) { return has(qualities, "flexible"); }
export function hasGraviton(qualities) { return has(qualities, "graviton"); }
```
(Replace the existing `concussiveValue` body with the wrapper above. `has` already exists in the module.)

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: quality batch 2 config + pure helpers (felling/flame/flexible/graviton/hallucinogenic) (TDD)"
```

---

### Task 2: Wire Felling + Graviton in applyDamage

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import the new helpers (merge into the existing quality-modules import): add `fellingValue, felledToughnessBonus, hasGraviton`.

- [ ] **Step 2:** Read `applyDamage` — its per-hit soak loop (where it has `ap` per-location, `tb`, `f.penetration`, and calls `soak(h.total, ap[h.location] ?? 0, f.penetration, tb)`). Add Felling (TB reduction, weapon-wide) and Graviton (per-hit +AP). Before the loop:
```javascript
  const qualities = f.qualities ?? [];
  const felX = fellingValue(qualities);
  const tbEff = felX ? felledToughnessBonus(tb, sys.characteristics.toughness.unnatural ?? 0, felX) : tb;
  const graviton = hasGraviton(qualities);
```
Then in the loop, change the soak call so Graviton adds the location's AP to the incoming damage and the soak uses `tbEff`:
```javascript
    const locAp = ap[h.location] ?? 0;
    const eff = soak(h.total + (graviton ? locAp : 0), locAp, f.penetration, tbEff);
```
(Adapt to the real variable names; the key changes are `tbEff` replacing `tb` in the soak call and the `+ (graviton ? locAp : 0)` on the damage. Leave the wounds/critical/lines logic unchanged.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Felling (ignore X unnatural TB) + Graviton (+AP at location) in applyDamage"
```

---

### Task 3: Wire Flame + Hallucinogenic (damage-card resist buttons)

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/damage-card.hbs`

- [ ] **Step 1:** Import `hasFlame, hallucinogenicValue` (merge into the quality-modules import).

- [ ] **Step 2:** In `rollDamage`, add to the damage `cardData` (next to `shocking`/`concussive`):
```javascript
    flame: hasFlame(qualities),
    hallucinogenic: hallucinogenicValue(qualities) || null,
```

- [ ] **Step 3:** Add two handlers (next to `rollConcussiveTest`), reusing `resolveDefender` + `promptTest` + `performTest`:
```javascript
async function rollFlameTest(message) {
  const defender = await resolveDefender(message.flags[NS]);
  if (!defender) { ui.notifications.warn("Select a token to test Agility."); return; }
  const label = "Agility (Flame)";
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.agility.total, modifier: choice.modifier });
}
async function rollHallucinogenicTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = hallucinogenicValue(f.qualities);
  const label = `Toughness (Hallucinogenic ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
}
```

- [ ] **Step 4:** In `bindCardButtons`, add dispatch branches (next to `shockTest`/`concussiveTest`):
```javascript
      else if (btn.dataset.bdh === "flameTest") await rollFlameTest(message);
      else if (btn.dataset.bdh === "hallucinogenicTest") await rollHallucinogenicTest(message);
```

- [ ] **Step 5:** In `templates/chat/damage-card.hbs`, after the Concussive line, add:
```handlebars
  {{#if flame}}<div class="bdh-card-line">🔥 Flame — Agility test or set on fire: <button type="button" data-bdh="flameTest">Agility Test</button></div>{{/if}}
  {{#if hallucinogenic}}<div class="bdh-card-line">☣ Hallucinogenic ({{hallucinogenic}}) — Toughness test or Hallucinogen table: <button type="button" data-bdh="hallucinogenicTest">Toughness Test</button></div>{{/if}}
```

- [ ] **Step 6: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/damage-card.hbs
git commit -m "feat: Flame (Agility test) + Hallucinogenic(X) (Toughness -10X, GM rolls table) damage-card buttons"
```

---

### Task 4: Wire Flexible (cannot be Parried)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import `hasFlexible` (merge into the quality-modules import).

- [ ] **Step 2:** Read `rollEvade` — how it builds the reaction choice (a dialog offering Parry / Dodge) and where it reads the attack message flags (`f`, which includes `f.qualities` — the attacker's weapon qualities). When the incoming weapon is Flexible, the dialog must **not** offer Parry (Dodge only). Implement by gating the Parry option on `!hasFlexible(f.qualities)`:
  - If the reaction is chosen via a DialogV2 with two buttons (Parry/Dodge): omit/skip the Parry button when `hasFlexible(f.qualities)`.
  - If it's a `<select>`/radio of reactions: build the options conditionally (drop Parry when Flexible).
  - Add a note so the user knows why — e.g. when Flexible, show the dialog content line `<p>This weapon is Flexible — it cannot be parried.</p>` (or set the dialog title accordingly).
  - Defensive guard: if Parry is somehow still selected against a Flexible weapon, `ui.notifications.warn("A Flexible weapon cannot be parried."); return null;`.
(Adapt precisely to the actual `rollEvade` dialog structure. `f.qualities` is already on the attack flags.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Flexible — incoming Flexible weapons cannot be parried (Dodge only)"
```

---

### Task 5: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (set qualities on the test weapons; the NPC "Heretic Gunman" has TB and Flak armour — give it some Unnatural Toughness via its sheet for the Felling test):
- [ ] **Gear tiers**: Felling, Flame, Flexible, Graviton show **black ⚙**; Hallucinogenic shows **red ⚙**; Force shows **no gear**. Felling/Hallucinogenic take a value.
- [ ] **Felling(4)**: against a target with Unnatural Toughness (e.g. TB 5 incl. +2 unnatural), Apply Damage soaks as if TB were **3** (only the unnatural is stripped, down to 0); a target with no unnatural TB is unaffected.
- [ ] **Graviton**: Apply Damage with a Graviton weapon does **AP-more** damage at the struck location (e.g. vs Body AP 4, ~4 extra getting through) — effectively bypassing that armour.
- [ ] **Flame**: the damage card shows a **🔥 Flame → Agility Test** button; clicking opens the modifier dialog and rolls **Agility**.
- [ ] **Hallucinogenic(2)**: the damage card shows a **☣ Hallucinogenic (2)** button; clicking opens the dialog pre-filled **−20** and rolls **Toughness** (GM then rolls the table).
- [ ] **Flexible**: attacking a target with a Flexible weapon → the defender's **Evade offers only Dodge** (Parry is gone), with a note that it can't be parried.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + helpers (Task 1, TDD); Felling + Graviton soak (Task 2); Flame + Hallucinogenic buttons (Task 3); Flexible no-parry (Task 4). Force = config stub (Task 1). ✓

**Deferred (declared):** On-Fire / Hallucinogen condition auto-apply + the table; full Force/psyker handling.

**Placeholder scan:** complete; checklist concrete (Felling(4) vs TB5→3; Graviton vs AP4).

**Type/name consistency:** `qualityValue` backs `concussiveValue`/`fellingValue`/`hallucinogenicValue` (concussiveValue behaviour unchanged → its Plan-20 tests still pass). `felledToughnessBonus(tb, unnatural, X)` matches the Task-1 test + the `applyDamage` caller (reads `sys.characteristics.toughness.unnatural`). Graviton reads `ap[location]` (already computed in `applyDamage`). Flame/Hallucinogenic reuse `resolveDefender`/`promptTest`/`performTest`; their buttons are dispatched in `bindCardButtons`; the damage flags already carry `qualities`. Flexible reads `f.qualities` from the attack flags in `rollEvade`. The 3-tier ⚙ marker (Plan 19) reads `automation`, so gear state is automatic (Hallucinogenic = first `"partial"`/red).
