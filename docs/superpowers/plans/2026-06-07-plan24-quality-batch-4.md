# Better DH2e — Plan 24: Weapon Quality Batch 4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four weapon qualities — **Primitive(X)**, **Proven(X)**, **Razor Sharp** (black ⚙, full automation) and **Power Field** (no gear — config stub, narrative only).

**Architecture:** Razor Sharp extends the existing `effectivePenetration` (already called by `rollAttack`, like Lance/Melta) — Pen ×2 when DoS ≥ 3. Primitive/Proven transform every **damage die** (weapon, Accurate bonus, modifier dice) at the damage step: Primitive caps each die at X, Proven floors each die at X. The transform is folded into the hit total via `Roll.total + Σ(transform(die) − die)` (no operator re-parsing), so Tearing, RF-on-nat-10, the DoS-substitution, and flats all keep working; the breakdown shows the conversion (`9→7`). Power Field is config-only.

**Tech Stack:** Foundry v13, Vitest, Handlebars.

**Scope:** the four qualities. **Out of scope:** Power Field's weapon-destruction sub-mechanic (narrative/GM).

**Reference (confirmed):**
- **Primitive(X):** on damage, every die result over X counts as X (still rolls Righteous Fury on a natural 10, *then* converts).
- **Proven(X):** every die result below X counts as X. (Both apply to ALL damage dice, including Accurate/modifier dice.)
- **Razor Sharp:** if the attack scores **3+ DoS**, the damage roll's Penetration is doubled.
- **Power Field:** no automation (config stub).

Builds on Plan 17/20/22 (`qualityValue`, `effectivePenetration`, `formatRoll` with DoS-substitution + Tearing-drop display, the two-roll damage structure in `rollDamage`).

---

## File Structure

```
scripts/config.mjs                    MODIFY  add powerField; +automation on primitive/proven/razorSharp
scripts/helpers/quality-modules.mjs   MODIFY  primitiveValue, provenValue, transformDamageDie; effectivePenetration += razorSharp
test/quality-modules.test.mjs         MODIFY  tests for the new helpers + razorSharp
scripts/rolls/attack.mjs              MODIFY  rollDamage: Primitive/Proven die transform (formatRoll transform + delta + sub-on-transformed)
```

---

### Task 1: Config + pure helpers (TDD) — fully wires Razor Sharp + Power Field

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs): add `automation: "full"` to the EXISTING `primitive`, `proven`, and `razorSharp` entries (keep their `takesValue`: primitive/proven `true`, razorSharp `false`), and add:
```javascript
  powerField: { label: "Power Field", takesValue: false },
```
(`powerField` has no `automation` → no gear.)

- [ ] **Step 2: Failing tests.** In `test/quality-modules.test.mjs`, add `primitiveValue, provenValue, transformDamageDie` to the import, and append:
```javascript
describe("primitiveValue / provenValue", () => {
  it("read the numeric X (0 if absent/blank)", () => {
    expect(primitiveValue([{ key: "primitive", value: "6" }])).toBe(6);
    expect(provenValue([{ key: "proven", value: "3" }])).toBe(3);
    expect(primitiveValue(Q())).toBe(0);
    expect(provenValue([{ key: "proven", value: "" }])).toBe(0);
  });
});
describe("transformDamageDie", () => {
  it("Primitive caps at X; Proven floors at X; neither -> unchanged", () => {
    expect(transformDamageDie(9, { primitiveX: 7 })).toBe(7);
    expect(transformDamageDie(5, { primitiveX: 7 })).toBe(5);
    expect(transformDamageDie(10, { primitiveX: 7 })).toBe(7);
    expect(transformDamageDie(2, { provenX: 3 })).toBe(3);
    expect(transformDamageDie(5, { provenX: 3 })).toBe(5);
    expect(transformDamageDie(8, {})).toBe(8);
  });
});
describe("effectivePenetration with Razor Sharp", () => {
  it("doubles Pen at 3+ DoS on a hit only", () => {
    expect(effectivePenetration(4, { qualities: Q("razorSharp"), dos: 3, success: true, closeRange: false })).toBe(8);
    expect(effectivePenetration(4, { qualities: Q("razorSharp"), dos: 2, success: true, closeRange: false })).toBe(4);
    expect(effectivePenetration(4, { qualities: Q("razorSharp"), dos: 5, success: false, closeRange: false })).toBe(4);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`:
```javascript
export function primitiveValue(qualities) { return qualityValue(qualities, "primitive"); }
export function provenValue(qualities) { return qualityValue(qualities, "proven"); }

/** Primitive caps a damage die at X; Proven floors it at X (exclusive; Primitive wins if both somehow set). */
export function transformDamageDie(result, { primitiveX = 0, provenX = 0 } = {}) {
  if (primitiveX > 0) return Math.min(result, primitiveX);
  if (provenX > 0) return Math.max(result, provenX);
  return result;
}
```
And extend `effectivePenetration` (add the Razor Sharp line):
```javascript
export function effectivePenetration(basePen, { qualities, dos, success, closeRange }) {
  let pen = basePen;
  if (success && has(qualities, "lance")) pen *= dos;
  if (success && has(qualities, "razorSharp") && dos >= 3) pen *= 2;
  if (closeRange && has(qualities, "melta")) pen *= 2;
  return pen;
}
```

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: quality batch 4 config + primitive/proven helpers + Razor Sharp (effectivePenetration) (TDD)"
```
**Note:** Razor Sharp is now fully wired — `rollAttack` already calls `effectivePenetration(...)`. Power Field is config-only (no gear). Only Primitive/Proven need damage-step wiring (Task 2).

---

### Task 2: Wire Primitive / Proven into rollDamage

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import `primitiveValue, provenValue, transformDamageDie` (merge into the existing quality-modules import).

- [ ] **Step 2: `formatRoll` — add a transform + show the conversion.** The current `formatRoll(roll, subResult = null, dos = 0)` annotates dice. Replace its `ann` so non-substituted dice render their transformed value (and show `raw→eff` when changed), and add a `transform` param:
```javascript
function formatRoll(roll, subResult = null, dos = 0, transform = (v) => v) {
  const ann = (r) => {
    if (r === subResult) return `${r.result}(${dos} DoS)`;
    const v = transform(r.result);
    return v === r.result ? `${v}` : `${r.result}→${v}`;   // e.g. 9→7
  };
  return roll.terms.map((t) => {
    if (Array.isArray(t.results)) {
      if (t.results.some((r) => !r.active)) {
        return `[${t.results.map((r) => (r.active ? `<b>${ann(r)}</b>` : `${ann(r)}`)).join("|")}]`;
      }
      return t.results.filter((r) => r.active).map((r) => `[${ann(r)}]`).join("+");
    }
    if (t.operator) return t.operator;
    if (t.number !== undefined && t.number !== null) return String(t.number);
    return "";
  }).join("");
}
```
(Only the `ann` helper + the signature change; the term-walking logic is unchanged.)

- [ ] **Step 3: rollDamage — compute the transform, fold deltas into totals, run the sub on transformed values.** In `rollDamage`, after `const dos = f.dos ?? 0;`, add:
```javascript
  const primitiveX = primitiveValue(qualities);
  const provenX = provenValue(qualities);
  const transform = (v) => transformDamageDie(v, { primitiveX, provenX });
  const dieDelta = (roll) => {
    if (!roll) return 0;
    let d = 0;
    for (const die of roll.dice) for (const r of die.results) if (r.active) d += transform(r.result) - r.result;
    return d;
  };
```
Change the `rolled.push(...)` line so `baseTotal` includes the transform deltas:
```javascript
    rolled.push({ hit, wRoll, bRoll, rf, baseTotal: wRoll.total + (bRoll?.total ?? 0) + dieDelta(wRoll) + dieDelta(bRoll) });
```
Change the DoS-substitution selection + application to use the transformed values. In the `rolled.forEach(...)` scan, compare transformed values:
```javascript
        if (r.active && (subResult === null || transform(r.result) < transform(subResult.result))) { subResult = r; subHitIdx = i; }
```
Update the gate + the per-hit total + the breakdown calls to use the transform:
```javascript
  const applySub = subResult !== null && transform(subResult.result) < dos;
  const hits = rolled.map(({ hit, wRoll, bRoll, rf, baseTotal }, i) => {
    const sr = applySub && i === subHitIdx ? subResult : null;
    const total = baseTotal + (sr ? dos - transform(subResult.result) : 0);
    const bonusBreak = bRoll ? formatRoll(bRoll, sr, dos, transform) : "";
    const breakdown = formatRoll(wRoll, sr, dos, transform) + (bonusBreak ? `+${bonusBreak.replace(/^\+/, "")}` : "");
    return { index: hit.index, location: hit.location, label: hit.label, total, rf, breakdown };
  });
```
(Rationale: `baseTotal` becomes Σtransform(activeDie)+flats; the sub replaces one die's transformed contribution with `dos`. RF is still computed from the raw natural 10 on `wRoll` — unchanged. Tearing's dropped die is inactive → excluded from `dieDelta` and shown via the existing `|` path.)

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Primitive(X) caps / Proven(X) floors every damage die (RF on raw nat-10, breakdown shows raw→eff)"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (set qualities on the test weapons via item sheets):
- [ ] **Gear tiers**: Primitive, Proven, Razor Sharp show **black ⚙**; Power Field shows **no gear**. Primitive/Proven take a value.
- [ ] **Primitive(7)**: damage dice above 7 show `raw→7` (e.g. `[9→7]`) and the total uses the capped values; a die that rolls a natural **10** still shows **☠ Righteous Fury** and converts (`[10→7]`).
- [ ] **Proven(3)**: damage dice below 3 show `raw→3` (e.g. `[1→3]`) and the total uses the floored values; this includes the modifier/Accurate dice (give the weapon Accurate + aim to check the bonus dice are floored too).
- [ ] **Razor Sharp**: on a hit with **3+ DoS**, the damage card's **Pen** is doubled; with 1–2 DoS it's the base Pen.
- [ ] **DoS-substitution still works** alongside Primitive/Proven (the substituted die shows `raw(N DoS)` and the totals stay consistent).
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + helpers + Razor Sharp + Power Field (Task 1, TDD); Primitive/Proven die transform (Task 2). ✓

**Deferred (declared):** Power Field weapon-destruction (narrative).

**Placeholder scan:** complete; checklist concrete (Primitive(7) `[9→7]`; Razor Sharp ×2 at 3 DoS).

**Type/name consistency:** `primitiveValue`/`provenValue` use the existing `qualityValue`; `transformDamageDie` matches its test + the `transform`/`dieDelta` callers in rollDamage. `effectivePenetration` gains a Razor Sharp branch and is already invoked by `rollAttack` (so Razor Sharp needs no rollAttack change — the boosted Pen flows through the flags like Lance/Melta). `formatRoll` gains a 4th `transform` arg (default identity → all existing callers unaffected). The transform is folded into the total via `Roll.total + Σ(transform−raw)` (no operator re-parsing); the DoS-sub selection/gate/delta all use `transform(...)`; RF stays on the raw nat-10. The 3-tier ⚙ marker reads `automation` (primitive/proven/razorSharp = full → black; powerField = none → no gear).
