# Better DH2e — Plan 26: Multi-Hit Location Table + Quality Batch 5

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Replace the placeholder multiple-hits location sequence with the confirmed DH2e table (per-category, side-tracking, 6th+ repeats the 5th). (2) Add six weapon qualities — **Scatter**, **Snare(X)**, **Storm** (black ⚙), **Smoke(X)**, **Spray** (no gear, red note), **Sanctified** (no gear, narrative).

**Architecture:** The hit-location sequence is a pure function (`locationSequence`) — rewrite it to a per-category template resolved to a specific left/right side from the first hit. Qualities wire at existing hooks: Scatter (range-based to-hit in `rollAttack` + a flat damage delta carried in the attack flags and applied in `rollDamage`), Storm (×2 ammo + double-then-cap hits in `rollAttack`), Snare (damage-card Agility-test button like Concussive/Flame). Smoke/Spray are config red notes; Sanctified is a config stub.

**Tech Stack:** Foundry v13, Vitest, Handlebars.

**Scope:** the table + six qualities. **Out of scope:** Spray cone/Smoke cloud templates (manual), Sanctified's conditional damage (narrative).

**Reference (confirmed):**
- **Hit-location bands** (already correct, no change): 01-10 Head, 11-20 R Arm, 21-30 L Arm, 31-70 Body, 71-85 R Leg, 86-100 L Leg (reversed d100).
- **Multiple-hits sequence** (NEW), by first-hit category, side = first hit's side (Body/Head → Right):
  - Head → Head, Arm, Body, Arm, Body
  - Arm → Arm, Body, Head, Body, Arm
  - Body → Body, Arm, Head, Arm, Body
  - Leg → Leg, Body, Arm, Head, Body
  - 6th and further hits = the 5th entry's location.
- **Scatter:** +10 hit at Point-Blank & Short; damage +3 at Point-Blank, +0 at Short, −3 at Normal/Long/Extreme.
- **Snare(X):** on hit, Agility test at −10·X or Immobilised (damage-card button).
- **Storm:** ×2 ammo expended; hit count doubled then capped at RoF (Standard → 2; Semi → 2 per 2 DoS; Full → 2 per 1 DoS).
- **Smoke(X) / Spray:** red `Name (value)` note (attack card). **Sanctified:** no note.

Builds on Plan 16 (`locationSequence`, `computeHits`), Plan 20–25 (`qualityValue`, `qualityNotes`/`noteOn`, the damage-card resist buttons + `resolveDefender`/`promptTest`, the `rounds`/`nHits`/`effectivePenetration`/`weaponBase` wiring).

---

## File Structure

```
scripts/helpers/attack-math.mjs       MODIFY  locationSequence → new per-category, side-tracking table
test/attack-math.test.mjs             MODIFY  locationSequence tests for the new table
scripts/config.mjs                    MODIFY  add sanctified, scatter, smoke, snare, spray; +automation on storm
scripts/helpers/quality-modules.mjs   MODIFY  scatterToHit, scatterDamage, snareValue, hasStorm
test/quality-modules.test.mjs         MODIFY  tests for the new helpers
scripts/rolls/attack.mjs              MODIFY  rollAttack: Scatter to-hit + scatterDmg flag, Storm ammo/hits; rollDamage: Scatter flat + Snare button/handler
templates/chat/damage-card.hbs        MODIFY  Snare line
```

---

### Task 1: Multi-hit location table (TDD)

**Files:** `scripts/helpers/attack-math.mjs`, `test/attack-math.test.mjs`

- [ ] **Step 1: Update tests.** In `test/attack-math.test.mjs`, replace the existing `locationSequence` test(s) with the new table:
```javascript
describe("locationSequence (multi-hit table, side tracks first hit)", () => {
  it("Body-first: Body, R Arm, Head, R Arm, Body", () => {
    expect(locationSequence("body", 5)).toEqual(["body", "rightArm", "head", "rightArm", "body"]);
  });
  it("Left-Arm-first tracks the left side", () => {
    expect(locationSequence("leftArm", 5)).toEqual(["leftArm", "body", "head", "body", "leftArm"]);
  });
  it("Right-Leg-first", () => {
    expect(locationSequence("rightLeg", 5)).toEqual(["rightLeg", "body", "rightArm", "head", "body"]);
  });
  it("Head-first; 6th+ repeats the 5th", () => {
    expect(locationSequence("head", 6)).toEqual(["head", "rightArm", "body", "rightArm", "body", "body"]);
  });
  it("single hit is just the rolled location", () => {
    expect(locationSequence("leftLeg", 1)).toEqual(["leftLeg"]);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/attack-math.test.mjs`.

- [ ] **Step 3: Implement.** In `scripts/helpers/attack-math.mjs`, replace the `SEQ` const and `locationSequence` with:
```javascript
// Multiple-hits sequence by first-hit category (generic limbs resolved to the first hit's side).
const MULTI_SEQ = {
  head: ["head", "arm", "body", "arm", "body"],
  arm:  ["arm", "body", "head", "body", "arm"],
  body: ["body", "arm", "head", "arm", "body"],
  leg:  ["leg", "body", "arm", "head", "body"]
};
const categoryOf = (loc) =>
  loc === "head" ? "head" : loc === "body" ? "body"
  : (loc === "rightArm" || loc === "leftArm") ? "arm" : "leg";
const sideOf = (loc) => (loc === "leftArm" || loc === "leftLeg") ? "left" : "right";   // Body/Head -> right
const resolveLoc = (generic, side) =>
  generic === "head" ? "head" : generic === "body" ? "body"
  : generic === "arm" ? `${side}Arm` : `${side}Leg`;

/** Locations for `count` hits: first as rolled; subsequent follow the category sequence
 *  (limbs use the first hit's side); the 6th and further hits repeat the 5th. */
export function locationSequence(first, count) {
  const tmpl = MULTI_SEQ[categoryOf(first)];
  const side = sideOf(first);
  return Array.from({ length: count }, (_, i) => resolveLoc(tmpl[Math.min(i, tmpl.length - 1)], side));
}
```
(`side` capitalization: `${side}Arm` → `"rightArm"`/`"leftArm"` — matches the location keys. `tmpl[0]` always resolves to `first` itself, so hit 1 = the rolled location.)

- [ ] **Step 4: Run — PASS.** `npx vitest run test/attack-math.test.mjs`, then `npm test`.

- [ ] **Step 5: Commit.**
```bash
git add scripts/helpers/attack-math.mjs test/attack-math.test.mjs
git commit -m "feat: confirmed multiple-hits location table (per-category, side tracks first hit, 6th+ repeats 5th)"
```

---

### Task 2: Config + quality helpers (TDD)

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs): add `automation: "full"` to the EXISTING `storm` entry, and add (mind commas):
```javascript
  sanctified: { label: "Sanctified", takesValue: false },
  scatter:    { label: "Scatter", takesValue: false, automation: "full" },
  smoke:      { label: "Smoke", takesValue: true, noteOn: "attack" },
  snare:      { label: "Snare", takesValue: true, automation: "full" },
  spray:      { label: "Spray", takesValue: false, noteOn: "attack" },
```
(`sanctified` → no gear, no note; `smoke`/`spray` → no gear, red note; `scatter`/`snare`/`storm` → black ⚙.)

- [ ] **Step 2: Failing tests.** In `test/quality-modules.test.mjs`, add `scatterToHit, scatterDamage, snareValue, hasStorm` to the import, and append:
```javascript
describe("scatterToHit", () => {
  it("+10 at Point-Blank/Short only", () => {
    expect(scatterToHit(Q("scatter"), "pointBlank")).toBe(10);
    expect(scatterToHit(Q("scatter"), "short")).toBe(10);
    expect(scatterToHit(Q("scatter"), "normal")).toBe(0);
    expect(scatterToHit(Q(), "pointBlank")).toBe(0);
  });
});
describe("scatterDamage", () => {
  it("+3 PB, 0 Short, -3 Normal/Long/Extreme, 0 otherwise/no-scatter", () => {
    expect(scatterDamage(Q("scatter"), "pointBlank")).toBe(3);
    expect(scatterDamage(Q("scatter"), "short")).toBe(0);
    expect(scatterDamage(Q("scatter"), "normal")).toBe(-3);
    expect(scatterDamage(Q("scatter"), "long")).toBe(-3);
    expect(scatterDamage(Q("scatter"), "extreme")).toBe(-3);
    expect(scatterDamage(Q("scatter"), undefined)).toBe(0);
    expect(scatterDamage(Q(), "normal")).toBe(0);
  });
});
describe("snareValue / hasStorm", () => {
  it("snareValue reads X; hasStorm detects Storm", () => {
    expect(snareValue([{ key: "snare", value: "2" }])).toBe(2);
    expect(snareValue(Q())).toBe(0);
    expect(hasStorm(Q("storm"))).toBe(true);
    expect(hasStorm(Q())).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`:
```javascript
/** Scatter to-hit: +10 at Point-Blank or Short range. */
export function scatterToHit(qualities, range) {
  if (!has(qualities, "scatter")) return 0;
  return (range === "pointBlank" || range === "short") ? 10 : 0;
}
/** Scatter flat damage: +3 Point-Blank, 0 Short, -3 Normal/Long/Extreme (0 for melee/unknown). */
export function scatterDamage(qualities, range) {
  if (!has(qualities, "scatter")) return 0;
  if (range === "pointBlank") return 3;
  if (range === "short") return 0;
  if (range === "normal" || range === "long" || range === "extreme") return -3;
  return 0;
}
export function snareValue(qualities) { return qualityValue(qualities, "snare"); }
export function hasStorm(qualities) { return has(qualities, "storm"); }
```

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: quality batch 5 config + scatter/snare/storm helpers (TDD)"
```

---

### Task 3: Wire Scatter (to-hit) + Storm (ammo + hits) in rollAttack

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import `scatterToHit, scatterDamage, hasStorm` (merge into the quality-modules import).

- [ ] **Step 2:** Near the existing `const maximal = ...;`, add:
```javascript
  const storm = hasStorm(weapon.system.qualities);
```

- [ ] **Step 3: Scatter to-hit.** In the modifier combine, add a Scatter term (range-based). Define it and include it in `rawModifier`:
```javascript
  const scatterMod = scatterToHit(weapon.system.qualities, choice.range);
```
Add `+ scatterMod` to the `rawModifier` sum (alongside the other mods).

- [ ] **Step 4: Storm ammo ×2.** Update the `rounds` line to also multiply for Storm:
```javascript
  const rounds = (at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : (weapon.system.rateOfFire?.single || 1)) * (maximal ? 3 : 1) * (storm ? 2 : 1);
```

- [ ] **Step 5: Storm hits ×2 (capped at RoF).** Replace the `nHits` computation:
```javascript
  let nHits = success ? computeHits(at, dos, storm ? Infinity : rofCap) : 0;
  if (storm && success) nHits = Math.min(nHits * 2, rofCap);
```
(For Standard, `rofCap` is `Infinity` → `min(2, Infinity) = 2`. For Semi/Full, the doubled uncapped count is capped at the weapon's Short/Long RoF.)

- [ ] **Step 6: Scatter damage flag.** Compute the flat Scatter damage and store it in the attack flags for the damage step:
```javascript
  const scatterDmg = scatterDamage(weapon.system.qualities, choice.range);
```
and add `scatterDmg,` to the `flags[NS]` object.

- [ ] **Step 7: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Scatter to-hit (+10 PB/Short) + Storm (×2 ammo, double-then-cap hits)"
```

---

### Task 4: Wire Scatter damage + Snare (rollDamage + card)

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/damage-card.hbs`

- [ ] **Step 1:** Import `snareValue` (merge into the quality-modules import).

- [ ] **Step 2: Scatter flat damage.** In `rollDamage`, after `weaponBase` is built (including the Maximal `+1d10` line), apply the carried Scatter delta:
```javascript
  if (f.scatterDmg) weaponBase = `${weaponBase} ${f.scatterDmg > 0 ? "+" : "-"} ${Math.abs(f.scatterDmg)}`;
```
(So `1d10+3` becomes `1d10+3 + 3` at Point-Blank or `1d10+3 - 3` at long range. Tearing still only transforms the leading base die.)

- [ ] **Step 3: Snare card data.** In `rollDamage`'s `cardData`, add (next to `concussive`/`flame`):
```javascript
    snare: snareValue(qualities) || null,
```

- [ ] **Step 4: Snare handler.** Add next to `rollConcussiveTest` (Agility test at −10·X → Immobilised):
```javascript
async function rollSnareTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Agility."); return; }
  const x = snareValue(f.qualities);
  const label = `Agility (Snare ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.agility.total, modifier: choice.modifier });
}
```

- [ ] **Step 5: Dispatch.** In `bindCardButtons`, add:
```javascript
      else if (btn.dataset.bdh === "snareTest") await rollSnareTest(message);
```

- [ ] **Step 6: Template.** In `templates/chat/damage-card.hbs`, after the Hallucinogenic line, add:
```handlebars
  {{#if snare}}<div class="bdh-card-line">🕸 Snare ({{snare}}) — Agility test or Immobilised: <button type="button" data-bdh="snareTest">Agility Test</button></div>{{/if}}
```

- [ ] **Step 7: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/damage-card.hbs
git commit -m "feat: Scatter flat damage (range-based) + Snare(X) damage-card Agility test (Immobilised)"
```

---

### Task 5: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (set qualities on test weapons):
- [ ] **Multi-hit table**: a Storm/full-auto with several hits lands locations per the new sequence (e.g. first Body → `Body, R Arm, Head, R Arm, Body, …`; first L Arm tracks the left side); 6th+ hits repeat the 5th.
- [ ] **Gear tiers**: Scatter, Snare, Storm → **black ⚙**; Smoke, Spray → **no gear**; Sanctified → **no gear, no note**.
- [ ] **Scatter**: at **Point-Blank** the attack card shows +10 and the damage card +3; at **Short** +10 hit / +0 damage; at **Normal/Long/Extreme** no to-hit and −3 damage.
- [ ] **Storm**: a Standard shot yields **2 hits** and consumes **×2 ammo**; Semi/Full double the hits up to the weapon's RoF.
- [ ] **Snare(2)**: the damage card shows a **🕸 Snare (2)** button → Agility test pre-filled **−20**.
- [ ] **Smoke(3) / Spray**: red **"Smoke (3)" / "Spray"** note on the attack card.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** multi-hit table (Task 1, TDD); config + helpers (Task 2, TDD); Scatter to-hit + Storm ammo/hits (Task 3); Scatter flat damage + Snare button (Task 4). Smoke/Spray = config notes; Sanctified = config stub. ✓

**Deferred (declared):** Spray/Smoke templates; Sanctified conditional damage.

**Placeholder scan:** complete; checklist concrete (Body→Body,R Arm,Head,…; Scatter ±3; Storm 2 hits ×2 ammo).

**Type/name consistency:** `locationSequence` returns existing location keys (`rightArm`/`leftLeg`/…) via `${side}Arm`; `tmpl[0]` resolves to the first hit; 6th+ → `tmpl[4]`. `scatterToHit`/`scatterDamage` keyed off `choice.range` (melee → 0). Storm uses `computeHits(...,Infinity)` for the uncapped count then `min(×2, rofCap)`; `rounds` multiplies `(storm?2:1)` alongside `(maximal?3:1)`. `scatterDmg` carried in the attack flags → applied to `weaponBase` in `rollDamage` (after Maximal `+1d10`). Snare reuses `resolveDefender`/`promptTest`/`performTest` (Agility, −10·X) + `bindCardButtons` dispatch; `snareValue` via `qualityValue`. The 3-tier ⚙ marker reads `automation` (scatter/snare/storm = full; smoke/spray/sanctified = none; smoke/spray have `noteOn` for the red note).
