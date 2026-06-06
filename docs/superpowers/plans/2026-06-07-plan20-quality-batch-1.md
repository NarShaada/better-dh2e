# Better DH2e — Plan 20: Weapon Quality Batch 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five weapon qualities — **Concussive(X)** and **Defensive** (fully automated, black ⚙) and **Blast(X)**, **Corrosive**, **Crippling(X)** (not automated, shown as a red name+value note on the relevant chat card).

**Architecture:** Extend the existing quality registry/config + pure helpers (`quality-modules.mjs`) and the attack pipeline hook points. Defensive needs *no new wiring* — it just extends the two pure helpers the pipeline already calls (parry + to-hit). Concussive reuses the Shocking queued-Toughness-test pattern on the damage card. The note-only qualities are driven by a config `noteOn: "attack" | "damage"` flag that renders a red `Label (value)` line on that card.

**Tech Stack:** Foundry v13 (ChatMessage flags/buttons, `performTest`), Vitest, Handlebars.

**Scope:** the five qualities above. **Out of scope:** AoE templates for Blast, armour-state tracking for Corrosive, action-tracking for Crippling, auto-applying the Stunned condition (GM applies from the test result).

**Reference (confirmed):**
- **Concussive(X):** on a hit, the target makes a Toughness test at **−10·X**; on a failure they're **Stunned for (DoF) rounds**. Black gear. Damage-card button (works targeted or untargeted); GM applies the condition from the reported DoF.
- **Defensive:** **−10** to attacks made with it; **+15 Parry**. Black gear. Parry is a *per-weapon sum* (Balanced +10 / Defensive +15 / Unbalanced −10) then the **best single equipped weapon** wins (so Balanced+Defensive stack only on one weapon; two separate weapons don't stack).
- **Blast(X) / Corrosive / Crippling(X):** no automation — render a **red `Name (value)` note**: Blast on the **attack** card, Corrosive & Crippling on the **damage** card. No descriptive text.

Builds on Plan 17 (`quality-modules.mjs`: `qualityToHitMod`, `parryModifier`, `hasShocking`; the Shocking card + `shockTest` button) and the 3-tier ⚙ marker (Plan 19: config `automation`).

---

## File Structure

```
scripts/config.mjs                    MODIFY  add blast/concussive/corrosive/crippling/defensive to BDH.qualities
scripts/helpers/quality-modules.mjs   MODIFY  parryModifier +Defensive; qualityToHitMod −Defensive; new concussiveValue
test/quality-modules.test.mjs         MODIFY  Defensive + concussiveValue tests
scripts/rolls/attack.mjs              MODIFY  Concussive on damage card + concussiveTest button/handler; red notes on both cards
templates/chat/attack-card.hbs        MODIFY  red note line (noteOn:"attack")
templates/chat/damage-card.hbs        MODIFY  Concussive button + red note line (noteOn:"damage")
styles/better-dh2e.css                MODIFY  red note style
```

---

### Task 1: Config + pure helpers (TDD) — also fully wires Defensive

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs), add five entries (mind commas):
```javascript
  blast:      { label: "Blast", takesValue: true, noteOn: "attack" },
  concussive: { label: "Concussive", takesValue: true, automation: "full" },
  corrosive:  { label: "Corrosive", takesValue: false, noteOn: "damage" },
  crippling:  { label: "Crippling", takesValue: true, noteOn: "damage" },
  defensive:  { label: "Defensive", takesValue: false, automation: "full" },
```
(`automation: "full"` → black ⚙ on the item sheet, already handled by Plan 19's marker. `noteOn` drives the red card note; those have no `automation` → no gear.)

- [ ] **Step 2: Failing tests.** In `test/quality-modules.test.mjs`, add `concussiveValue` to the import line, and add:
```javascript
describe("parryModifier with Defensive", () => {
  it("Defensive is +15; sums with Balanced on ONE weapon; best single weapon wins across weapons", () => {
    expect(parryModifier([Q("defensive")])).toBe(15);
    expect(parryModifier([Q("balanced", "defensive")])).toBe(25);          // one weapon, both
    expect(parryModifier([Q("balanced"), Q("defensive")])).toBe(15);       // two weapons -> best (15)
    expect(parryModifier([Q("defensive", "unbalanced")])).toBe(5);         // 15 - 10
  });
});
describe("qualityToHitMod with Defensive", () => {
  it("Defensive is -10, and combines with Accurate", () => {
    expect(qualityToHitMod(Q("defensive"), { aiming: false })).toBe(-10);
    expect(qualityToHitMod(Q("accurate", "defensive"), { aiming: true })).toBe(0);  // +10 -10
    expect(qualityToHitMod(Q("accurate", "defensive"), { aiming: false })).toBe(-10);
  });
});
describe("concussiveValue", () => {
  it("returns the numeric X, or 0 if absent/blank", () => {
    expect(concussiveValue([{ key: "concussive", value: "2" }])).toBe(2);
    expect(concussiveValue([{ key: "concussive", value: "" }])).toBe(0);
    expect(concussiveValue(Q())).toBe(0);
    expect(concussiveValue([{ key: "tearing", value: "" }])).toBe(0);
  });
});
```
(`Q(...)` already exists in this file: `(...keys) => keys.map((key) => ({ key, value: "" }))`.)

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement.** In `scripts/helpers/quality-modules.mjs`:

Update `qualityToHitMod` to subtract 10 for Defensive:
```javascript
export function qualityToHitMod(qualities, { aiming }) {
  let mod = 0;
  if (aiming && has(qualities, "accurate")) mod += 10;
  if (has(qualities, "defensive")) mod -= 10;
  return mod;
}
```
Update `parryModifier` to add Defensive into the per-weapon sum:
```javascript
export function parryModifier(meleeWeaponQualityLists) {
  const mods = meleeWeaponQualityLists.map(
    (qs) => (has(qs, "balanced") ? 10 : 0) + (has(qs, "unbalanced") ? -10 : 0) + (has(qs, "defensive") ? 15 : 0)
  );
  return mods.length ? Math.max(...mods) : 0;
}
```
Add `concussiveValue`:
```javascript
/** The numeric X of a weapon's Concussive quality (0 if absent or blank). */
export function concussiveValue(qualities) {
  const q = Array.isArray(qualities) ? qualities.find((x) => x.key === "concussive") : null;
  return q ? (Number(q.value) || 0) : 0;
}
```
(If `qualityToHitMod` was previously a single-line return, replace it with the multi-line version above.)

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: quality batch 1 config + Defensive (parry +15 / attack -10) + concussiveValue (TDD)"
```
**Note:** Defensive is now fully wired — `rollAttack` already adds `qualityToHitMod(...)` and `rollEvade` already calls `parryModifier(...)`, so the −10 attack and +15 parry take effect with no further changes.

---

### Task 2: Wire Concussive (damage card + button)

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/damage-card.hbs`

- [ ] **Step 1:** Import `concussiveValue` (merge into the existing quality-modules import in attack.mjs).

- [ ] **Step 2: Damage card data.** In `rollDamage`, add the Concussive X to the card data (next to `shocking`):
```javascript
    concussive: concussiveValue(qualities) || null,
```
(`qualities = f.qualities ?? []` already exists in `rollDamage`.)

- [ ] **Step 3: Factor defender resolution + add the Concussive handler.** In `attack.mjs`, replace the body of `rollShockTest` to use a shared resolver, and add `rollConcussiveTest`:
```javascript
async function resolveDefender(f) {
  return (f.targetUuid ? await fromUuid(f.targetUuid) : null) ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
}
async function rollShockTest(message) {
  const defender = await resolveDefender(message.flags[NS]);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  return performTest(defender, { label: "Toughness (Shocking)", base: defender.system.characteristics.toughness.total, modifier: 0 });
}
async function rollConcussiveTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = concussiveValue(f.qualities);
  return performTest(defender, { label: `Toughness (Concussive ${x})`, base: defender.system.characteristics.toughness.total, modifier: -10 * x });
}
```

- [ ] **Step 4: Dispatch.** In `bindCardButtons`, add a branch next to the `shockTest` one:
```javascript
      else if (btn.dataset.bdh === "concussiveTest") await rollConcussiveTest(message);
```

- [ ] **Step 5: Template.** In `templates/chat/damage-card.hbs`, after the Shocking line, add:
```handlebars
  {{#if concussive}}<div class="bdh-card-line">⚡ Concussive ({{concussive}}) — Toughness test or Stunned: <button type="button" data-bdh="concussiveTest">Toughness Test</button></div>{{/if}}
```

- [ ] **Step 6: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/damage-card.hbs
git commit -m "feat: Concussive(X) — damage-card Toughness test at -10X (DoF = stun rounds)"
```

---

### Task 3: Red notes for Blast / Corrosive / Crippling

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/attack-card.hbs`, `templates/chat/damage-card.hbs`, `styles/better-dh2e.css`

- [ ] **Step 1: Helper to build notes.** In `attack.mjs`, add a small module-level helper that formats the `noteOn`-matching qualities of a quality list as `Label (value)` strings:
```javascript
/** Comma-joined "Label (value)" for the weapon qualities whose config noteOn matches `on` (red card note). */
function qualityNotes(qualities, on) {
  return (qualities ?? [])
    .filter((q) => CONFIG.BDH.qualities[q.key]?.noteOn === on)
    .map((q) => `${CONFIG.BDH.qualities[q.key].label}${q.value ? ` (${q.value})` : ""}`)
    .join(", ");
}
```

- [ ] **Step 2: Attack card (Blast).** In `rollAttack`, add to the attack card render data:
```javascript
    attackNotes: qualityNotes(weapon.system.qualities, "attack"),
```
In `templates/chat/attack-card.hbs`, after the existing `Qualities:` line, add:
```handlebars
  {{#if attackNotes}}<div class="bdh-card-line bdh-qnote">{{attackNotes}}</div>{{/if}}
```

- [ ] **Step 3: Damage card (Corrosive / Crippling).** In `rollDamage`, add to the card data:
```javascript
    damageNotes: qualityNotes(qualities, "damage"),
```
In `templates/chat/damage-card.hbs`, add (e.g. after the hits list):
```handlebars
  {{#if damageNotes}}<div class="bdh-card-line bdh-qnote">{{damageNotes}}</div>{{/if}}
```

- [ ] **Step 4: CSS.** Append to `styles/better-dh2e.css`:
```css

/* Non-automated weapon-quality note on a chat card (just the name+value, in red) */
.better-dh2e .bdh-qnote, .chat-message .bdh-qnote { color:#a02020; font-weight:600; }
```
(Include the `.chat-message` selector so it applies inside the chat log, matching how the other card classes are scoped.)

- [ ] **Step 5: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/attack-card.hbs templates/chat/damage-card.hbs styles/better-dh2e.css
git commit -m "feat: red name+value notes for Blast (attack card), Corrosive/Crippling (damage card)"
```

---

### Task 4: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (set the qualities on the test weapons via their item sheets):
- [ ] **Item sheet gear tier**: Concussive + Defensive show a **black ⚙**; Blast, Corrosive, Crippling show **no gear**. Blast/Concussive/Crippling accept a value (X); Corrosive/Defensive don't.
- [ ] **Defensive**: attacking with a Defensive weapon shows **−10** in the attack card Modifier; **Evade → Parry** with it equipped is **+15**. A weapon that's Balanced+Defensive parries **+25**; a Balanced weapon + a separate Defensive weapon parries **+15** (best, not stacked).
- [ ] **Concussive(2)**: the damage card shows a **Concussive (2)** Toughness-Test button; clicking rolls the target's Toughness at **−20** and the result card's DoF = stun rounds. Works with no target (uses your selected token).
- [ ] **Blast(3)**: the **attack** card shows a red **"Blast (3)"** note.
- [ ] **Corrosive / Crippling(1)**: the **damage** card shows a red **"Corrosive, Crippling (1)"** note.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + Defensive (fully wired via helper updates) + concussiveValue (Task 1, TDD); Concussive damage-card button (Task 2); Blast/Corrosive/Crippling red notes (Task 3). ✓ Accurate + Balanced already shipped (Plan 17).

**Deferred (declared):** Blast AoE templates, Corrosive armour-state, Crippling action-tracking, auto-applying Stunned.

**Placeholder scan:** complete; checklist concrete (Defensive +25 vs +15, Concussive(2) → −20).

**Type/name consistency:** `parryModifier`/`qualityToHitMod` updates match the Task-1 tests + their existing callers (`rollEvade`, `rollAttack`) — no new call sites needed for Defensive. `concussiveValue` matches its test + `rollDamage`/`rollConcussiveTest`. `resolveDefender` factored and used by both `rollShockTest` and `rollConcussiveTest`; `concussiveTest` dispatched in `bindCardButtons`. Damage flags already carry `qualities` (Plan 17/18) so `rollConcussiveTest` reads X. Red notes are config-driven (`noteOn`) and render `Label (value)` only. The 3-tier ⚙ marker (Plan 19) already reads `automation`, so the new qualities' gear state is automatic.
