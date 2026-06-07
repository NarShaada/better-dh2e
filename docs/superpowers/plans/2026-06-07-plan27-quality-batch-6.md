# Better DH2e — Plan 27: Weapon Quality Batch 6 (final)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The last weapon-quality batch — **Toxic(X)** (red ⚙), **Unwieldy** + **Vengeful(X)** (black ⚙), **Twin-Linked** (no gear, red note).

**Architecture:** Toxic reuses the damage-card resist-button pattern (Toughness at −10·X; the 1d10 end-of-round damage is applied manually → red). Unwieldy wires at two existing points: the attack dialog omits "Lightning Attack", and `rollEvade` excludes Unwieldy weapons from the parry pool (and removes the Parry option entirely when the defender's only equipped melee weapons are Unwieldy, reusing the Flexible gating). Vengeful changes the Righteous-Fury threshold in `rollDamage` from a natural 10 to ≥ X. Twin-Linked is a config red note.

**Tech Stack:** Foundry v13, Vitest, Handlebars.

**Scope:** the four qualities. **Out of scope:** Toxic's actual end-of-round damage (manual), Twin-Linked's full mechanic (poorly-worded/rare — flagged only).

**Reference (confirmed):**
- **Toxic(X):** on hit, Toughness test at −10·X or take 1d10 damage at end of round (manual). Damage-card button.
- **Twin-Linked:** no automation — red `Twin-Linked` note on the attack card.
- **Unwieldy:** can't be used for a **Lightning Attack** (dialog omits it) or for **parrying** (excluded from the parry pool; if the defender's only equipped melee weapon(s) are Unwieldy, **Parry is unavailable**).
- **Vengeful(X):** Righteous Fury triggers on a weapon die showing **X or more** (default 10 otherwise).

Builds on Plan 17–26 (`qualityValue`, `qualityNotes`/`noteOn`, the damage-card resist buttons + `resolveDefender`/`promptTest`, the RF check in `rollDamage`, `parryModifier`, the Flexible parry gating + the attack dialog's `typeOpts`).

---

## File Structure

```
scripts/config.mjs                    MODIFY  add toxic, vengeful; +noteOn on twinLinked; +automation on unwieldy
scripts/helpers/quality-modules.mjs   MODIFY  toxicValue, vengefulValue, hasUnwieldy
test/quality-modules.test.mjs         MODIFY  tests for the new helpers
scripts/rolls/attack.mjs              MODIFY  rollAttack: omit Lightning for Unwieldy; rollEvade: Unwieldy parry gating; rollDamage: Vengeful RF threshold + Toxic button/handler
templates/chat/damage-card.hbs        MODIFY  Toxic line
```

---

### Task 1: Config + helpers (TDD)

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs): add `noteOn: "attack"` to the EXISTING `twinLinked` entry; add `automation: "full"` to the EXISTING `unwieldy` entry; and add (mind commas):
```javascript
  toxic:      { label: "Toxic", takesValue: true, automation: "partial" },
  vengeful:   { label: "Vengeful", takesValue: true, automation: "full" },
```
(`toxic` → red ⚙; `vengeful`/`unwieldy` → black ⚙; `twinLinked` → no gear + red note.)

- [ ] **Step 2: Failing tests.** In `test/quality-modules.test.mjs`, add `toxicValue, vengefulValue, hasUnwieldy` to the import, and append:
```javascript
describe("toxicValue / vengefulValue / hasUnwieldy", () => {
  it("read X / detect Unwieldy", () => {
    expect(toxicValue([{ key: "toxic", value: "3" }])).toBe(3);
    expect(toxicValue(Q())).toBe(0);
    expect(vengefulValue([{ key: "vengeful", value: "9" }])).toBe(9);
    expect(vengefulValue(Q())).toBe(0);
    expect(hasUnwieldy(Q("unwieldy"))).toBe(true);
    expect(hasUnwieldy(Q())).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`:
```javascript
export function toxicValue(qualities) { return qualityValue(qualities, "toxic"); }
export function vengefulValue(qualities) { return qualityValue(qualities, "vengeful"); }
export function hasUnwieldy(qualities) { return has(qualities, "unwieldy"); }
```

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: quality batch 6 config + toxic/vengeful/unwieldy helpers (TDD)"
```

---

### Task 2: Wire Unwieldy (no Lightning Attack; no parrying)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import `hasUnwieldy` (merge into the existing quality-modules import).

- [ ] **Step 2: Omit Lightning Attack.** In `rollAttack`, the `typeOpts` builder filters attack types by scope. Add a clause so Unwieldy weapons can't pick Lightning Attack:
```javascript
  const typeOpts = Object.entries(BDH.attackTypes)
    .filter(([k, t]) => (t.scope === "any" || t.scope === (isMelee ? "melee" : "ranged"))
      && !(k === "lightning" && hasUnwieldy(weapon.system.qualities)))
    .map(([k, t]) => `<option value="${k}">${t.label}</option>`)
    .join("");
```
(Adapt to the existing `typeOpts` builder; only the extra `&& !(k === "lightning" && ...)` clause is new.)

- [ ] **Step 3: Unwieldy parry gating in `rollEvade`.** The defender is resolved before the dialog. Replace the current Flexible-only gating with combined Flexible + Unwieldy gating. After `const defender = ...; if (!defender) ...;`, compute:
```javascript
  const meleeWeapons = defender.items.filter((i) => i.type === "weapon" && i.system.weaponClass === "melee" && i.system.equipped);
  const parryWeapons = meleeWeapons.filter((i) => !hasUnwieldy(i.system.qualities));
  const onlyUnwieldy = meleeWeapons.length > 0 && parryWeapons.length === 0;   // holding only Unwieldy melee
  const flexible = hasFlexible(f.qualities);
  const noParry = flexible || onlyUnwieldy;
  const parryOption = noParry ? "" : `<option value="parry">Parry</option>`;
  const parryNote = flexible
    ? `<div class="form-group"><p class="hint">This weapon is Flexible — it cannot be parried.</p></div>`
    : onlyUnwieldy
    ? `<div class="form-group"><p class="hint">Your only melee weapon is Unwieldy — it cannot parry.</p></div>`
    : "";
```
Use `${parryNote}` in the dialog content (in place of the old `${flexibleNote}`). Update the defensive guard:
```javascript
  if (noParry && choice.reaction === "parry") {
    ui.notifications.warn(flexible ? "A Flexible weapon cannot be parried." : "An Unwieldy weapon cannot parry.");
    return null;
  }
```
And in the parry branch, use `parryWeapons` (not all melee) for the parry modifier:
```javascript
  if (choice.reaction === "parry") {
    const pmod = parryModifier(parryWeapons.map((i) => ({ qualities: i.system.qualities, craftsmanship: i.system.craftsmanship })));
    const base = defender.system.characteristics.weaponSkill.total;
    const label = pmod ? `Parry (WS, weapon ${pmod >= 0 ? "+" : ""}${pmod})` : "Parry (WS)";
    return performTest(defender, { label, base, modifier: modifier + pmod });
  }
```
(Remove the now-replaced `flexible`/`parryOption`/`flexibleNote` lines and the in-branch `meleeWeapons` rebuild. Keep the Dodge branch unchanged.)

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Unwieldy — no Lightning Attack; cannot parry (excluded from parry pool; Parry off if only Unwieldy melee)"
```

---

### Task 3: Wire Vengeful (RF threshold) + Toxic (damage-card button)

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/damage-card.hbs`

- [ ] **Step 1:** Import `vengefulValue, toxicValue` (merge into the existing quality-modules import).

- [ ] **Step 2: Vengeful RF threshold.** In `rollDamage`, before the per-hit loop, compute the threshold from the weapon's qualities:
```javascript
  const rfThreshold = vengefulValue(qualities) || 10;
```
Change the per-hit RF check from `=== 10` to `>= rfThreshold`:
```javascript
    const rf = wRoll.dice.some((d) => d.faces === 10 && d.results.some((res) => res.active && res.result >= rfThreshold));
```
(Default `rfThreshold` is 10 → `>= 10` is the same as `=== 10` for a d10, so non-Vengeful weapons are unchanged. The Maximal `+1d10` die, being in `wRoll`, is also subject to the threshold — correct, it's weapon damage.)

- [ ] **Step 3: Toxic card data.** In `rollDamage`'s `cardData`, add (next to `snare`):
```javascript
    toxic: toxicValue(qualities) || null,
```

- [ ] **Step 4: Toxic handler.** Add near `rollSnareTest` (Toughness test at −10·X; the 1d10 end-of-round damage is GM-applied):
```javascript
async function rollToxicTest(message) {
  const f = message.flags[NS];
  const defender = await resolveDefender(f);
  if (!defender) { ui.notifications.warn("Select a token to test Toughness."); return; }
  const x = toxicValue(f.qualities);
  const label = `Toughness (Toxic ${x})`;
  const choice = await promptTest({ title: label, defaultModifier: `${-10 * x}` });
  if (!choice) return null;
  return performTest(defender, { label, base: defender.system.characteristics.toughness.total, modifier: choice.modifier });
}
```

- [ ] **Step 5: Dispatch.** In `bindCardButtons`, add a branch:
```javascript
      else if (btn.dataset.bdh === "toxicTest") await rollToxicTest(message);
```

- [ ] **Step 6: Template.** In `templates/chat/damage-card.hbs`, after the Snare line, add:
```handlebars
  {{#if toxic}}<div class="bdh-card-line">🧪 Toxic ({{toxic}}) — Toughness test or 1d10 damage (end of round): <button type="button" data-bdh="toxicTest">Toughness Test</button></div>{{/if}}
```

- [ ] **Step 7: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/damage-card.hbs
git commit -m "feat: Vengeful(X) RF threshold + Toxic(X) damage-card Toughness test (manual 1d10)"
```

---

### Task 4: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (set qualities on test weapons):
- [ ] **Gear tiers**: Toxic → **red ⚙**; Unwieldy, Vengeful → **black ⚙**; Twin-Linked → **no gear**.
- [ ] **Unwieldy — Lightning**: the attack dialog for an Unwieldy melee weapon has **no "Lightning Attack"** option (other melee types still present); a non-Unwieldy melee weapon still shows it.
- [ ] **Unwieldy — Parry**: attacking a defender whose only equipped melee weapon is **Unwieldy** → their **Evade offers only Dodge** (with the note); if they also have a non-Unwieldy melee weapon, Parry returns and uses that weapon's bonus (Unwieldy excluded from the calc).
- [ ] **Vengeful(9)**: a weapon damage die of **9 or 10** triggers **☠ Righteous Fury**; a non-Vengeful weapon still only on 10.
- [ ] **Toxic(3)**: the damage card shows a **🧪 Toxic (3)** button → Toughness test pre-filled **−30** (the 1d10 you apply by hand at end of round).
- [ ] **Twin-Linked**: red **"Twin-Linked"** note on the attack card.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + helpers (Task 1, TDD); Unwieldy no-Lightning + no-parry (Task 2); Vengeful RF threshold + Toxic button (Task 3). Twin-Linked = config red note. ✓ This completes the quality set.

**Deferred (declared):** Toxic end-of-round damage (manual); Twin-Linked's full mechanic.

**Placeholder scan:** complete; checklist concrete (Vengeful 9 → RF on 9/10; only-Unwieldy → no Parry).

**Type/name consistency:** `toxicValue`/`vengefulValue` via `qualityValue`; `hasUnwieldy` via `has`. `typeOpts` gains the Lightning exclusion for Unwieldy. `rollEvade` combines Flexible (attacker) + Unwieldy (defender, `onlyUnwieldy`) into `noParry`/`parryNote`; the parry branch uses `parryWeapons` (Unwieldy excluded) for `parryModifier`. `rfThreshold = vengefulValue(qualities) || 10` (default 10 = unchanged) applied in the per-hit RF check (`>= rfThreshold`). Toxic mirrors Snare/Hallucinogenic (Toughness, −10·X) via `resolveDefender`/`promptTest`/`performTest` + `bindCardButtons` dispatch + a truthy-gated card line. The 3-tier ⚙ marker reads `automation` (toxic = partial → red; unwieldy/vengeful = full → black; twinLinked = none → no gear, has `noteOn`).
