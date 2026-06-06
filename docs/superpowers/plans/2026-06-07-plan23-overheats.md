# Better DH2e — Plan 23: Overheats quality

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **Overheats** weapon quality (black ⚙). When an Overheats weapon would jam, the attack card shows an **🔥 Overheat!** prompt with two buttons: **Drop!** (unequip, no damage) and **Roll Damage** (pick a hand → roll the weapon's base damage at Pen 0 against the attacker → apply via the normal damage flow).

**Architecture:** Reuse the existing jam detection (`effectiveJamFloor`) — overheat fires exactly when the weapon jams (ranged-only; Reliable/Best craftsmanship reduce it). The attack card swaps its "jammed" line for the overheat prompt when the weapon has Overheats. Two new chat-button handlers reuse the existing damage card + `applyDamage`: Drop! unequips the weapon; Roll Damage posts a self-targeted damage card (Pen 0, empty qualities so no other on-damage qualities re-fire) that the GM applies to the attacker's chosen arm.

**Tech Stack:** Foundry v13 (ChatMessage flags/buttons, DialogV2), Vitest, Handlebars.

**Scope:** Overheats. **Out of scope:** melee overheat (jams are ranged), auto-applying the self-damage (GM clicks Apply), re-triggering other on-damage qualities on the self-hit.

**Reference (confirmed with user):**
1. Overheat triggers on the jam condition (`effectiveJamFloor`) — Reliable/Best reduce it; ranged-only.
2. Roll Damage = weapon **base** damage, **Pen 0**, vs a chosen **arm**, soaked by the attacker's own armour/TB through the normal Apply step.
3. The self-damage does **not** re-fire other qualities (empty qualities on the overheat damage card).

Builds on Plan 16 (jam, damage card, `applyDamage`, `formatRoll`, `bindCardButtons`) and Plan 17+ (`effectiveJamFloor`, damage-card flags).

---

## File Structure

```
scripts/config.mjs                    MODIFY  add overheats to BDH.qualities (automation:"full")
scripts/helpers/quality-modules.mjs   MODIFY  hasOverheats
test/quality-modules.test.mjs         MODIFY  hasOverheats test
scripts/rolls/attack.mjs              MODIFY  rollAttack overheats card flag; rollOverheatDrop + rollOverheatDamage; bindCardButtons dispatch
templates/chat/attack-card.hbs        MODIFY  overheat prompt + buttons in the jam state
```

---

### Task 1: Config + helper (TDD)

**Files:** `scripts/config.mjs`; `test/quality-modules.test.mjs`, `scripts/helpers/quality-modules.mjs`.

- [ ] **Step 1: Config.** In `BDH.qualities` (config.mjs), add:
```javascript
  overheats:  { label: "Overheats", takesValue: false, automation: "full" },
```

- [ ] **Step 2: Failing test.** In `test/quality-modules.test.mjs`, add `hasOverheats` to the import and append:
```javascript
describe("hasOverheats", () => {
  it("detects Overheats", () => {
    expect(hasOverheats(Q("overheats"))).toBe(true);
    expect(hasOverheats(Q())).toBe(false);
  });
});
```

- [ ] **Step 3: Run — FAIL.** `npx vitest run test/quality-modules.test.mjs`.

- [ ] **Step 4: Implement** in `scripts/helpers/quality-modules.mjs`:
```javascript
export function hasOverheats(qualities) { return has(qualities, "overheats"); }
```

- [ ] **Step 5: Run — PASS.** `npx vitest run test/quality-modules.test.mjs`, then `node --check scripts/config.mjs && npm test`.

- [ ] **Step 6: Commit.**
```bash
git add scripts/config.mjs scripts/helpers/quality-modules.mjs test/quality-modules.test.mjs
git commit -m "feat: Overheats config + hasOverheats helper (TDD)"
```

---

### Task 2: Wire Overheats (attack card prompt + handlers)

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/attack-card.hbs`

- [ ] **Step 1:** Import `hasOverheats` (merge into the existing quality-modules import). Confirm `DialogV2` is available in attack.mjs (it is used by `rollEvade`; if not imported at module top, add `const { DialogV2 } = foundry.applications.api;`).

- [ ] **Step 2: Attack-card flag.** In `rollAttack`, in the attack-card `renderTemplate(CARD, { ... })` data object, add:
```javascript
    overheats: jammed && hasOverheats(weapon.system.qualities),
```
(The attack flags already carry `actorUuid`, `weaponId`, and `qualities` — enough for the handlers.)

- [ ] **Step 3: Template.** In `templates/chat/attack-card.hbs`, replace the jam line:
```handlebars
  {{#if jammed}}<div class="bdh-card-line fail">&#9888; Weapon jammed!</div>{{/if}}
```
with:
```handlebars
  {{#if jammed}}
    {{#if overheats}}<div class="bdh-card-line fail">&#128293; Overheat! <button type="button" data-bdh="overheatDrop">Drop!</button> <button type="button" data-bdh="overheatDamage">Roll Damage</button></div>
    {{else}}<div class="bdh-card-line fail">&#9888; Weapon jammed!</div>{{/if}}
  {{/if}}
```

- [ ] **Step 4: Handlers.** In `attack.mjs`, add two handlers (near the other follow-up handlers like `rollConcussiveTest`):
```javascript
async function rollOverheatDrop(message) {
  const f = message.flags[NS];
  const attacker = await fromUuid(f.actorUuid);
  const weapon = attacker?.items.get(f.weaponId);
  if (!weapon) return;
  await weapon.update({ "system.equipped": false });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="bdh-card"><div class="bdh-card-line">${attacker.name} drops ${weapon.name} — overheat avoided.</div></div>`
  });
}

async function rollOverheatDamage(message) {
  const f = message.flags[NS];
  const attacker = await fromUuid(f.actorUuid);
  const weapon = attacker?.items.get(f.weaponId);
  if (!weapon) return;
  const hand = await DialogV2.prompt({
    window: { title: "Overheat — which hand?" },
    content: `<div class="form-group"><label>Hand</label><select name="hand"><option value="rightArm">Right Arm</option><option value="leftArm">Left Arm</option></select></div>`,
    ok: { label: "Roll Damage", callback: (event, button) => button.form.elements.hand.value },
    rejectClose: false
  });
  if (!hand) return;
  const roll = await new Roll(weapon.system.damage).evaluate();
  const rf = roll.dice.some((d) => d.faces === 10 && d.results.some((r) => r.active && r.result === 10));
  const hits = [{ location: hand, label: BDH.hitLocationLabels[hand], total: roll.total, rf, breakdown: formatRoll(roll) }];
  const cardData = {
    weaponName: `${weapon.name} (Overheat)`, damageType: weapon.system.damageType, penetration: 0, hits,
    targetName: attacker.name, canApply: game.user.isGM,
    shocking: false, concussive: null, flame: false, hallucinogenic: null, damageNotes: ""
  };
  const content = await renderTemplate("systems/better-dh2e/templates/chat/damage-card.hbs", cardData);
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor: attacker }), rolls: [roll], content,
    flags: { [NS]: { type: "damage", targetUuid: attacker.uuid, targetName: attacker.name, penetration: 0,
      damageType: weapon.system.damageType, qualities: [],
      hits: hits.map((h) => ({ location: h.location, label: h.label, total: h.total, rf: h.rf })) } }
  };
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
}
```
(`formatRoll`, `BDH`, `NS`, `fromUuid`, `renderTemplate`, `ChatMessage`, `Roll` are all in scope in attack.mjs. The overheat damage card reuses `damage-card.hbs`; its **Apply Damage** button (`canApply` true for GM, `targetUuid` = attacker) routes to the existing `applyDamage`, soaking the attacker's own arm armour + TB at Pen 0. `qualities: []` means no other on-damage quality re-fires.)

- [ ] **Step 5: Dispatch.** In `bindCardButtons`, add branches (next to the existing `data-bdh` ones):
```javascript
      else if (btn.dataset.bdh === "overheatDrop") await rollOverheatDrop(message);
      else if (btn.dataset.bdh === "overheatDamage") await rollOverheatDamage(message);
```

- [ ] **Step 6: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/attack-card.hbs
git commit -m "feat: Overheats — jam becomes an overheat prompt (Drop! / Roll Damage to a hand at Pen 0)"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (give a ranged test weapon the **Overheats** quality; to force an overheat, set its craftsmanship to make a jam likely or just roll until a failed ranged attack jams — a Poor/Unreliable weapon jams on 91+):
- [ ] **Gear tier**: Overheats shows a **black ⚙** on the item sheet.
- [ ] **Overheat prompt**: when an Overheats weapon jams (failed ranged roll at/above its jam floor), the attack card shows **🔥 Overheat!** with **Drop!** and **Roll Damage** buttons instead of "Weapon jammed!". A non-Overheats weapon still shows the plain "Weapon jammed!".
- [ ] **Drop!**: unequips the weapon (gone from equipped/Combat) and posts a "drops … — overheat avoided" note.
- [ ] **Roll Damage**: opens the hand dialog (Right/Left Arm), rolls the weapon's base damage (Pen 0) as a damage card targeting the **attacker**; **Apply Damage** reduces the attacker's wounds (soaking that arm's armour + TB), and a natural 10 still shows Righteous Fury.
- [ ] **Reliability interaction**: a **Reliable** or **Best** Overheats weapon overheats much less / never (jam floor 100 / never) — confirm no overheat on a Best one.
- [ ] **F12**: no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** config + helper (Task 1, TDD); attack-card overheat prompt + Drop!/Roll-Damage handlers + dispatch (Task 2). ✓

**Deferred (declared):** melee overheat; auto-applying self-damage; other qualities on the self-hit.

**Placeholder scan:** complete; checklist concrete (Drop unequips; Roll Damage → arm → Pen 0 → Apply).

**Type/name consistency:** `hasOverheats` matches its test + the rollAttack card flag. The overheat prompt reuses the attack card's `jammed` state (so it only shows when the weapon jams — ranged, post-`effectiveJamFloor`, so Reliable/Best reduce it). Handlers read the attack flags (`actorUuid`, `weaponId`) already present. `rollOverheatDamage` builds a `damage-card.hbs` card with all its expected fields (resist flags falsy, `damageNotes` empty, `canApply`/`targetName` set) and damage flags shaped like `rollDamage`'s, so the existing `applyDamage` consumes it unchanged (target = attacker, Pen 0, `qualities: []`). Buttons dispatched in `bindCardButtons`; `DialogV2`/`formatRoll`/`BDH` in scope.
