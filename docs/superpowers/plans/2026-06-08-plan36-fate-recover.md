# Better DH2e — Plan 36: Fate — Recover Wounds / Clear Fatigue

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In **Play mode**, clicking the Fate value (separate from the +/− buttons) opens a small "Spend a Fate Point" menu with two actions: **Recover 1d5 Wounds** (not allowed with a critical injury) and **Remove All Fatigue**. Each spends 1 Fate and posts a chat card.

**Architecture:** A `spendFate` sheet action opens a `DialogV2` with two buttons; the chosen one deducts 1 Fate and applies its effect (`wounds.value -= 1d5` clamped at 0 / `fatigue.value = 0`) in a single actor update, then posts a card. Gated to Play mode via a new `context.isPlay`.

**Tech Stack:** Foundry v13/v14 (DialogV2, Roll, ChatMessage), ApplicationV2 action, Handlebars.

**Scope:** these two spends. **Out of scope:** the un-automated Fate uses (+10 to a test, recover from Stun, count-as-10 initiative — all manual/gated on battlemap); the existing +/− adjust buttons and the reroll/+DoS context-menu spends.

**Reference (confirmed):** trigger by clicking the Fate value in **Play mode**; **Recover 1d5 Wounds** removes 1d5 from current wound damage (`wounds.value`), **not usable when `wounds.critical ≥ 1`**; **Remove All Fatigue** sets `fatigue.value = 0`; each costs 1 Fate and prints a card.

Model facts: `system.wounds.value` = damage taken (0 = unhurt), `system.wounds.critical` = critical-damage count, `system.fatigue.value` = current fatigue. The Fate header lives at `templates/actor/actor-sheet.hbs` (`<div class="fate">`) with the existing `adjustFate` +/− buttons.

---

## File Structure

```
scripts/sheets/actor-sheet.mjs    MODIFY  context.isPlay; #onSpendFate action + register
templates/actor/actor-sheet.hbs   MODIFY  make the Fate value clickable in Play mode
styles/better-dh2e.css            MODIFY  clickable-fate affordance
```

---

### Task 1: Spend-Fate menu (recover wounds / clear fatigue)

**Files:** `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`, `styles/better-dh2e.css`

- [ ] **Step 1: `context.isPlay`.** In `_prepareContext`, where `isCustom`/`isSimple` are set, add:
```javascript
    context.isPlay = !context.isCustom && !context.isSimple;
```

- [ ] **Step 2: Action handler.** In `actor-sheet.mjs`, add (near `#onAdjustFate`):
```javascript
  /** Action: spend a Fate point (Play mode) — recover 1d5 wounds or clear all fatigue. */
  static async #onSpendFate(event, target) {
    const sys = this.actor.system;
    if ((sys.fate?.value ?? 0) < 1) { ui.notifications.warn("No Fate points to spend."); return; }
    const hasCrit = (sys.wounds?.critical ?? 0) >= 1;
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: "Spend a Fate Point" },
      content: `<p>You have <b>${sys.fate.value}</b> Fate.</p>`
        + (hasCrit ? `<p class="bdh-warn">Can't recover wounds while you have a critical injury.</p>` : ``),
      buttons: [
        { action: "wounds", label: "Recover 1d5 Wounds" },
        { action: "fatigue", label: "Remove All Fatigue" }
      ],
      rejectClose: false
    }).catch(() => null);
    if (!choice) return;

    const fate = this.actor.system.fate?.value ?? 0;
    if (fate < 1) { ui.notifications.warn("No Fate points to spend."); return; }
    const speaker = ChatMessage.getSpeaker({ actor: this.actor });

    if (choice === "wounds") {
      if ((this.actor.system.wounds?.critical ?? 0) >= 1) {
        ui.notifications.warn("Can't recover wounds while you have a critical injury.");
        return;
      }
      const roll = await new Roll("1d5").evaluate();
      const cur = this.actor.system.wounds?.value ?? 0;
      const healed = Math.min(cur, roll.total);
      await this.actor.update({ "system.fate.value": fate - 1, "system.wounds.value": cur - healed });
      const messageData = { speaker, content: `<div class="bdh-card"><header class="bdh-card-head">${this.actor.name} spends a Fate point — recovers ${healed} wound${healed === 1 ? "" : "s"} (1d5: ${roll.total}).</header></div>`, rolls: [roll] };
      ChatMessage.applyRollMode(messageData, "roll");
      await ChatMessage.create(messageData);
    } else if (choice === "fatigue") {
      await this.actor.update({ "system.fate.value": fate - 1, "system.fatigue.value": 0 });
      await ChatMessage.create({ speaker, content: `<div class="bdh-card"><header class="bdh-card-head">${this.actor.name} spends a Fate point — removes all fatigue.</header></div>` });
    }
  }
```
Register in `DEFAULT_OPTIONS.actions`: `spendFate: DarkHeresyActorSheet.#onSpendFate` (use the real class name; append + comma the previous).

- [ ] **Step 3: Template.** In `templates/actor/actor-sheet.hbs`, in the `<div class="fate">` block, make the **value** clickable in Play mode (leave the `/ max` + the +/− buttons unchanged). Replace the value portion of the `<div class="v">…`:
```handlebars
      <div class="v">{{#if isPlay}}<a class="bdh-fate-spend" data-action="spendFate" title="Spend a Fate point">{{system.fate.value}}</a>{{else}}{{system.fate.value}}{{/if}} / {{#if isCustom}}<input class="bdh-edit bdh-fate-max" type="number" name="system.fate.max" value="{{system.fate.max}}" min="0"/>{{else}}{{system.fate.max}}{{/if}}</div>
```
(Match the existing markup for the `/ max` part exactly — only the value before the `/` becomes a conditional clickable.)

- [ ] **Step 4: Style.** Append to `styles/better-dh2e.css`:
```css
.better-dh2e .bdh-fate-spend { cursor:pointer; text-decoration:underline dotted; }
```

- [ ] **Step 5: Verify and commit.** `node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs styles/better-dh2e.css
git commit -m "feat: Fate spends — click Fate (Play mode) to recover 1d5 wounds (not with a critical) or clear all fatigue"
```

---

### Task 2: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (a character with Fate + some wound damage + some fatigue, in **Play** mode):
- [ ] The Fate **value** is clickable (dotted underline) in Play mode; clicking opens **"Spend a Fate Point"** with two buttons. (In Custom/Simple the value is plain text; the +/− buttons work as before in all modes.)
- [ ] **Recover 1d5 Wounds** → deducts 1 Fate, reduces wound damage by the 1d5 (clamped so it can't go below 0), posts a card with the roll. With **0 Fate** → warns, no spend.
- [ ] With a **critical** (`wounds.critical ≥ 1`) → the dialog shows the warning and the wounds button refuses (no spend); Remove All Fatigue still works.
- [ ] **Remove All Fatigue** → deducts 1 Fate, sets fatigue to 0, posts a card.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** isPlay + clickable value + the two-option spend handler (Task 1). ✓

**Deferred (declared):** the manual/gated Fate uses.

**Placeholder scan:** complete; checklist concrete (1d5 clamp at 0; critical blocks wounds; fatigue→0).

**Type/name consistency:** `#onSpendFate` reads `system.fate.value` / `wounds.value` / `wounds.critical` / `fatigue.value` (the real model fields), re-checks Fate + critical after the dialog, and writes fate−1 plus the effect in one `actor.update`. `context.isPlay = !isCustom && !isSimple` gates the clickable value (the +/− `adjustFate` buttons are untouched). Cards use `ChatMessage.getSpeaker` + roll-mode (wounds card attaches the 1d5).
