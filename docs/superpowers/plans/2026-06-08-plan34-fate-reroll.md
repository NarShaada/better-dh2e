# Better DH2e — Plan 34: Spend Fate to Reroll

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click any rerollable test card (skill / characteristic / attack / focus power) → a **"Spend Fate: Reroll"** context-menu option (shown only to an owner of the rolling actor who has ≥1 Fate). It deducts 1 Fate, posts a "[Name] spends Fate" card, and **re-resolves the test with a fresh d100 and the exact same inputs** (full re-resolution: attacks re-derive hits/locations/jam; focus re-runs phenomena/perils + attack synthesis). The new result stands; the original card stays.

**Architecture:** Each roll producer stores a small **reroll payload** in its message flags and exposes a "resolve from inputs" entry point that rolls its own d100 (so calling it again *is* the reroll). `performTest` already works this way (just add flags). `rollAttack`/`rollManifest` are split into a dialog wrapper + an exported `resolveAttack`/`resolveManifest`. A new `fate.mjs` reads the payload, deducts Fate, and dispatches to the right resolver. A chat context-menu hook surfaces the option.

**Tech Stack:** Foundry v13/v14 (`getChatMessageContextOptions` hook, Roll, ChatMessage), Handlebars. (Integration-heavy; no new pure logic → the 119 tests stay green.)

**Scope:** the reroll mechanism for skills, characteristics, attacks, focus power. **Out of scope:** other Fate uses (the +/− buttons stay as-is); "keep the better roll"; rerolling damage/resist sub-rolls.

**Reference (confirmed):** full re-resolution for attacks/focus; an attack reroll does **not** re-spend ammo; the new result **stands** (no keep-better); reroll **appends** new cards (original stays); shown only to an **owner** of the rolling actor (a player only owns their own character; GM owns all) with **≥1 Fate**.

Builds on: `performTest` (roll-test.mjs), `rollAttack`/`bindCardButtons` (attack.mjs), `rollManifest` (manifest.mjs), the `better-dh2e` flags namespace (`NS`), the `renderChatMessageHTML` hook registration in `better-dh2e.mjs`.

---

## File Structure

```
scripts/rolls/roll-test.mjs    MODIFY  performTest stores a {kind:"test"} reroll payload
scripts/rolls/fate.mjs         NEW     canReroll + rerollFromFate (dispatcher) + spends-Fate card
scripts/rolls/attack.mjs       MODIFY  split rollAttack → dialog + exported resolveAttack (consumeAmmo/target opts + reroll payload)
scripts/rolls/manifest.mjs     MODIFY  split rollManifest → dialog + exported resolveManifest (reroll payload)
better-dh2e.mjs                 MODIFY  register the getChatMessageContextOptions hook
```

---

### Task 1: Reroll mechanism for simple tests (skills / characteristics)

This delivers the whole pipeline end-to-end for `performTest`-based tests (rollSkill, rollCharacteristic, rollAfflictionTest, rollWeaponAttack). Attacks/focus come in Tasks 2-3.

**Files:** `scripts/rolls/roll-test.mjs`, create `scripts/rolls/fate.mjs`, `better-dh2e.mjs`.

- [ ] **Step 1: performTest stores a reroll payload.** In `roll-test.mjs`, add `const NS = "better-dh2e";` near the top, and in `performTest`, attach flags so the message can be re-resolved (the input `modifier` is kept verbatim — calling `performTest` again re-parses + re-rolls identically):
```javascript
  const messageData = {
    speaker: ChatMessage.getSpeaker({ actor }),
    content,
    rolls: [roll],
    flags: { [NS]: { reroll: { kind: "test", actorUuid: actor.uuid, base, modifier, label } } }
  };
  ChatMessage.applyRollMode(messageData, "roll");
```

- [ ] **Step 2: `fate.mjs` — guard + dispatcher.** Create `scripts/rolls/fate.mjs`:
```javascript
// scripts/rolls/fate.mjs — Spend Fate to reroll a test.
import { performTest } from "./roll-test.mjs";
import { resolveAttack } from "./attack.mjs";
import { resolveManifest } from "./manifest.mjs";

const NS = "better-dh2e";

/** May the current user spend Fate to reroll this message? (owns the actor + has ≥1 Fate) */
export function canReroll(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr) return false;
  const actor = fromUuidSync(rr.actorUuid);
  return !!actor?.isOwner && (actor.system?.fate?.value ?? 0) >= 1;
}

/** Spend 1 Fate → post a "spends Fate" card → re-resolve the test with a fresh roll. */
export async function rerollFromFate(message) {
  const rr = message?.flags?.[NS]?.reroll;
  if (!rr) return;
  const actor = await fromUuid(rr.actorUuid);
  if (!actor?.isOwner) { ui.notifications.warn("You don't own this character."); return; }
  const fate = actor.system.fate?.value ?? 0;
  if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
  await actor.update({ "system.fate.value": fate - 1 });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="bdh-card"><header class="bdh-card-head">${actor.name} spends a Fate point to reroll.</header></div>`
  });
  if (rr.kind === "test") {
    await performTest(actor, { label: rr.label, base: rr.base, modifier: rr.modifier });
  } else if (rr.kind === "attack") {
    const weapon = actor.items.get(rr.weaponId);
    if (weapon) await resolveAttack(actor, weapon, rr.choice, { consumeAmmo: false, targetUuid: rr.targetUuid, targetName: rr.targetName });
  } else if (rr.kind === "cast") {
    const power = actor.items.get(rr.powerId);
    if (power) await resolveManifest(actor, power, { effPR: rr.effPR, circ: rr.circ, targetUuid: rr.targetUuid, targetName: rr.targetName });
  }
}
```
(The `resolveAttack`/`resolveManifest` imports resolve once Tasks 2-3 export them; the "attack"/"cast" branches are dormant until then. To keep Task 1 runnable on its own, the imports are fine as long as those exports exist — so in this task, also add temporary `export async function resolveAttack(){}` / `export async function resolveManifest(){}` stubs ONLY IF the real exports aren't present yet. If implementing all tasks in sequence, skip the stubs and just ensure Tasks 2-3 land before deploy.)

- [ ] **Step 3: Register the context-menu hook.** In `better-dh2e.mjs`, import and register:
```javascript
import { canReroll, rerollFromFate } from "./rolls/fate.mjs";

Hooks.on("getChatMessageContextOptions", (html, options) => {
  const idOf = (li) => li?.dataset?.messageId ?? li?.getAttribute?.("data-message-id") ?? li?.[0]?.dataset?.messageId;
  options.push({
    name: "Spend Fate: Reroll",
    icon: '<i class="fas fa-dice-d10"></i>',
    condition: (li) => canReroll(game.messages.get(idOf(li))),
    callback: (li) => { const m = game.messages.get(idOf(li)); if (m) rerollFromFate(m); }
  });
});
```
**Verify the hook name + `li` form for this Foundry build** — v13/v14 use `getChatMessageContextOptions` and pass the message's list element (HTMLElement with `dataset.messageId`); the `idOf` helper covers HTMLElement + jQuery fallbacks. Adjust if the running version differs.

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/roll-test.mjs scripts/rolls/fate.mjs better-dh2e.mjs && npm test`.
```bash
git add scripts/rolls/roll-test.mjs scripts/rolls/fate.mjs better-dh2e.mjs
git commit -m "feat: Spend Fate to reroll — mechanism + context menu, wired for skill/characteristic tests"
```

---

### Task 2: Attack reroll (split rollAttack)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1: Extract `resolveAttack`.** Refactor `rollAttack(actor, weaponId)` so the **dialog** stays in `rollAttack` and **everything after `if (!choice) return null;`** (the modifier math, ammo check, roll, evaluateTest, penetration, hits, locations, jam, scatter, target, flags, card render, message create, ammo deduction, `return msg`) moves into a new **exported** function:
```javascript
export async function resolveAttack(actor, weapon, choice, opts = {}) {
  const { consumeAmmo = true } = opts;
  // ... the moved resolution body ...
}
```
and `rollAttack` ends with:
```javascript
  if (!choice) return null;
  return resolveAttack(actor, weapon, choice, { consumeAmmo: true });
}
```
(Recompute `isMelee`/`isRanged`/`charKey`/`storm` from `weapon` inside `resolveAttack`; everything else already comes from `choice`/`weapon`.)

- [ ] **Step 2: Target via opts (so a reroll re-targets the original).** In `resolveAttack`, replace the target resolution:
```javascript
  const liveTarget = opts.targetUuid ? null : (game.user.targets.first() ?? null);
  const targetUuid = opts.targetUuid ?? liveTarget?.actor?.uuid ?? null;
  const targetName = opts.targetName ?? liveTarget?.name ?? null;
```
and use `targetUuid`/`targetName` where the flags currently read `targetToken?.actor?.uuid` / `targetToken?.name`.

- [ ] **Step 3: Store the reroll payload + guard ammo.** Add to the message `flags[NS]` object a `reroll` key, and make ammo deduction conditional:
```javascript
      reroll: { kind: "attack", actorUuid: actor.uuid, weaponId: weapon.id, choice, targetUuid, targetName }
```
```javascript
  if (consumeAmmo && usesAmmo) await weapon.update({ "system.clip.value": weapon.system.clip.value - rounds });
```

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: split rollAttack→resolveAttack; attack reroll payload (no ammo re-spend, re-targets original)"
```

---

### Task 3: Focus/cast reroll (split rollManifest)

**Files:** `scripts/rolls/manifest.mjs`

- [ ] **Step 1: Extract `resolveManifest`.** Refactor `rollManifest(actor, powerId)` so the **dialog** (building `prOpts`, prompting, and computing `effPR`/`circ`) stays in `rollManifest`, and **everything from the focus roll onward** (`resolveFocusTarget`, focusMod, the d100, phenomena/perils, the attack-type branch, cardData, message create) moves into a new **exported** function:
```javascript
export async function resolveManifest(actor, power, opts) {
  const { effPR, circ = 0 } = opts;
  const s = power.system;
  const normalPR = actor.system.psyRating ?? 0;
  const psykerClass = actor.system.psykerClass;
  const state = manifestState(effPR, normalPR);
  const pushPts = Math.max(0, effPR - normalPR);
  // ... the moved resolution body (focus roll → phenomena → card) ...
}
```
and `rollManifest` ends with:
```javascript
  const effPR = Number(choice.effPR);
  const circ = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  return resolveManifest(actor, power, { effPR, circ });
}
```

- [ ] **Step 2: Target via opts** (same pattern as resolveAttack — `opts.targetUuid`/`opts.targetName` override `game.user.targets.first()` for the attack-synthesis branch's `targetUuid`/`targetName`).

- [ ] **Step 3: Store the reroll payload.** In BOTH the attack-power flags and the effect-power `{ type: "cast", ... }` flags, add:
```javascript
      reroll: { kind: "cast", actorUuid: actor.uuid, powerId: power.id, effPR, circ, targetUuid, targetName }
```
(So both Effect and attack casts are rerollable.)

- [ ] **Step 4: Verify and commit.** `node --check scripts/rolls/manifest.mjs && npm test`.
```bash
git add scripts/rolls/manifest.mjs
git commit -m "feat: split rollManifest→resolveManifest; focus-power reroll payload (re-runs phenomena/perils)"
```

---

### Task 4: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (a character with Fate on the dh2e/bdh-test world):
- [ ] **Skill/characteristic test** → right-click the card → **"Spend Fate: Reroll"** appears; clicking it posts "[Name] spends a Fate point…", drops the actor's Fate by 1, and posts a fresh test result (same target/modifier, new d100).
- [ ] **No Fate** → the option does **not** appear. **Someone else's test** (a card from an actor you don't own) → the option does **not** appear. A GM sees it on any actor they own (i.e. all).
- [ ] **Attack** → reroll re-rolls the to-hit and re-derives hit location(s)/jam; the **clip is not** decremented again; the new card's Roll Damage/Evade work.
- [ ] **Focus power** (the test psyker) → reroll re-runs the focus test (new phenomena/perils per the new roll's doubles; attack powers re-derive hits) at the same effective PR.
- [ ] The reroll result cards play the dice sound; the original cards remain.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** test reroll + mechanism + menu (T1); attack reroll via resolveAttack (T2); focus reroll via resolveManifest (T3). ✓

**Deferred (declared):** other Fate uses; keep-better; sub-roll rerolls.

**Placeholder scan:** complete; checklist concrete (no-Fate/foreign-actor hide the option; attack reroll doesn't re-spend ammo).

**Type/name consistency:** the reroll payload `{kind, actorUuid, ...}` is written by `performTest` (kind "test": base/modifier/label), `resolveAttack` (kind "attack": weaponId/choice/targetUuid/targetName), `resolveManifest` (kind "cast": powerId/effPR/circ/targetUuid/targetName); `rerollFromFate` dispatches on `kind` to `performTest`/`resolveAttack({consumeAmmo:false})`/`resolveManifest`. `canReroll` gates on `fromUuidSync(actorUuid).isOwner && fate.value >= 1` — the same guard `rerollFromFate` re-checks. The context hook (`getChatMessageContextOptions`) reads the message id off the `li` and calls `canReroll`/`rerollFromFate`. `fate.mjs` imports from roll-test/attack/manifest (none import fate.mjs → no cycle). NS = "better-dh2e" everywhere.
