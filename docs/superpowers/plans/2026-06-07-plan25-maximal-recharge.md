# Better DH2e — Plan 25: Maximal + Recharge qualities

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add **Maximal** (black ⚙) — a per-shot fire mode chosen via a checkbox in the attack dialog: +1d10 damage, +2 Pen, ×3 ammo, +2 Blast, grants Recharge, +10 m range (narrative). And **Recharge** (no gear) — a red note (we don't model action economy).

**Architecture:** Maximal is a per-attack choice, so it lives as a conditional **checkbox in the attack dialog** (shown only for Maximal weapons) — `FormDataExtended` yields `choice.maximal`. The mechanical effects wire at the points they already exist: ammo (`rounds × 3`), penetration (`basePen + 2` before the Lance/Razor/Melta multipliers in `effectivePenetration`), and damage (`+1d10` weapon die in `rollDamage`, RF-eligible). Blast +2 / "Maximal" / "Recharge" surface through the existing red-note builder (`qualityNotes`) made Maximal-aware. The dialog checkbox is structured so more per-shot toggles can be added the same way later.

**Tech Stack:** Foundry v13 (DialogV2 + FormDataExtended), Vitest, Handlebars.

**Scope:** Maximal + Recharge. **Out of scope:** enforcing Recharge's cooldown (no action economy); deriving range bands from token distance (so +10 m range is narrative).

**Reference (confirmed):**
- **Maximal** (per-shot checkbox): +1d10 damage (RF-eligible weapon die), +2 Pen, ×3 ammo (blocked if the clip can't cover it), +2 Blast (note), grants Recharge (note), +10 m range (narrative note only).
- **Recharge:** no gear — red "Recharge" note on the attack card.

Builds on Plan 22/24 (`effectivePenetration`, the attack dialog, `qualityNotes`/`noteOn`, ammo `rounds`/clip, the `rollDamage` weaponBase).

---

## File Structure

```
scripts/config.mjs                    MODIFY  add maximal (automation:"full"), recharge (noteOn:"attack")
scripts/helpers/quality-modules.mjs   MODIFY  hasMaximal
test/quality-modules.test.mjs         MODIFY  hasMaximal test
scripts/rolls/attack.mjs              MODIFY  dialog Maximal checkbox; rounds×3; basePen+2; flags.maximal; rollDamage +1d10; qualityNotes Maximal-aware
```

---

### Task 1: Config + helper (TDD)

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs), add (mind commas):
```javascript
  maximal:    { label: "Maximal", takesValue: false, automation: "full" },
  recharge:   { label: "Recharge", takesValue: false, noteOn: "attack" },
```

- [ ] **Step 2: Failing test.** In `test/quality-modules.test.mjs`, add `hasMaximal` to the import and append:
```javascript
describe("hasMaximal", () => {
  it("detects Maximal", () => {
    expect(hasMaximal(Q("maximal"))).toBe(true);
    expect(hasMaximal(Q())).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`:
```javascript
export function hasMaximal(qualities) { return has(qualities, "maximal"); }
```

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: Maximal + Recharge config + hasMaximal helper (TDD)"
```

---

### Task 2: Wire Maximal (dialog checkbox + effects) + Recharge note

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import `hasMaximal` (merge into the existing quality-modules import).

- [ ] **Step 2: Dialog checkbox.** In `rollAttack`, build a conditional Maximal row and add it to `dialogContent` (a per-shot toggle; more can be added the same way later). After the other `*Opts` builders, add:
```javascript
  const maximalRow = hasMaximal(weapon.system.qualities)
    ? `<div class="form-group"><label>Maximal (×3 ammo)</label><input type="checkbox" name="maximal"/></div>` : "";
```
and append `${maximalRow}` to the end of the `dialogContent` template string. (`FormDataExtended` yields `choice.maximal` as a boolean.)

- [ ] **Step 3: Read the choice + effects.** After `if (!choice) return null;`, add:
```javascript
  const maximal = isRanged && !!choice.maximal;
```
**Ammo ×3:** where `rounds` is computed for the ammo check, multiply when maximal:
```javascript
  const rounds = (at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : (weapon.system.rateOfFire?.single || 1)) * (maximal ? 3 : 1);
```
(Adapt to the existing `rounds` line — the ammo block check + the post-message deduct both use `rounds`, so multiplying here covers both.)

**Pen +2 (before multipliers):** in the `effectivePenetration(...)` call, add 2 to the base when maximal:
```javascript
  const penetration = effectivePenetration((weapon.system.penetration ?? 0) + (maximal ? 2 : 0), {
    qualities: weapon.system.qualities, dos, success,
    closeRange: ["pointBlank", "short"].includes(choice.range)
  });
```

**Flags:** add `maximal,` to the `flags[NS]` object (so `rollDamage` can add the +1d10).

- [ ] **Step 4: Maximal-aware notes.** Replace `qualityNotes` with a version that bumps Blast and adds the Maximal/Recharge indicators on the attack card:
```javascript
function qualityNotes(qualities, on, { maximal = false } = {}) {
  const items = (qualities ?? [])
    .filter((q) => CONFIG.BDH.qualities[q.key]?.noteOn === on)
    .map((q) => {
      let v = q.value;
      if (maximal && q.key === "blast" && v) v = String(Number(v) + 2);   // Maximal: +2 Blast
      return `${CONFIG.BDH.qualities[q.key].label}${v ? ` (${v})` : ""}`;
    });
  if (maximal && on === "attack") {
    items.unshift("Maximal");
    if (!qualities?.some((q) => q.key === "recharge")) items.push("Recharge");   // Maximal grants Recharge
  }
  return items.join(", ");
}
```
Then in `rollAttack`, pass `maximal` to the attack-card note builder:
```javascript
    attackNotes: qualityNotes(weapon.system.qualities, "attack", { maximal }),
```
(The `rollDamage` call `qualityNotes(qualities, "damage")` is unaffected — `maximal` defaults false and the extras are gated to `on === "attack"`.)

- [ ] **Step 5: Damage +1d10.** In `rollDamage`, where `weaponBase` is built (currently `craftDmg ? \`${baseFormula} + ${craftDmg}\` : baseFormula`), append the Maximal die when the attack was Maximal:
```javascript
  let weaponBase = craftDmg ? `${baseFormula} + ${craftDmg}` : baseFormula;
  if (f.maximal) weaponBase = `${weaponBase} + 1d10`;
```
(The +1d10 rides in the weapon roll → RF-eligible; Tearing still transforms the leading base die term only.)

- [ ] **Step 6: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Maximal fire mode (dialog checkbox: +1d10/+2 Pen/×3 ammo/+2 Blast/Recharge) + Recharge note"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (give the Boltgun/Autogun test weapon **Maximal** + a clip; give one weapon **Recharge**, and one **Maximal + Blast(2)**):
- [ ] **Gear tiers**: Maximal shows **black ⚙**; Recharge shows **no gear**.
- [ ] **Maximal checkbox**: the attack dialog shows a **Maximal** checkbox only for Maximal weapons (not on others).
- [ ] **Unchecked** = a normal shot (no changes).
- [ ] **Checked**: the shot consumes **×3 rounds** (blocked if the clip can't cover it); the damage card includes an extra **+1d10** weapon die (RF-eligible); the damage card **Pen is +2** (before any Lance/Razor/Melta); the attack card shows a red **"Maximal, …, Recharge"** note; a **Blast(2)** weapon reads **Blast (4)** when Maximal.
- [ ] **Recharge** (standalone quality): red **"Recharge"** note on the attack card.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + helper (Task 1, TDD); dialog checkbox + ammo×3 + Pen+2 + flags + notes + damage +1d10 (Task 2). ✓ Recharge = config note.

**Deferred (declared):** Recharge cooldown enforcement; range-band-from-distance (so +10 m range is narrative).

**Placeholder scan:** complete; checklist concrete (×3 ammo, +1d10, Blast 2→4).

**Type/name consistency:** `hasMaximal` matches its test + the dialog/effect callers. `choice.maximal` comes from the checkbox via `FormDataExtended` (boolean); guarded by `isRanged`. `rounds × 3`, `basePen + 2` (fed into the existing `effectivePenetration`), and `flags.maximal` → `rollDamage` `weaponBase + " + 1d10"` (RF-eligible; Tearing still hits the leading term). `qualityNotes` gains an optional `{ maximal }` (default false → `rollDamage`'s damage-note call unchanged); the Maximal/Recharge extras + Blast+2 are gated to `on === "attack"`. The 3-tier ⚙ marker reads `automation` (maximal = full → black; recharge = none → no gear). The Maximal dialog row is a conditional `form-group`, so future per-shot toggles slot in the same way.
