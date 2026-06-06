# Better DH2e — Plan 22: Weapon Quality Batch 3

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five weapon qualities — **Inaccurate**, **Lance**, **Melta** (black ⚙, full automation) and **Haywire(X)**, **Indirect(X)** (no gear — red name+value note on the attack card). All three automated ones wire entirely in `rollAttack` (aim modifier + effective penetration), so the damage/soak path is untouched.

**Architecture:** Extend the quality config + pure helpers, then wire in `rollAttack`: Inaccurate zeroes the Aim-action modifier; Lance/Melta recompute the weapon's **penetration** (Lance ×DoS on a hit; Melta ×2 at Point-Blank/Short range) which is stored in the attack flags and flows to the damage card + soak unchanged. Haywire/Indirect reuse the Plan-20 `noteOn:"attack"` red-note mechanism (config-only).

**Tech Stack:** Foundry v13, Vitest, Handlebars.

**Scope:** the five qualities above. **Out of scope:** **Maximal** (separate design conversation — pulls in Recharge/Overheats); Indirect's actual indirect-fire/template automation (postponed to token-positioning work — shown as a note for now); Haywire's electronics effects (GM-resolved).

**Reference (confirmed):**
- **Inaccurate:** the Aim action grants no to-hit bonus (Half/Full Aim → +0).
- **Lance:** on a hit, multiply the weapon's Penetration by the attack's Degrees of Success (Pen × DoS).
- **Melta:** when firing at **Point-Blank or Short** range, Penetration ×2.
- **Haywire(X) / Indirect(X):** no automation — red `Name (value)` note on the attack card (GM resolves).

Builds on Plan 20/21 (`qualityNotes`/`noteOn` red notes, the 3-tier ⚙ marker) and `rollAttack` (aim/range mods, `dos`, attack flags carry `penetration`).

---

## File Structure

```
scripts/config.mjs                    MODIFY  add haywire, inaccurate, indirect, lance, melta to BDH.qualities
scripts/helpers/quality-modules.mjs   MODIFY  hasInaccurate; effectivePenetration (Lance ×DoS, Melta ×2 close)
test/quality-modules.test.mjs         MODIFY  tests for the new helpers
scripts/rolls/attack.mjs              MODIFY  rollAttack: Inaccurate zeroes aim mod; store effectivePenetration in flags
```

---

### Task 1: Config + pure helpers (TDD)

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs), add (mind commas):
```javascript
  haywire:    { label: "Haywire", takesValue: true, noteOn: "attack" },
  inaccurate: { label: "Inaccurate", takesValue: false, automation: "full" },
  indirect:   { label: "Indirect", takesValue: true, noteOn: "attack" },
  lance:      { label: "Lance", takesValue: false, automation: "full" },
  melta:      { label: "Melta", takesValue: false, automation: "full" },
```
(Haywire/Indirect have `noteOn` and no `automation` → no gear, red note. Inaccurate/Lance/Melta → black ⚙.)

- [ ] **Step 2: Failing tests.** In `test/quality-modules.test.mjs`, add `hasInaccurate, effectivePenetration` to the import, and append:
```javascript
describe("hasInaccurate", () => {
  it("detects Inaccurate", () => {
    expect(hasInaccurate(Q("inaccurate"))).toBe(true);
    expect(hasInaccurate(Q())).toBe(false);
  });
});
describe("effectivePenetration", () => {
  it("Lance multiplies Pen by DoS on a hit; nothing on a miss", () => {
    expect(effectivePenetration(4, { qualities: Q("lance"), dos: 3, success: true, closeRange: false })).toBe(12);
    expect(effectivePenetration(4, { qualities: Q("lance"), dos: 3, success: false, closeRange: false })).toBe(4);
  });
  it("Melta doubles Pen at close range only", () => {
    expect(effectivePenetration(4, { qualities: Q("melta"), dos: 1, success: true, closeRange: true })).toBe(8);
    expect(effectivePenetration(4, { qualities: Q("melta"), dos: 1, success: true, closeRange: false })).toBe(4);
  });
  it("stacks Lance and Melta", () => {
    expect(effectivePenetration(4, { qualities: Q("lance", "melta"), dos: 2, success: true, closeRange: true })).toBe(16);
  });
  it("no relevant qualities -> base Pen", () => {
    expect(effectivePenetration(4, { qualities: Q(), dos: 3, success: true, closeRange: true })).toBe(4);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`:
```javascript
export function hasInaccurate(qualities) { return has(qualities, "inaccurate"); }

/** Penetration after Lance (×DoS on a hit) and Melta (×2 at Point-Blank/Short range). */
export function effectivePenetration(basePen, { qualities, dos, success, closeRange }) {
  let pen = basePen;
  if (success && has(qualities, "lance")) pen *= dos;
  if (closeRange && has(qualities, "melta")) pen *= 2;
  return pen;
}
```
(`has` already exists in the module.)

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: quality batch 3 config + hasInaccurate + effectivePenetration (Lance/Melta) (TDD)"
```

---

### Task 2: Wire Inaccurate + Lance + Melta in rollAttack

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import `hasInaccurate, effectivePenetration` (merge into the existing quality-modules import).

- [ ] **Step 2: Inaccurate — zero the aim modifier.** In `rollAttack`, the aim modifier is currently:
```javascript
  const aimMod = BDH.aimOptions[choice.aim]?.mod ?? 0;
```
Change it to grant nothing when the weapon is Inaccurate:
```javascript
  const aimMod = hasInaccurate(weapon.system.qualities) ? 0 : (BDH.aimOptions[choice.aim]?.mod ?? 0);
```

- [ ] **Step 3: Lance/Melta — effective penetration.** In `rollAttack`, after `dos` is computed (`const dos = success ? degrees : 0;`) and before the `flags` object is built, add:
```javascript
  const penetration = effectivePenetration(weapon.system.penetration ?? 0, {
    qualities: weapon.system.qualities,
    dos,
    success,
    closeRange: ["pointBlank", "short"].includes(choice.range)
  });
```
Then in the `flags[NS]` object, replace the penetration line:
```javascript
      penetration,
```
(It currently reads `penetration: weapon.system.penetration ?? 0`. The damage card + `applyDamage` already read `f.penetration`, so the boosted value flows through and the damage card's "Pen N" shows it. `choice.range` is undefined for melee → `closeRange` false → Melta no-ops on melee, which is correct.)

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Inaccurate (aim grants nothing) + Lance (Pen ×DoS) + Melta (Pen ×2 close range)"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (set qualities on the test weapons via their item sheets):
- [ ] **Gear tiers**: Inaccurate, Lance, Melta show **black ⚙**; Haywire, Indirect show **no gear** (and take a value).
- [ ] **Inaccurate**: with Half/Full Aim selected, the attack card Modifier shows **no aim bonus** (the +10/+20 is gone); a non-Inaccurate weapon still gets it.
- [ ] **Lance**: on a hit with N DoS, the damage card's **Pen** = base Pen × N (e.g. Pen 4, 3 DoS → **Pen 12**); confirm the higher Pen reduces armour more at Apply Damage.
- [ ] **Melta**: firing at **Point-Blank** or **Short** → damage card **Pen ×2**; at Normal/Long/Extreme → base Pen. (Melee weapons: unaffected.)
- [ ] **Haywire(2) / Indirect(1)**: red **"Haywire (2)"** / **"Indirect (1)"** note on the **attack** card.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + helpers (Task 1, TDD); Inaccurate + Lance + Melta wired in rollAttack (Task 2); Haywire/Indirect = config red notes (Task 1). ✓

**Deferred (declared):** Maximal (separate conversation); Indirect's positioning/template automation; Haywire electronics effects.

**Placeholder scan:** complete; checklist concrete (Lance Pen 4×3=12; Melta ×2 close).

**Type/name consistency:** `hasInaccurate`/`effectivePenetration` match the Task-1 tests + the rollAttack callers. `effectivePenetration` reads `success`/`dos`/`closeRange` (computed from `choice.range ∈ {pointBlank, short}`) — melee has no `choice.range` so `closeRange` is false (Melta no-ops, correct). The computed `penetration` replaces `weapon.system.penetration` in the attack flags; the damage card (`cardData.penetration = f.penetration`) and `applyDamage` (`f.penetration`) already consume it, so Lance/Melta need no damage-side changes. Haywire/Indirect use `noteOn:"attack"` → rendered by the existing `qualityNotes`/`attackNotes` path (Plan 20). The 3-tier ⚙ marker reads `automation` (Inaccurate/Lance/Melta = full → black; Haywire/Indirect = none → no gear).
