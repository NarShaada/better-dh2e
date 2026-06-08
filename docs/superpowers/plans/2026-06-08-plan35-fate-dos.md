# Better DH2e — Plan 35: Spend Fate for +1 DoS

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second chat context-menu option — **"Spend Fate: +1 DoS"** — on a *successful* test card (skill / characteristic / attack / focus). It deducts 1 Fate and re-resolves the test with the **same roll** but **+1 Degree of Success**. For attacks/focus, the extra DoS re-derives hits (more hits where the type scales). One-shot per test (not stackable).

**Architecture:** Reuses the reroll machinery (the `resolveAttack`/`resolveManifest`/`performTest` resolvers + the `getChatMessageContextOptions` hook from Plan 34). Each resolver gains two optional inputs: `fixedRoll` (pin the roll — no new die) and `dosBonus` (added to DoS). Each stores the original `roll`, `success`, and applied `dosBonus` in its reroll payload. A new `addDoSFromFate` dispatches like `rerollFromFate` but with `{ fixedRoll: payload.roll, dosBonus: 1 }`. Non-stackable: the option's condition requires the stored `dosBonus === 0`.

**Tech Stack:** Foundry v13/v14 (Roll, ChatMessage, the chat context-menu hook), Handlebars. (Integration-only; the 119 tests stay green.)

**Scope:** the +1 DoS spend for successful tests. **Out of scope:** other Fate uses; stacking; DoS on failures.

**Reference (confirmed):** success-only; pins the roll (no new die); **not stackable** (1 Fate = +1 DoS, once per test); attacks/focus re-derive hits from the bumped DoS; a focus +DoS does **not** re-roll Psychic Phenomena (already happened on the original cast).

Builds directly on Plan 34: `scripts/rolls/fate.mjs`, the resolvers in `roll-test.mjs`/`attack.mjs`/`manifest.mjs`, the reroll payload, and the context-menu hook in `scripts/better-dh2e.mjs`.

---

## File Structure

```
scripts/rolls/roll-test.mjs    MODIFY  performTest: fixedRoll/dosBonus opts; store roll/success/dosBonus
scripts/rolls/attack.mjs       MODIFY  resolveAttack: fixedRoll/dosBonus; pin roll, boost dos, payload, no new die on +DoS
scripts/rolls/manifest.mjs     MODIFY  resolveManifest: fixedRoll/dosBonus; skip phenomena on +DoS; payload
templates/chat/test-card.hbs   MODIFY  show a "(+N DoS · Fate)" note when dosBonus>0
templates/chat/attack-card.hbs MODIFY  same note
templates/chat/cast-card.hbs   MODIFY  same note
scripts/rolls/fate.mjs         MODIFY  canAddDoS + addDoSFromFate
scripts/better-dh2e.mjs        MODIFY  add the "+1 DoS" context-menu option
```

---

### Task 1: Resolvers accept `fixedRoll` + `dosBonus` (+ card note)

**Files:** `scripts/rolls/roll-test.mjs`, `scripts/rolls/attack.mjs`, `scripts/rolls/manifest.mjs`, `templates/chat/{test,attack,cast}-card.hbs`

- [ ] **Step 1: `performTest`.** Rewrite to accept the two opts (pin the roll when `fixedRoll` set; no new die / no `rolls` attachment then; add `dosBonus` to DoS on success; store `roll`/`success`/`dosBonus` in the payload):
```javascript
export async function performTest(actor, { label, base, modifier, fixedRoll = null, dosBonus = 0 }) {
  const roll = fixedRoll != null ? { total: fixedRoll } : await new Roll("1d100").evaluate();
  const result = evaluateTest({ base, modifier: parseModifier(modifier), roll: roll.total });
  const dos = result.success ? result.degrees + dosBonus : 0;
  const modifierLabel = `${result.modifier >= 0 ? "+" : ""}${result.modifier}`;
  const content = await renderTemplate(CARD, { label, ...result, degrees: dos, modifierLabel, dosBonus });
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    flags: { [NS]: { reroll: { kind: "test", actorUuid: actor.uuid, base, modifier, label, roll: roll.total, success: result.success, dosBonus } } }
  };
  if (fixedRoll == null) { messageData.rolls = [roll]; ChatMessage.applyRollMode(messageData, "roll"); }
  await ChatMessage.create(messageData);
  return result;
}
```

- [ ] **Step 2: `resolveAttack`** (attack.mjs). Destructure the new opts: `const { consumeAmmo = true, fixedRoll = null, dosBonus = 0 } = opts;`. Replace the to-hit roll:
```javascript
  const roll = fixedRoll != null ? { total: fixedRoll } : await new Roll("1d100").evaluate();
```
After `evaluateTest` gives `{ success, degrees, ... }`, change the DoS line to add the bonus:
```javascript
  const dos = success ? degrees + dosBonus : 0;
```
(`nHits = computeHits(at, dos, ...)` then naturally yields the extra hits; `hitLocation(roll.total)` is unchanged — same pinned roll → same first location.) Add `roll: roll.total, success, dosBonus` to the `reroll` payload object. Add `dosBonus` to the card render data. Only attach the die when it's a real roll:
```javascript
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), content, flags };
  if (fixedRoll == null) { messageData.rolls = [roll]; }
  ChatMessage.applyRollMode(messageData, "roll");
  const msg = await ChatMessage.create(messageData);
```
(If the current code builds `messageData` with `rolls: [roll]` inline, restructure as above so `rolls` is conditional. Keep ammo deduction gated on `consumeAmmo` as in Plan 34 — a +DoS, like a reroll, passes `consumeAmmo:false`, so no extra ammo and — via `liveTarget` being null when `opts.targetUuid` is set — no force-field re-roll.)

- [ ] **Step 3: `resolveManifest`** (manifest.mjs). Destructure `const { effPR, circ = 0, fixedRoll = null, dosBonus = 0 } = opts;`. Pin the focus roll:
```javascript
  const roll = fixedRoll != null ? { total: fixedRoll } : await new Roll("1d100").evaluate();
```
Add the bonus to DoS: `const dos = success ? degrees + dosBonus : 0;`. **Gate the entire phenomena block on `fixedRoll == null`** (a +DoS is not a new manifest — it must NOT roll fresh phenomena/perils):
```javascript
  let phenTriggered = false, phenRoll = null, phenMod = 0, phenTotal = null, perilRoll = null;
  const extraRolls = [];
  if (fixedRoll == null) {
    phenTriggered = phenomenaTriggers(psykerClass, state, doubles);
    if (phenTriggered) { /* ...existing phenomena/perils rolls... */ }
  }
```
Add `roll: roll.total, success, dosBonus` to BOTH flag shapes' `reroll` payloads; add `dosBonus` to `cardData`. Attach `rolls` only when `fixedRoll == null` (so a +DoS posts no new dice):
```javascript
  const messageData = { speaker: ChatMessage.getSpeaker({ actor }), content, flags: messageFlags };
  if (fixedRoll == null) messageData.rolls = [roll, ...extraRolls];
  ChatMessage.applyRollMode(messageData, "roll");
  await ChatMessage.create(messageData);
```

- [ ] **Step 4: Card note.** In each of `templates/chat/test-card.hbs`, `attack-card.hbs`, `cast-card.hbs`, add near the result/DoS line (so the boosted card shows the Fate origin):
```handlebars
{{#if dosBonus}}<span class="bdh-fate-note">+{{dosBonus}} DoS · Fate</span>{{/if}}
```
(Place it inside the result block, e.g. right after the "Success (N DoS)" text. For the attack card it can go on the result line; for the cast card next to the focus result.)

- [ ] **Step 5: Style.** Append to `styles/better-dh2e.css`:
```css
.better-dh2e .bdh-fate-note, .bdh-fate-note { color:#b8860b; font-size:11px; margin-left:6px; }
```

- [ ] **Step 6: Verify and commit.** `node --check scripts/rolls/roll-test.mjs scripts/rolls/attack.mjs scripts/rolls/manifest.mjs && npm test`.
```bash
git add scripts/rolls/roll-test.mjs scripts/rolls/attack.mjs scripts/rolls/manifest.mjs templates/chat/test-card.hbs templates/chat/attack-card.hbs templates/chat/cast-card.hbs styles/better-dh2e.css
git commit -m "feat: resolvers accept fixedRoll + dosBonus (pin roll, boost DoS); reroll payload carries roll/success/dosBonus"
```
Expected: no syntax errors; 119 tests PASS; the normal paths are unchanged (fixedRoll null → rolls as before; dosBonus 0 → no boost).

---

### Task 2: `+1 DoS` action + context-menu option

**Files:** `scripts/rolls/fate.mjs`, `scripts/better-dh2e.mjs`

- [ ] **Step 1: `fate.mjs` — guard + dispatcher.** Add:
```javascript
/** May the current user spend Fate to add +1 DoS? (success + owns + ≥1 Fate + not already boosted) */
export function canAddDoS(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr || !rr.success || (rr.dosBonus ?? 0) !== 0) return false;
  const actor = fromUuidSync(rr.actorUuid);
  return !!actor?.isOwner && (actor.system?.fate?.value ?? 0) >= 1;
}

/** Spend 1 Fate → re-resolve the SAME roll with +1 DoS (non-stackable). */
export async function addDoSFromFate(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr || !rr.success || (rr.dosBonus ?? 0) !== 0) return;
  const actor = await fromUuid(rr.actorUuid);
  if (!actor?.isOwner) { ui.notifications.warn("You don't own this character."); return; }
  const fate = actor.system.fate?.value ?? 0;
  if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
  await actor.update({ "system.fate.value": fate - 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} spends a Fate point (+1 DoS).</header></div>`
  });
  const boost = { fixedRoll: rr.roll, dosBonus: 1 };
  if (rr.kind === "test") {
    await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier, ...boost });
  } else if (rr.kind === "attack") {
    const weapon = actor.items.get(rr.weaponId);
    if (weapon) await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, targetUuid: rr.targetUuid, targetName: rr.targetName, ...boost });
  } else if (rr.kind === "cast") {
    const power = actor.items.get(rr.powerId);
    if (power) await resolveManifest(actor, power, { effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName, ...boost });
  }
}
```
(`performTest`/`resolveAttack`/`resolveManifest` are already imported in fate.mjs.)

- [ ] **Step 2: Context-menu option.** In `scripts/better-dh2e.mjs`, import `canAddDoS, addDoSFromFate` (merge into the existing fate.mjs import) and push a SECOND option inside the same `getChatMessageContextOptions` hook (after the reroll option), reusing the `idOf` helper:
```javascript
  options.push({
    name: "Spend Fate: +1 DoS",
    icon: '<i class="fas fa-plus-circle"></i>',
    condition: (li) => canAddDoS(game.messages.get(idOf(li))),
    callback: (li) => { const m = game.messages.get(idOf(li)); if (m) addDoSFromFate(m); }
  });
```

- [ ] **Step 3: Verify and commit.** `node --check scripts/rolls/fate.mjs scripts/better-dh2e.mjs && npm test`.
```bash
git add scripts/rolls/fate.mjs scripts/better-dh2e.mjs
git commit -m "feat: Spend Fate +1 DoS — success-only, one-shot, re-derives hits (context menu)"
```

---

### Task 3: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (a character with Fate; the test psyker for casts):
- [ ] **Successful skill/char test** → right-click → **"Spend Fate: +1 DoS"** appears → click deducts 1 Fate, posts "[Name] spends a Fate point (+1 DoS)", and a fresh card with the **same roll** but **DoS one higher** (and the "+1 DoS · Fate" note); **no new die** is animated.
- [ ] **Failed test** → the +1 DoS option does **not** appear (Reroll still does).
- [ ] **Not stackable** → on the boosted card, "+1 DoS" is **gone** (Reroll still available); **someone else's** card / **no Fate** → not offered.
- [ ] **Attack** (e.g. a Storm/Barrage psychic or a full-auto weapon) → +1 DoS yields an **extra hit** (Storm +1, Barrage +1 per 2 DoS, capped at RoF); the clip is **not** re-decremented; the new card's Roll Damage uses the extra hits.
- [ ] **Focus power** → +1 DoS re-derives hits for attack powers and does **NOT** roll a fresh Psychic Phenomena (no second phenomena card).
- [ ] Reroll still works (fresh roll, no boost) and a rerolled card again offers +1 DoS.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** resolver opts + payload + card note (T1); canAddDoS/addDoSFromFate + menu option (T2). ✓

**Deferred (declared):** other Fate uses; stacking.

**Placeholder scan:** complete; checklist concrete (success-only; one-shot via dosBonus===0; attack extra hit; no second phenomena).

**Type/name consistency:** `fixedRoll`/`dosBonus` opts are read by all three resolvers; each writes `roll`/`success`/`dosBonus` into its existing `reroll` payload. `canAddDoS` gates on `rr.success && rr.dosBonus===0 && isOwner && fate>=1`; `addDoSFromFate` re-checks and dispatches with `{ fixedRoll: rr.roll, dosBonus: 1 }`. Non-stackable because the boosted card stores `dosBonus:1` → `canAddDoS` returns false. Phenomena is skipped on a focus +DoS (`fixedRoll != null`); ammo + force-field are skipped on attack +DoS (via `consumeAmmo:false` + `targetUuid` override) — same as reroll. Normal paths unchanged (fixedRoll null, dosBonus 0). NS = "better-dh2e".
