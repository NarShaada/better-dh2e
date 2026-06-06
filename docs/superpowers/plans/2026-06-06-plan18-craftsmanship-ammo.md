# Better DH2e — Plan 18: Craftsmanship Combat Effects + Ammo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire weapon & armour **craftsmanship** combat effects (melee to-hit + Best damage; ranged effective jam floor; Best armour +1 AP) and **ammo** (firing deducts RoF rounds, blocked when short, a Reload button refills). Adds the armour **maxAgility** field (its Agility-cap behaviour is Plan 19).

**Architecture:** Pure, tested craftsmanship helpers feed the existing attack pipeline hook points (to-hit, jam, damage) and `computeArmour` (soak). Ammo is consumed in the to-hit step (after the roll, so a jam still spends rounds) with a pre-roll block; a `reloadWeapon` action refills the clip from the Combat tab.

**Tech Stack:** Foundry v13 (ApplicationV2 actions, `item.update`), Vitest, Handlebars.

**Scope:** weapon/armour craftsmanship combat effects, the armour `maxAgility` field + sheet input, ammo consume/block/reload. **Out of scope (Plan 19):** the Agility cap from `maxAgility`, fatigue halving, and red impairment display. **Out of scope (later):** weight→encumbrance.

**Reference:** craftsmanship rules (confirmed): ranged jam table (quality × craftsmanship, computed under the hood — keys never added/removed), melee Poor −10 / Good +5 / Best +10 & +1 dmg, Best armour +1 AP per protected (AP>0) location. Ammo: deduct the attack type's RoF rounds (Single→`single`, Semi→`short`, Full→`long`); jam still consumes; not enough → block; Reload refills to max. Builds on Plan 16/17 (`scripts/rolls/attack.mjs`, `quality-modules.mjs`) and `computeArmour` (`combat-data.mjs`).

---

## File Structure

```
scripts/helpers/craftsmanship-data.mjs   NEW     pure: effectiveJamFloor, meleeCraftToHit, meleeCraftDamageBonus
test/craftsmanship-data.test.mjs         NEW     Vitest
scripts/helpers/combat-data.mjs          MODIFY  computeArmour: Best armour +1 AP per protected location
test/combat-data.test.mjs                MODIFY  Best-AP test
scripts/data/item/armour-model.mjs       MODIFY  add maxAgility field
templates/item/item-sheet.hbs            MODIFY  armour maxAgility input
scripts/sheets/item-sheet.mjs            MODIFY  (only if armour context needs maxAgility — likely already generic)
scripts/rolls/attack.mjs                 MODIFY  craftsmanship to-hit/jam/damage; ammo consume + block
scripts/sheets/actor-sheet.mjs           MODIFY  reloadWeapon action; combatWeapons ammo/reload context
templates/actor/actor-sheet.hbs          MODIFY  Combat weapon row: ammo + Reload button
styles/better-dh2e.css                   MODIFY  reload button
```

---

### Task 1: Pure craftsmanship helpers + computeArmour Best AP (TDD)

**Files:** create `test/craftsmanship-data.test.mjs`, `scripts/helpers/craftsmanship-data.mjs`; modify `scripts/helpers/combat-data.mjs`, `test/combat-data.test.mjs`.

- [ ] **Step 1: Failing test** `test/craftsmanship-data.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { effectiveJamFloor, meleeCraftToHit, meleeCraftDamageBonus } from "../scripts/helpers/craftsmanship-data.mjs";

const Q = (...keys) => keys.map((key) => ({ key, value: "" }));

describe("effectiveJamFloor (quality × craftsmanship)", () => {
  it("best never jams", () => {
    expect(effectiveJamFloor(Q(), "best")).toBe(Infinity);
    expect(effectiveJamFloor(Q("unreliable"), "best")).toBe(Infinity);
  });
  it("good: unreliable cancels to neither, else reliable", () => {
    expect(effectiveJamFloor(Q("unreliable"), "good")).toBe(94);
    expect(effectiveJamFloor(Q(), "good")).toBe(100);
    expect(effectiveJamFloor(Q("reliable"), "good")).toBe(100);
  });
  it("poor: unreliable -> jam on every fail (0); reliable cancels to neither; else unreliable", () => {
    expect(effectiveJamFloor(Q("unreliable"), "poor")).toBe(0);
    expect(effectiveJamFloor(Q("reliable"), "poor")).toBe(94);
    expect(effectiveJamFloor(Q(), "poor")).toBe(91);
  });
  it("normal: reliable 100, unreliable 91, neither 94", () => {
    expect(effectiveJamFloor(Q("reliable"), "normal")).toBe(100);
    expect(effectiveJamFloor(Q("unreliable"), "normal")).toBe(91);
    expect(effectiveJamFloor(Q(), "normal")).toBe(94);
  });
});
describe("meleeCraftToHit", () => {
  it("poor -10, good +5, best +10, normal 0", () => {
    expect(meleeCraftToHit("poor")).toBe(-10);
    expect(meleeCraftToHit("good")).toBe(5);
    expect(meleeCraftToHit("best")).toBe(10);
    expect(meleeCraftToHit("normal")).toBe(0);
  });
});
describe("meleeCraftDamageBonus", () => {
  it("best +1, else 0", () => {
    expect(meleeCraftDamageBonus("best")).toBe(1);
    expect(meleeCraftDamageBonus("good")).toBe(0);
    expect(meleeCraftDamageBonus("normal")).toBe(0);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/craftsmanship-data.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/craftsmanship-data.mjs`:
```javascript
// scripts/helpers/craftsmanship-data.mjs — PURE. Craftsmanship combat effects.

const has = (qualities, key) => Array.isArray(qualities) && qualities.some((q) => q.key === key);

/** Effective ranged jam floor from quality + craftsmanship (Infinity = never jams; 0 = jams on every failed roll). */
export function effectiveJamFloor(qualities, craftsmanship) {
  if (craftsmanship === "best") return Infinity;
  const r = has(qualities, "reliable");
  const u = has(qualities, "unreliable");
  if (craftsmanship === "good") return u ? 94 : 100;            // U cancels to neither; N/R -> reliable
  if (craftsmanship === "poor") return u ? 0 : (r ? 94 : 91);   // U -> jam every fail; R cancels to neither; N -> unreliable
  return r ? 100 : (u ? 91 : 94);                               // normal
}

/** Melee craftsmanship to-hit modifier. */
export function meleeCraftToHit(craftsmanship) {
  return { poor: -10, good: 5, best: 10 }[craftsmanship] ?? 0;
}

/** Melee craftsmanship flat damage bonus (Best only). */
export function meleeCraftDamageBonus(craftsmanship) {
  return craftsmanship === "best" ? 1 : 0;
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/craftsmanship-data.test.mjs`.

- [ ] **Step 5: computeArmour Best +1 AP.** In `scripts/helpers/combat-data.mjs`, in the per-armour loop, give Best-craftsmanship armour +1 AP at each protected (AP>0) location. Change the inner read so:
```javascript
    for (const a of armours) {
      let ap = a.locations?.[loc] ?? 0;
      if (a.craftsmanship === "best" && ap > 0) ap += 1;   // Best armour: +1 AP per protected location
      if (a.additive) additive += ap;
      else best = Math.max(best, ap);
    }
```
(Adapt to the existing loop variable names; the key change is the `+1` for Best where AP>0.)

- [ ] **Step 6: Add a combat-data test.** In `test/combat-data.test.mjs`, add:
```javascript
  it("Best-craftsmanship armour adds +1 AP per protected location (not 0-AP ones)", () => {
    const r = computeArmour([{ additive: false, craftsmanship: "best", locations: { head: 0, body: 6, rightArm: 0, leftArm: 0, rightLeg: 0, leftLeg: 0 } }], 0);
    expect(r.body).toBe(7);   // 6 + 1
    expect(r.head).toBe(0);   // 0 stays 0
  });
```
(Match the test file's existing `loc(...)`/stub style if it differs.)

- [ ] **Step 7: Run all + commit.** `npm test` (all pass).
```bash
git add scripts/helpers/craftsmanship-data.mjs test/craftsmanship-data.test.mjs scripts/helpers/combat-data.mjs test/combat-data.test.mjs
git commit -m "feat: pure craftsmanship helpers (jam/melee) + Best armour +1 AP in computeArmour (TDD)"
```

---

### Task 2: Armour maxAgility field + sheet input

**Files:** `scripts/data/item/armour-model.mjs`, `templates/item/item-sheet.hbs` (+ `scripts/sheets/item-sheet.mjs` only if needed).

- [ ] **Step 1:** In `armour-model.mjs` `defineSchema()`, add (alongside `craftsmanship`/`availability`/`weight`):
```javascript
      maxAgility: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
```
(`0` = no Agility restriction.)

- [ ] **Step 2:** In `templates/item/item-sheet.hbs`, in the **armour** field section (where craftsmanship/availability/weight are edited), add a Max-Agility input:
```handlebars
        <label>Max Agility</label><input type="number" name="system.maxAgility" value="{{system.maxAgility}}" min="0"/>
```
(Place it among the other armour fields; the armour section is gated by the per-type `isArmour` context flag. If the item sheet renders armour fields generically by reading `system.*`, just add the labelled input in the armour block. `0` means no cap.)

- [ ] **Step 3: Verify and commit.** `node --check scripts/data/item/armour-model.mjs && npm test`.
```bash
git add scripts/data/item/armour-model.mjs templates/item/item-sheet.hbs scripts/sheets/item-sheet.mjs
git commit -m "feat: armour maxAgility field + item-sheet input (0 = no restriction)"
```

---

### Task 3: Wire weapon craftsmanship into the attack

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Import the helpers (merge with existing imports):
```javascript
import { effectiveJamFloor, meleeCraftToHit, meleeCraftDamageBonus } from "../helpers/craftsmanship-data.mjs";
```

- [ ] **Step 2: To-hit (melee craftsmanship).** In `rollAttack`, add the melee craftsmanship to-hit into the combined modifier. Define a craft mod (melee only) and add it to the clamp alongside `qualMod`:
```javascript
  const craftMod = isMelee ? meleeCraftToHit(weapon.system.craftsmanship) : 0;
```
and include `+ craftMod` in the `rawModifier`/clamp expression (next to `+ qualMod`).

- [ ] **Step 3: Jam (craftsmanship).** Replace the jam-floor call so it uses craftsmanship:
```javascript
  const jammed = checkJam(roll.total, success, isRanged, effectiveJamFloor(weapon.system.qualities, weapon.system.craftsmanship));
```
(Replaces the Plan-17 `qualityJamFloor(...)` call. `effectiveJamFloor` subsumes Reliable/Unreliable + craftsmanship; `Infinity` floor → never jams; `0` floor → jams on every failed ranged roll.)

- [ ] **Step 4: Damage (Best melee +1).** In `rollDamage`, add the melee craft bonus to the weapon damage formula (it's flat weapon damage, RF-unaffected). Where the weapon formula is built, prepend the craft bonus into the base before Tearing:
```javascript
  const craftDmg = !f.isRanged ? meleeCraftDamageBonus(weapon.system.craftsmanship) : 0;
  const weaponBase = craftDmg ? `${baseFormula} + ${craftDmg}` : baseFormula;
  // ...then per hit:
  const weaponFormula = weaponDamageFormula(qualities, weaponBase);
```
(`weaponDamageFormula` already applies Tearing to the first dice term; the flat `+1` rides along in the weapon roll, so it's part of weapon damage but doesn't add a die.)

- [ ] **Step 5: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: weapon craftsmanship — melee to-hit + Best +1 damage; craftsmanship-aware ranged jam floor"
```

---

### Task 4: Ammo — consume on fire, block when short, Reload

**Files:** `scripts/rolls/attack.mjs`, `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Consume + block in `rollAttack`.** Import `weaponClassFlags` (merge with imports). After the attack-type `at` is known (post-dialog) and BEFORE rolling, compute the rounds and block if short; after the message is created, deduct (jam still consumes):
```javascript
  const usesAmmo = weaponClassFlags(weapon.system.weaponClass).usesAmmo;
  const rounds = at.rof ? (weapon.system.rateOfFire?.[at.rof] || 1) : (weapon.system.rateOfFire?.single || 1);
  if (usesAmmo && (weapon.system.clip?.value ?? 0) < rounds) {
    ui.notifications.warn(`Not enough ammo: needs ${rounds}, ${weapon.system.clip?.value ?? 0} in the clip.`);
    return null;
  }
  // ... resolve to-hit, build + create the chat message as now ...
  if (usesAmmo) await weapon.update({ "system.clip.value": (weapon.system.clip.value) - rounds });
```
(Place the block check right after `at` is resolved; place the deduct after `ChatMessage.create`. `weaponClassFlags(...).usesAmmo` is false for melee/thrown, so they never consume.)

- [ ] **Step 2: Reload action.** In `scripts/sheets/actor-sheet.mjs`, add a handler + register it:
```javascript
  /** Action: reload a weapon — refill its clip to max. */
  static async #onReloadWeapon(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(id);
    if (item) await item.update({ "system.clip.value": item.system.clip.max });
  }
```
Register in `DEFAULT_OPTIONS.actions`: `reloadWeapon: DarkHeresyActorSheet.#onReloadWeapon` (append, comma the previous).

- [ ] **Step 3: Combat weapon row — ammo + Reload.** In `_prepareContext`, the `context.combatWeapons` items should expose `usesAmmo` + `clip` (value/max). Ensure each combat weapon view-model includes:
```javascript
      usesAmmo: weaponClassFlags(w.system.weaponClass).usesAmmo,
      clip: `${w.system.clip?.value ?? 0}/${w.system.clip?.max ?? 0}`,
```
(`weaponClassFlags` is already imported in actor-sheet.mjs from earlier plans.) Then in `templates/actor/actor-sheet.hbs`, in the Combat **Equipped Weapons** row, after the attack button, add (for ammo weapons) the clip + a Reload button:
```handlebars
                {{#if w.usesAmmo}}<span class="bdh-clip">{{w.clip}}</span><button type="button" class="bdh-reload" data-action="reloadWeapon">⟳</button>{{/if}}
```
(The row already carries `data-item-id`; `#onReloadWeapon` reads it via `closest`.)

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/attack.mjs && node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs
git commit -m "feat: ammo — consume RoF rounds on fire (jam included), block when short, Reload button on Combat"
```

---

### Task 5: Styles + deploy & verify

**Files:** `styles/better-dh2e.css`

- [ ] **Step 1: Append:**
```css

/* Reload button on the Combat weapon row */
.better-dh2e .bdh-reload { flex:0 0 auto; background:var(--bdh-panel); border:1px solid var(--bdh-brown); border-radius:3px; color:var(--bdh-maroon); font-size:11px; padding:0 6px; cursor:pointer; }
```

- [ ] **Step 2: Commit**
```bash
git add styles/better-dh2e.css
git commit -m "feat: reload-button style"
```

- [ ] **Step 3: Deploy** — `npm run deploy`. **Step 4: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 5: Browser checklist** (use `tools/seed-attack-test.js`; set craftsmanship on the test weapons/armour via their item sheets):
- [ ] **Melee craftsmanship**: a **Best** Chainsword attack shows **+10** in the card Modifier and **+1** in the damage (e.g. `[7]+3+1`); **Poor** shows −10; **Good** +5.
- [ ] **Ranged jam craftsmanship**: a **Poor** Autogun (no quality) jams on 91+; **Good** never jams (Reliable); **Best** never jams; a **Best + Unreliable** weapon still lists "Unreliable" but never jams.
- [ ] **Best armour +1 AP**: set the NPC's Flak to **Best** → Apply Damage soaks 1 more at protected locations (Body 4→5), 0-AP locations unchanged.
- [ ] **Armour Max-Agility field**: editable on the armour item sheet (its cap behaviour is Plan 19).
- [ ] **Ammo**: firing the Autogun **Full-Auto** drops the clip by its long RoF; **Semi** by short; **Single** by 1; firing with too few rounds is **blocked** with a warning; the **⟳ Reload** button on the Combat row refills the clip to max; a **jam** still consumes the rounds.
- [ ] **F12**: no errors.

- [ ] **Step 6:** Commit any fix.

---

## Self-Review

**Coverage:** craftsmanship pure helpers + Best armour AP (Task 1, TDD); maxAgility field (Task 2); weapon craftsmanship to-hit/jam/damage (Task 3); ammo consume/block/reload (Task 4). ✓

**Deferred (declared):** Agility cap from maxAgility + fatigue halving + red display (Plan 19 → alpha); weight/encumbrance (later).

**Placeholder scan:** complete; checklist concrete (Best Chainsword +10/+1; Poor Autogun 91+; Best Flak Body 4→5; Full-Auto clip drop).

**Type/name consistency:** `effectiveJamFloor`/`meleeCraftToHit`/`meleeCraftDamageBonus` match the Task-1 tests + their callers in attack.mjs; `effectiveJamFloor` REPLACES `qualityJamFloor` at the jam call. `computeArmour` reads `a.craftsmanship` (the equipped-armour `system` objects already carry it). `weapon.system.craftsmanship` exists (weapon model). Ammo: `weaponClassFlags(...).usesAmmo` gates consumption (melee/thrown excluded); rounds = the attack type's RoF (or `single`); block before roll, deduct after (jam included). `reloadWeapon` action matches template `data-action` + handler. `maxAgility` 0 = no restriction (Plan 19 reads it).
