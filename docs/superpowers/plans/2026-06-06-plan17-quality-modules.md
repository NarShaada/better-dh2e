# Better DH2e — Plan 17: Weapon Quality Modules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate seven weapon qualities on the attack pipeline, each a registered hook proving a reusable effect-pattern: **Accurate** (to-hit + bonus damage), **Tearing** (damage dice), **Reliable/Unreliable** (jam), **Balanced/Unbalanced** (parry), **Shocking** (queued Toughness test). Qualities are listed on the attack card; unimplemented ones are flagged.

**Architecture:** A pure, unit-tested module (`quality-modules.mjs`) exposes keyed aggregate functions (to-hit mod, jam floor, weapon-damage formula, Accurate bonus dice, parry mod, Shocking flag) that the Plan-16 attack flow calls at its existing stage points. Accurate's bonus dice and the damage modifier are rolled as a **separate non-RF roll** so Righteous Fury is checked on the **weapon dice only**; the card's `[d]+flat` breakdown concatenates both.

**Tech Stack:** Foundry v13 (Roll keep-highest `khN`, ChatMessage flags/buttons), Vitest, Handlebars.

**Scope:** the 7 modules + their wiring + listing qualities on the card. **Out of scope:** the other qualities (Proven/Primitive/Razor Sharp/Felling/Storm/Twin-Linked/Flexible/Unwieldy — stored + flagged only); crit tables (P1); evade DoS auto-negation (P3).

**Reference:** spec §3 (quality registry, graceful degradation) + §11a (the 7 modules' exact behaviour). Builds on Plan 16 (`scripts/rolls/attack.mjs`: `rollAttack`/`rollDamage`/`rollEvade`/`applyDamage`/`bindCardButtons`/`formatRoll`; attack/damage cards). Weapon qualities are stored as `system.qualities = [{key, value}]`.

---

## File Structure

```
scripts/config.mjs                       MODIFY  add balanced/unbalanced/shocking to BDH.qualities
scripts/helpers/quality-modules.mjs      NEW     pure: toHit / jamFloor / weaponDamageFormula / accurateBonusDice / parryModifier / hasShocking / tearingFormula
test/quality-modules.test.mjs            NEW     Vitest
scripts/rolls/attack.mjs                 MODIFY  call modules at to-hit / damage / evade / apply; store aiming+dos+qualities in flags; shockTest button
templates/chat/attack-card.hbs           MODIFY  list qualities
templates/chat/damage-card.hbs           MODIFY  (none required; breakdown already shows bonus dice)
```

---

### Task 1: Quality config + pure modules (TDD)

**Files:** `scripts/config.mjs`; create `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1:** In `scripts/config.mjs`, add three keys to `BDH.qualities` (so they're selectable on the weapon sheet):
```javascript
  balanced:   { label: "Balanced", takesValue: false },
  unbalanced: { label: "Unbalanced", takesValue: false },
  shocking:   { label: "Shocking", takesValue: false },
```
(insert inside the existing `BDH.qualities = { ... }` object; mind commas.)

- [ ] **Step 2: Failing test** `test/quality-modules.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { tearingFormula, qualityToHitMod, qualityJamFloor, accurateBonusDice, weaponDamageFormula, parryModifier, hasShocking } from "../scripts/helpers/quality-modules.mjs";

const Q = (...keys) => keys.map((key) => ({ key, value: "" }));

describe("tearingFormula", () => {
  it("adds a die and keeps highest of the first dice term", () => {
    expect(tearingFormula("1d10+3")).toBe("2d10kh1+3");
    expect(tearingFormula("2d10")).toBe("3d10kh2");
  });
});
describe("qualityToHitMod", () => {
  it("Accurate gives +10 only when aiming", () => {
    expect(qualityToHitMod(Q("accurate"), { aiming: true })).toBe(10);
    expect(qualityToHitMod(Q("accurate"), { aiming: false })).toBe(0);
    expect(qualityToHitMod(Q(), { aiming: true })).toBe(0);
  });
});
describe("qualityJamFloor", () => {
  it("Reliable 100, Unreliable 91, else base 94", () => {
    expect(qualityJamFloor(Q("reliable"))).toBe(100);
    expect(qualityJamFloor(Q("unreliable"))).toBe(91);
    expect(qualityJamFloor(Q())).toBe(94);
  });
});
describe("accurateBonusDice", () => {
  it("+1d10 per 2 DoS, capped 2, ranged+aiming only", () => {
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 4 })).toBe("2d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 2 })).toBe("1d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 6 })).toBe("2d10");
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: true, dos: 1 })).toBeNull();
    expect(accurateBonusDice(Q("accurate"), { isRanged: true, aiming: false, dos: 4 })).toBeNull();
    expect(accurateBonusDice(Q("accurate"), { isRanged: false, aiming: true, dos: 4 })).toBeNull();
    expect(accurateBonusDice(Q(), { isRanged: true, aiming: true, dos: 4 })).toBeNull();
  });
});
describe("weaponDamageFormula", () => {
  it("applies Tearing only when present", () => {
    expect(weaponDamageFormula(Q("tearing"), "1d10+3")).toBe("2d10kh1+3");
    expect(weaponDamageFormula(Q(), "1d10+3")).toBe("1d10+3");
  });
});
describe("parryModifier", () => {
  it("best of the defender's melee weapons (Balanced +10 / Unbalanced -10)", () => {
    expect(parryModifier([Q("balanced")])).toBe(10);
    expect(parryModifier([Q("unbalanced")])).toBe(-10);
    expect(parryModifier([Q("balanced"), Q("unbalanced")])).toBe(10);
    expect(parryModifier([])).toBe(0);
  });
});
describe("hasShocking", () => {
  it("detects Shocking", () => {
    expect(hasShocking(Q("shocking"))).toBe(true);
    expect(hasShocking(Q())).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** `scripts/helpers/quality-modules.mjs`:
```javascript
// scripts/helpers/quality-modules.mjs — PURE. Weapon-quality effect modules (registry of keyed behaviours).

const has = (qualities, key) => Array.isArray(qualities) && qualities.some((q) => q.key === key);

/** Tearing: add one die to the first dice term and keep the highest (drop the lowest). */
export function tearingFormula(formula) {
  return formula.replace(/(\d+)d(\d+)/, (m, n, faces) => `${Number(n) + 1}d${faces}kh${n}`);
}

/** To-hit modifier from qualities (Accurate: +10 when aiming). */
export function qualityToHitMod(qualities, { aiming }) {
  return aiming && has(qualities, "accurate") ? 10 : 0;
}

/** Jam floor (Reliable 100, Unreliable 91, else the base floor). */
export function qualityJamFloor(qualities, base = 94) {
  if (has(qualities, "reliable")) return 100;
  if (has(qualities, "unreliable")) return 91;
  return base;
}

/** Accurate bonus damage dice (+1d10 per 2 DoS, capped +2d10; ranged & aiming only). Formula string or null. */
export function accurateBonusDice(qualities, { isRanged, aiming, dos }) {
  if (!isRanged || !aiming || !has(qualities, "accurate")) return null;
  const n = Math.min(2, Math.floor(dos / 2));
  return n > 0 ? `${n}d10` : null;
}

/** Weapon damage formula with Tearing applied if present (weapon dice only). */
export function weaponDamageFormula(qualities, baseFormula) {
  return has(qualities, "tearing") ? tearingFormula(baseFormula) : baseFormula;
}

/** Best parry modifier across the defender's equipped melee weapons (Balanced +10 / Unbalanced -10). */
export function parryModifier(meleeWeaponQualityLists) {
  const mods = meleeWeaponQualityLists.map((qs) => (has(qs, "balanced") ? 10 : 0) + (has(qs, "unbalanced") ? -10 : 0));
  return mods.length ? Math.max(...mods) : 0;
}

/** Whether a weapon has Shocking. */
export function hasShocking(qualities) {
  return has(qualities, "shocking");
}
```

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`. Then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: weapon-quality modules (pure, tested) + balanced/unbalanced/shocking config"
```

---

### Task 2: Wire to-hit + jam + flags + card qualities

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/attack-card.hbs`

- [ ] **Step 1:** In `attack.mjs`, import the modules:
```javascript
import { qualityToHitMod, qualityJamFloor, weaponDamageFormula, accurateBonusDice, parryModifier, hasShocking } from "../helpers/quality-modules.mjs";
```

- [ ] **Step 2:** In `rollAttack`, after the base `modifier` is computed (manual + aim + range + attackType.mod) and BEFORE the ±60 clamp, add the Accurate to-hit bonus; and replace the jam call to use the quality jam floor. Find the modifier-combine + jam lines and adapt:
```javascript
  const aiming = choice.aim !== "none";
  const qualMod = qualityToHitMod(weapon.system.qualities, { aiming });
  const modifier = Math.max(-60, Math.min(60, manual + aim + rng + at.mod + qualMod));
  // ... after roll + resolution:
  const jammed = checkJam(roll.total, success, isRanged, qualityJamFloor(weapon.system.qualities));
```
(Adapt to the actual variable names in `rollAttack` — `manual`/`aim`/`rng`/`at.mod` already exist; just add `qualMod` into the clamp and pass the jam floor to `checkJam`.)

- [ ] **Step 3:** Store `aiming`, `dos`, and `qualities` in the attack flags (the damage step needs `aiming`/`dos`/`qualities` for Accurate + Shocking; `qualities` is already stored — ADD `aiming` and `dos`). In the `flags[NS]` object add:
```javascript
      aiming,
      dos,
```
(where `dos` is the success-degrees value already computed; ensure it's defined as `const dos = success ? degrees : 0;` before the flags.)

- [ ] **Step 4:** Pass a quality summary to the attack card. Before the `renderTemplate(CARD, {...})` call, build:
```javascript
  const qualityLabels = (weapon.system.qualities ?? [])
    .map((q) => `${CONFIG.BDH.qualities[q.key]?.label ?? q.key}${q.value ? ` (${q.value})` : ""}`)
    .join(", ");
```
and add `qualityLabels,` to the card render data.

- [ ] **Step 5:** In `templates/chat/attack-card.hbs`, add a qualities line (after the type·aim·range line):
```handlebars
  {{#if qualityLabels}}<div class="bdh-card-line bdh-quals">Qualities: {{qualityLabels}}</div>{{/if}}
```

- [ ] **Step 6: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/attack-card.hbs
git commit -m "feat: Accurate to-hit + Reliable/Unreliable jam floor; store aiming/dos; list qualities on the card"
```

---

### Task 3: Wire damage (Tearing + Accurate bonus dice, RF on weapon dice only)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Rework the per-hit loop in `rollDamage` so the **weapon dice** (RF-eligible, Tearing-modified) and the **bonus dice/flat** (damage-modifier input + Accurate dice, non-RF) are rolled separately, then combined. Replace the loop body:
```javascript
  const qualities = f.qualities ?? [];
  const rolls = [];
  const hits = [];
  for (const hit of f.hits) {
    // Weapon damage — RF-eligible; Tearing applies to the weapon dice only.
    const weaponFormula = weaponDamageFormula(qualities, baseFormula);
    const wRoll = await new Roll(weaponFormula).evaluate();
    const rf = wRoll.dice.some((d) => d.faces === 10 && d.results.some((res) => res.active && res.result === 10));
    rolls.push(wRoll);
    // Bonus damage — non-RF; first hit only: the input modifier + Accurate's DoS dice.
    const bonusParts = [];
    if (hit.index === 0) {
      if (trimmed && trimmed !== "+0") bonusParts.push(trimmed);
      const acc = accurateBonusDice(qualities, { isRanged: f.isRanged, aiming: f.aiming, dos: f.dos });
      if (acc) bonusParts.push(acc);
    }
    let bonusTotal = 0;
    let bonusBreak = "";
    if (bonusParts.length) {
      const bRoll = await new Roll(bonusParts.join(" + ")).evaluate();
      rolls.push(bRoll);
      bonusTotal = bRoll.total;
      bonusBreak = formatRoll(bRoll);
    }
    const total = wRoll.total + bonusTotal;
    const breakdown = formatRoll(wRoll) + (bonusBreak ? `+${bonusBreak}` : "");
    hits.push({ index: hit.index, location: hit.location, label: hit.label, total, rf, breakdown });
  }
```
(`weaponDamageFormula`, `accurateBonusDice`, `formatRoll` are in scope. `baseFormula`/`trimmed` already exist. Remove the OLD single-roll-per-hit code this replaces. RF is now checked on the weapon roll only — Accurate/bonus dice never trigger RF.)

- [ ] **Step 2:** Ensure the damage card flags carry `qualities` forward (Shocking needs it at apply time). In the damage `ChatMessage` flags object add `qualities: f.qualities ?? [],`.

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Tearing (weapon dice) + Accurate bonus dice (non-RF); RF on weapon dice only; carry qualities to damage flag"
```

---

### Task 4: Wire evade (Balanced / Unbalanced parry)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** In `rollEvade`, in the **Parry** branch, add the parry modifier from the defender's equipped melee weapons:
```javascript
  if (choice.reaction === "parry") {
    const meleeQs = defender.items
      .filter((i) => i.type === "weapon" && i.system.weaponClass === "melee" && i.system.equipped)
      .map((i) => i.system.qualities);
    const pmod = parryModifier(meleeQs);
    const base = defender.system.characteristics.weaponSkill.total;
    const label = pmod ? `Parry (WS, weapon ${pmod >= 0 ? "+" : ""}${pmod})` : "Parry (WS)";
    return performTest(defender, { label, base, modifier: modifier + pmod });
  }
```
(Adapt to the existing `rollEvade` structure — `defender`/`modifier`/`performTest` already exist; just compute `pmod` and add it.)

- [ ] **Step 2: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Balanced/Unbalanced parry modifier on Evade"
```

---

### Task 5: Wire Shocking (queued Toughness test)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** In `applyDamage`'s soak loop, track whether any hit dealt **post-soak** damage. Where the loop computes `eff` per hit, add a flag:
```javascript
  let dealtDamage = false;
  // inside the per-hit loop, after `const eff = soak(...)`:
  if (eff > 0) dealtDamage = true;
```
Then, after the existing damage-applied `ChatMessage.create`, post a Shocking follow-up when applicable:
```javascript
  if (hasShocking(f.qualities) && dealtDamage) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: target }),
      content: `<div class="bdh-card"><div class="bdh-card-head">⚡ Shocking — ${target.name}</div><div class="bdh-card-line">Must pass a Toughness test or be Stunned.</div><div class="bdh-card-actions"><button type="button" data-bdh="shockTest">Toughness Test</button></div></div>`,
      flags: { [NS]: { type: "shock", targetUuid: f.targetUuid } }
    });
  }
```
(Shocking triggers only when a hit got past armour + TB — using the loop's `eff > 0`.)

- [ ] **Step 2:** Add a `shockTest` handler + dispatch. In `bindCardButtons`, add:
```javascript
      else if (btn.dataset.bdh === "shockTest") await rollShockTest(message);
```
and implement:
```javascript
async function rollShockTest(message) {
  const f = message.flags[NS];
  const target = await fromUuid(f.targetUuid);
  if (!target) return;
  return performTest(target, { label: "Toughness (Shocking)", base: target.system.characteristics.toughness.total, modifier: 0 });
}
```
(`performTest` is already imported in attack.mjs from Plan 16's evade.)

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Shocking — queued Toughness test on a damaging hit"
```

---

### Task 6: Deploy & browser verification

**Files:** none (optional tiny CSS for `.bdh-quals` if desired).

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (use `tools/seed-attack-test.js`; add qualities to the test weapons via their item sheets — e.g. give the Autogun **Accurate** + **Reliable**, the Chainsword **Tearing** + **Balanced**, and one weapon **Shocking**):
- [ ] **Accurate** (Autogun, **Full Aim**): the attack card's Modifier includes +10 from Accurate (on top of aim); on a ranged aimed hit with ≥2 DoS the damage breakdown shows extra `[d]` dice (e.g. `[6]+3+[8]+[2] — 19`), and those bonus dice **never** trigger Righteous Fury.
- [ ] **Tearing** (Chainsword): the weapon die is rolled with an extra die kept-highest (breakdown shows the kept result; over many rolls, higher averages).
- [ ] **Reliable / Unreliable**: a Reliable weapon only jams on a natural 100; an Unreliable one jams on 91+ (failed ranged).
- [ ] **Balanced / Unbalanced**: with a Balanced melee weapon equipped, **Evade → Parry** adds +10 (label notes it); Unbalanced −10.
- [ ] **Shocking**: after **Apply Damage** with a Shocking weapon that dealt damage, a follow-up "⚡ Shocking" card appears with a **Toughness Test** button that rolls the target's Toughness.
- [ ] The attack card lists **Qualities: …** for the weapon; unimplemented qualities (e.g. Razor Sharp) still appear in that list (flagged, not automated).
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage (§11a quality framework):** Accurate (to-hit + non-RF bonus dice, cap 2) Tasks 1/2/3; Tearing (weapon dice) Tasks 1/3; Reliable/Unreliable (jam floor) Tasks 1/2; Balanced/Unbalanced (parry) Tasks 1/4; Shocking (queued Toughness test) Tasks 1/5; qualities listed on card Task 2. ✓ Every pattern (modify-attack/jam/damage/evade, queued-condition) has a working exemplar.

**Deferred (declared):** other qualities (stored + flagged); crit tables (P1); evade DoS auto-negation (P3).

**Placeholder scan:** complete; checklist is concrete (Autogun Accurate+Reliable, Chainsword Tearing+Balanced).

**Type/name consistency:** module functions match Task-1 tests + their callers in attack.mjs. RF now checked only on the weapon `Roll` (Accurate/bonus dice are a separate roll) → Accurate never generates RF, per §11a. Tearing transforms only the weapon `baseFormula`'s first dice term. Attack flags gain `aiming`/`dos`; damage flags gain `qualities` (Shocking reads them at apply). New `shockTest` button dispatched by `bindCardButtons`. `balanced`/`unbalanced`/`shocking` added to `BDH.qualities` so they're selectable on the weapon sheet. Parry mod = best of the defender's equipped melee weapons. Graceful degradation preserved: all qualities listed; only these seven act.
