# Better DH2e — Plan 8: Combat Sub-Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill the Stats → **Combat** sub-tab: the per-location **armour row** (computed from equipped armour + Toughness Bonus), a **force-field PR** line, **equipped-weapon attack buttons** (a WS/BS test reusing the roll system), **wounds**, **lasting injuries** (inline add/edit/remove), **favourite talents**, and **movement / initiative**.

**Architecture:** Armour aggregation is a **pure, tested helper** (`computeArmour`). A `rollWeaponAttack` reuses the existing roll dialog + chat card from Plan 3 (WS for melee, BS otherwise) — the full hit-location/RoF/damage/evade pipeline is a later plan. The actor sheet builds the Combat context and adds `rollAttack` / `addInjury` / `removeInjury` actions; wounds bind to the actor form (named inputs); injury descriptions use no-name inputs wired in the existing `_onRender`.

**Tech Stack:** Foundry v13 (`ActorSheetV2`, ApplicationV2 `actions`, `item`/`actor.update`), the existing `roll-test.mjs`, Vitest, Handlebars.

**Scope of THIS plan:** the Combat sub-tab content + the armour helper + the basic weapon-attack test.

**Out of scope (later plans):** full attack resolution (hit location, RoF extra hits, damage roll, soak, evade, the §11 attack card); Afflictions/Psychic/Advancement; encumbrance penalties.

**Reference:** spec §6 (Combat sub-tab contents) + mockup `combat-subtab-v2.html`. Armour rule (spec §3/§4): per location, AP = highest non-additive equipped piece + sum of additive equipped pieces; soak shown = AP + TB. Reuses `performTest` (Plan 3). No-name inputs aren't in the form submit (wired via `_onRender`); the actor form root is a `<div>` so named inputs (`system.wounds.*`) save.

---

## File Structure

```
scripts/helpers/combat-data.mjs    NEW  pure computeArmour(equippedArmours, TB)
test/combat-data.test.mjs          NEW  Vitest
scripts/rolls/roll-test.mjs        MODIFY  add rollWeaponAttack(actor, weaponId)
scripts/sheets/actor-sheet.mjs     MODIFY  Combat context; rollAttack/addInjury/removeInjury; injury input wiring
templates/actor/actor-sheet.hbs    MODIFY  fill the Combat sub-tab
styles/better-dh2e.css             MODIFY  combat layout styles
```

---

### Task 1: Armour helper (TDD)

**Files:**
- Create: `test/combat-data.test.mjs`, `scripts/helpers/combat-data.mjs`

- [ ] **Step 1: Write the failing test** `test/combat-data.test.mjs`:

```javascript
// test/combat-data.test.mjs
import { describe, it, expect } from "vitest";
import { computeArmour } from "../scripts/helpers/combat-data.mjs";

const loc = (o) => ({ head: 0, body: 0, rightArm: 0, leftArm: 0, rightLeg: 0, leftLeg: 0, ...o });

describe("computeArmour", () => {
  it("no armour: every location equals the Toughness Bonus", () => {
    expect(computeArmour([], 4)).toEqual(loc({ head: 4, body: 4, rightArm: 4, leftArm: 4, rightLeg: 4, leftLeg: 4 }));
  });
  it("single non-additive piece adds its AP plus TB", () => {
    const r = computeArmour([{ additive: false, locations: loc({ body: 6 }) }], 4);
    expect(r.body).toBe(10);
    expect(r.head).toBe(4);
  });
  it("two non-additive pieces take the higher per location (not the sum)", () => {
    const r = computeArmour([
      { additive: false, locations: loc({ body: 6 }) },
      { additive: false, locations: loc({ body: 4 }) }
    ], 0);
    expect(r.body).toBe(6);
  });
  it("additive pieces stack on top of the best non-additive piece", () => {
    const r = computeArmour([
      { additive: false, locations: loc({ body: 6 }) },
      { additive: true, locations: loc({ body: 1, head: 1 }) }
    ], 4);
    expect(r.body).toBe(11); // 6 + 1 + 4
    expect(r.head).toBe(5);  // 0 + 1 + 4
  });
});
```

- [ ] **Step 2: Run — verify FAIL.** `npx vitest run test/combat-data.test.mjs` → FAIL.

- [ ] **Step 3: Implement** `scripts/helpers/combat-data.mjs`:

```javascript
// scripts/helpers/combat-data.mjs
// PURE — no Foundry imports.
export const HIT_LOCATIONS = ["head", "body", "rightArm", "leftArm", "rightLeg", "leftLeg"];

/**
 * Per-location protection = best non-additive AP + sum of additive AP + Toughness Bonus.
 * @param {Array<{additive:boolean, locations:Record<string,number>}>} armours  equipped armour
 * @param {number} toughnessBonus
 * @returns {Record<string,number>} protection per location
 */
export function computeArmour(armours, toughnessBonus = 0) {
  const result = {};
  for (const loc of HIT_LOCATIONS) {
    let best = 0;
    let additive = 0;
    for (const a of armours) {
      const ap = a.locations?.[loc] ?? 0;
      if (a.additive) additive += ap;
      else best = Math.max(best, ap);
    }
    result[loc] = best + additive + toughnessBonus;
  }
  return result;
}
```

- [ ] **Step 4: Run — verify PASS.** `npx vitest run test/combat-data.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add test/combat-data.test.mjs scripts/helpers/combat-data.mjs
git commit -m "feat: pure armour-protection helper with unit tests"
```

---

### Task 2: Weapon attack roll (reuse the roll system)

**Files:**
- Modify: `scripts/rolls/roll-test.mjs`

- [ ] **Step 1: Append `rollWeaponAttack`** to `scripts/rolls/roll-test.mjs` (it uses the existing internal `promptTest` and exported `performTest`):

```javascript
/** Basic weapon attack test: WS for melee, BS otherwise. Reuses the modifier dialog + chat card.
 * (Full hit-location / RoF / damage / evade resolution is a later plan.) */
export async function rollWeaponAttack(actor, weaponId) {
  const weapon = actor.items.get(weaponId);
  if (!weapon) return null;
  const charKey = weapon.system.weaponClass === "melee" ? "weaponSkill" : "ballisticSkill";
  const cfg = CONFIG.BDH.characteristics[charKey];
  const label = `${weapon.name} (${cfg.short})`;
  const choice = await promptTest({ title: label });
  if (!choice) return null;
  return performTest(actor, { label, base: actor.system.characteristics[charKey].total, modifier: choice.modifier });
}
```

- [ ] **Step 2: Syntax-check and commit**

Run: `node --check scripts/rolls/roll-test.mjs && npm test`
Expected: no output; tests PASS.

```bash
git add scripts/rolls/roll-test.mjs
git commit -m "feat: basic weapon attack test (WS/BS) reusing the roll dialog/card"
```

---

### Task 3: Actor sheet — Combat context, actions, injury wiring

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: Add imports** after the existing ones:

```javascript
import { computeArmour, HIT_LOCATIONS } from "../helpers/combat-data.mjs";
import { rollWeaponAttack } from "../rolls/roll-test.mjs";
```
(Note: `rollCharacteristic, rollSkill` are already imported from `roll-test.mjs`; add `rollWeaponAttack` to that existing import line instead of a duplicate import — i.e. `import { rollCharacteristic, rollSkill, rollWeaponAttack } from "../rolls/roll-test.mjs";`. Only add the `computeArmour, HIT_LOCATIONS` import as a new line.)

- [ ] **Step 2: Add three handlers** after the existing `static async #onToggleEquipped(...)`:

```javascript
  /** Action: basic attack test for an equipped weapon. */
  static async #onRollAttack(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await rollWeaponAttack(this.actor, id);
  }

  /** Action: add a blank lasting injury. */
  static async #onAddInjury(event, target) {
    const injuries = foundry.utils.deepClone(this.actor.system.injuries);
    injuries.push({ description: "" });
    await this.actor.update({ "system.injuries": injuries });
  }

  /** Action: remove a lasting injury by index. */
  static async #onRemoveInjury(event, target) {
    const injuries = foundry.utils.deepClone(this.actor.system.injuries);
    injuries.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.injuries": injuries });
  }
```

- [ ] **Step 3: Register the actions.** In `DEFAULT_OPTIONS.actions`, add (after `toggleEquipped: ...`):

```javascript
      rollAttack: DarkHeresyActorSheet.#onRollAttack,
      addInjury: DarkHeresyActorSheet.#onAddInjury,
      removeInjury: DarkHeresyActorSheet.#onRemoveInjury
```

- [ ] **Step 4: Build the Combat context.** In `_prepareContext`, before `return context;` (after the gear context from Plan 7), add:

```javascript
    const sys = this.document.system;
    const tb = sys.characteristics.toughness.bonus;
    const equippedArmour = items.filter((i) => i.type === "armour" && i.system.equipped).map((a) => a.system);
    const prot = computeArmour(equippedArmour, tb);
    const LOCLBL = { head: "Head", body: "Body", rightArm: "R Arm", leftArm: "L Arm", rightLeg: "R Leg", leftLeg: "L Leg" };
    context.armourRow = HIT_LOCATIONS.map((loc) => ({ key: loc, label: LOCLBL[loc], tb, ap: prot[loc] }));
    const eff = items.find((i) => i.type === "forceField" && i.system.equipped);
    context.forceFieldPR = eff ? eff.system.protectionRating : null;
    context.combatWeapons = items.filter((i) => i.type === "weapon" && i.system.equipped).map((w) => {
      const flags = weaponClassFlags(w.system.weaponClass);
      return {
        id: w.id, name: w.name,
        attackChar: (w.system.weaponClass === "melee" ? BDH.characteristics.weaponSkill : BDH.characteristics.ballisticSkill).short,
        summary: `${w.system.damage} ${BDH.damageTypes[w.system.damageType] ?? ""} · Pen ${w.system.penetration}`,
        usesAmmo: flags.usesAmmo, clip: `${w.system.clip.value}/${w.system.clip.max}`
      };
    });
    context.favTalents = items.filter((i) => i.type === "talent" && i.system.favourite)
      .map((t) => ({ id: t.id, name: t.name, desc: firstLine(t.system.description) }));
    context.injuries = sys.injuries.map((inj, i) => ({ index: i, description: inj.description }));
    context.agilityBonus = sys.characteristics.agility.bonus;
```

- [ ] **Step 5: Extend `_onRender`** to wire injury inputs. Inside the existing `_onRender` (after the `.bdh-qty` loop), add a second loop:

```javascript
    for (const input of this.element.querySelectorAll(".bdh-injury")) {
      input.addEventListener("change", (event) => {
        const idx = Number(event.currentTarget.dataset.index);
        const injuries = foundry.utils.deepClone(this.actor.system.injuries);
        if (injuries[idx]) {
          injuries[idx].description = event.currentTarget.value;
          this.actor.update({ "system.injuries": injuries });
        }
      });
    }
```

- [ ] **Step 6: Syntax-check and run tests**

Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`
Expected: no output; tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: Combat sub-tab context (armour row, weapons, wounds, injuries, talents, movement) + actions"
```

---

### Task 4: Template — Combat sub-tab

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Replace the Combat placeholder.** Change:

```handlebars
    <section class="tab {{subtabs.combat.cssClass}}" data-group="secondary" data-tab="combat">
      <p class="placeholder">Combat — coming in a later plan.</p>
    </section>
```
to:
```handlebars
    <section class="tab {{subtabs.combat.cssClass}}" data-group="secondary" data-tab="combat">
      <div class="bdh-armour-row">
        {{#each armourRow as |a|}}
          <div class="bdh-armloc">
            <div class="bdh-armtb">+{{a.tb}}</div>
            <div class="bdh-armap">{{a.ap}}</div>
            <div class="bdh-armlbl">{{a.label}}</div>
          </div>
        {{/each}}
      </div>
      {{#if forceFieldPR}}<div class="bdh-ff-line">🛡 Force Field — Protection Rating {{forceFieldPR}}</div>{{/if}}

      <div class="bdh-combat-grid">
        <div class="bdh-combat-col">
          <div class="bdh-section">
            <div class="bdh-section-head">Equipped Weapons</div>
            {{#each combatWeapons as |w|}}
              <div class="bdh-item-row" data-item-id="{{w.id}}">
                <button type="button" class="bdh-atk" data-action="rollAttack">⚔ {{w.attackChar}}</button>
                <span class="bdh-name" data-action="editItem">{{w.name}}</span>
                <span class="bdh-desc-line">{{w.summary}}</span>
                {{#if w.usesAmmo}}<span class="bdh-clip">{{w.clip}}</span>{{/if}}
              </div>
            {{/each}}
            {{#unless combatWeapons.length}}<div class="bdh-empty">No equipped weapons — equip them on the Gear tab.</div>{{/unless}}
          </div>
          <div class="bdh-section">
            <div class="bdh-section-head">★ Favourite Talents</div>
            {{#each favTalents as |t|}}
              <div class="bdh-item-row" data-item-id="{{t.id}}"><span class="bdh-name" data-action="editItem">{{t.name}}</span><span class="bdh-desc-line">{{t.desc}}</span></div>
            {{/each}}
            {{#unless favTalents.length}}<div class="bdh-empty">Star talents on the Abilities tab.</div>{{/unless}}
          </div>
        </div>

        <div class="bdh-combat-col">
          <div class="bdh-section">
            <div class="bdh-section-head">Wounds</div>
            <div class="bdh-wounds">
              <label>Current</label><input type="number" name="system.wounds.value" value="{{system.wounds.value}}"/>
              <label>Max</label><input type="number" name="system.wounds.max" value="{{system.wounds.max}}"/>
              <label>Critical</label><input type="number" name="system.wounds.critical" value="{{system.wounds.critical}}"/>
            </div>
          </div>
          <div class="bdh-section">
            <div class="bdh-section-head">Lasting Injuries <button type="button" class="bdh-add" data-action="addInjury">＋</button></div>
            {{#each injuries as |inj|}}
              <div class="bdh-item-row">
                <input type="text" class="bdh-injury" data-index="{{inj.index}}" value="{{inj.description}}" placeholder="e.g. Lost left arm"/>
                <a class="bdh-del" data-action="removeInjury" data-index="{{inj.index}}" title="Remove">✖</a>
              </div>
            {{/each}}
            {{#unless injuries.length}}<div class="bdh-empty">None.</div>{{/unless}}
          </div>
          <div class="bdh-section">
            <div class="bdh-section-head">Movement &amp; Initiative</div>
            <div class="bdh-move">
              <span>Half {{system.movement.half}} m</span><span>Full {{system.movement.full}} m</span>
              <span>Charge {{system.movement.charge}} m</span><span>Run {{system.movement.run}} m</span>
            </div>
            <div class="bdh-init">Initiative: 1d10 + {{agilityBonus}} (Ag)</div>
          </div>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Combat sub-tab content (armour row, weapons, wounds, injuries, talents, movement)"
```

---

### Task 5: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append:**

```css

/* Combat sub-tab */
.better-dh2e .bdh-armour-row { display:flex; gap:5px; padding:8px 14px 4px; }
.better-dh2e .bdh-armloc { flex:1; text-align:center; }
.better-dh2e .bdh-armtb { width:55%; margin:0 auto; background:#3d5a2a; color:var(--bdh-parch); font-size:10px; border-radius:3px 3px 0 0; }
.better-dh2e .bdh-armap { background:#fff6df; border:1px solid var(--bdh-brown); border-radius:0 0 3px 3px; padding:4px 0; font-size:18px; font-weight:bold; }
.better-dh2e .bdh-armlbl { font-size:9px; color:var(--bdh-muted); text-transform:uppercase; margin-top:2px; }
.better-dh2e .bdh-ff-line { margin:2px 14px 6px; font-size:11px; color:#2a3a5a; }
.better-dh2e .bdh-combat-grid { display:grid; grid-template-columns:1fr 220px; gap:10px; padding:4px 14px 12px; }
.better-dh2e .bdh-combat-col .bdh-section { margin:0 0 10px; }
.better-dh2e .bdh-atk { flex:0 0 auto; background:var(--bdh-maroon); color:var(--bdh-parch); border:none; border-radius:3px; font-size:11px; padding:2px 8px; cursor:pointer; }
.better-dh2e .bdh-wounds { display:grid; grid-template-columns:auto 1fr; gap:4px 8px; align-items:center; padding:6px 10px; }
.better-dh2e .bdh-wounds label { color:var(--bdh-muted); font-size:11px; text-transform:uppercase; }
.better-dh2e .bdh-wounds input { width:60px; }
.better-dh2e .bdh-injury { flex:1; min-width:0; }
.better-dh2e .bdh-move { display:grid; grid-template-columns:1fr 1fr; gap:2px 10px; padding:6px 10px; font-size:11px; }
.better-dh2e .bdh-init { padding:2px 10px 6px; font-size:11px; color:var(--bdh-muted); }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: Combat sub-tab styles"
```

---

### Task 6: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)" → Stats → **Combat** sub-tab):
- [ ] **Armour row**: six location squares; with no equipped armour each big box equals the **Toughness Bonus** (e.g. 3). Equip a Carapace Chestplate (Body 6) on the Gear tab → Body box becomes **6 + TB**; add an additive Flak Cloak (All 1) → each location +1.
- [ ] Equip a **force field** → the "Force Field — Protection Rating n" line shows.
- [ ] **Equipped Weapons**: equip a weapon on Gear → it appears here with a **⚔ WS/BS** button; click it → the modifier dialog opens and posts the attack test chat card (reusing the roll system).
- [ ] **Wounds**: set Current/Max/Critical → reopen, values persist.
- [ ] **Lasting Injuries**: press ＋ → a blank row; type "Lost left arm" → switch tabs and back, it persists; ✖ removes it.
- [ ] **Favourite Talents**: star a talent on Abilities → it shows here.
- [ ] **Movement & Initiative**: shows half/full/charge/run and "1d10 + Ag".
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Spec coverage (§6 Combat):**
- Armour row (TB box + total protection) → Tasks 1/3/4 (`computeArmour`). ✓
- Force-field PR line → Tasks 3/4. ✓
- Equipped-weapon attack buttons (reusing rolls) → Tasks 2/3/4 (`rollWeaponAttack`). ✓
- Wounds, lasting injuries, favourite talents, movement/init → Tasks 3/4. ✓

**Deferred (declared):** full attack resolution (hit location/RoF/damage/soak/evade); Afflictions/Psychic/Advancement; encumbrance penalties.

**Placeholder scan:** complete; checklist uses concrete numbers (Body 6 + TB; +1 additive).

**Type/name consistency:** `computeArmour`/`HIT_LOCATIONS` signatures match helper/test/sheet. `rollWeaponAttack` exported from `roll-test.mjs`, imported on the existing import line. Action names `rollAttack`/`addInjury`/`removeInjury` match `DEFAULT_OPTIONS.actions`, handlers, and template `data-action`. Wounds inputs are named (`system.wounds.*`) and save via the `<div>`-rooted form; injury inputs are `.bdh-injury` with no `name` (wired in `_onRender`, which already awaits `super`). `system.injuries`/`wounds`/`movement`/`characteristics` exist on the actor model; `system.equipped` on weapon/armour/forceField; `favourite` on talent. `weaponClassFlags`/`BDH.*` already imported (Plan 7).
