# Better DH2e — Plan 37: System Settings — Lock Custom Mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a system-settings surface (Foundry's Configure Settings) with the first toggle: **"Lock Custom mode to the GM."** When on, only the GM can use Custom (free-edit) advancement mode; players are limited to Simple (proper XP costs). Players build their characters in Custom first, then the GM locks it to avoid XP-counting errors. The GM keeps Custom everywhere (for NPCs and editing players' sheets).

**Architecture:** Register a world-scoped Boolean game setting in the `init` hook. A `canUseCustom = isGM || !locked` context flag gates the Custom mode button and the `setMode` handler; a locked-out player's transient `_advancementMode` is reset to Play on re-render. Changing the setting re-renders open sheets so it takes effect live.

**Tech Stack:** Foundry v13/v14 (`game.settings.register`), ApplicationV2 sheet, Handlebars.

**Scope:** the settings registration + this one toggle. **Out of scope:** other settings (added later as the menu grows).

**Reference (confirmed):** one setting now — disable Custom mode for everyone except the GM. GM still uses Custom (NPCs + editing player sheets); players limited to Simple when locked. Setting lives in Foundry's settings menu (world scope, GM-set).

Model facts: the system id / settings namespace is `"better-dh2e"`. The advancement mode is the transient per-sheet `_advancementMode` ("none"/"custom"/"simple"); the Custom button is `templates/actor/actor-sheet.hbs:417` (`data-action="setMode" data-mode="custom"`); `#onSetMode` toggles the mode; `_prepareContext` sets `isCustom`/`isSimple`/`isPlay`.

---

## File Structure

```
scripts/better-dh2e.mjs           MODIFY  register the "lockCustomMode" setting in init
scripts/sheets/actor-sheet.mjs    MODIFY  canUseCustom context + reset locked mode + #onSetMode guard
templates/actor/actor-sheet.hbs   MODIFY  hide the Custom button when !canUseCustom
```

---

### Task 1: Setting + enforcement

**Files:** `scripts/better-dh2e.mjs`, `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Register the setting.** In `scripts/better-dh2e.mjs`, inside the existing `Hooks.once("init", () => { ... })`, add:
```javascript
  game.settings.register("better-dh2e", "lockCustomMode", {
    name: "Lock Custom mode to the GM",
    hint: "When enabled, only the GM can use Custom (free-edit) advancement. Players are limited to Simple mode (proper XP costs). Have players build characters in Custom first, then enable this to avoid XP-counting errors. The GM keeps Custom everywhere.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { foundry.applications.instances.forEach((app) => { if (app.rendered) app.render(false); }); }
  });
```
(`foundry.applications.instances` is the Map of open ApplicationV2 windows; re-rendering them all applies the lock live. Harmless for non-sheet apps.)

- [ ] **Step 2: Context flag + mode reset.** In `actor-sheet.mjs` `_prepareContext`, just before `context.advancementMode = this._advancementMode;`, add:
```javascript
    context.canUseCustom = game.user.isGM || !game.settings.get("better-dh2e", "lockCustomMode");
    if (!context.canUseCustom && this._advancementMode === "custom") this._advancementMode = "none";
```
(So `isCustom` — computed right after from `_advancementMode` — becomes false for a locked-out player, and a player sitting in Custom when the GM enables the lock is bumped back to Play on the next render.)

- [ ] **Step 3: Guard the handler.** In `#onSetMode`, after `const m = target.dataset.mode;`, add (before the existing NPC guard is fine):
```javascript
    if (m === "custom" && !game.user.isGM && game.settings.get("better-dh2e", "lockCustomMode")) {
      ui.notifications.warn("Custom mode is locked to the GM.");
      return;
    }
```

- [ ] **Step 4: Hide the Custom button.** In `templates/actor/actor-sheet.hbs` (~line 417), wrap the Custom mode button in `canUseCustom`:
```handlebars
        {{#if canUseCustom}}<button type="button" class="bdh-mode {{#if isCustom}}on{{/if}}" data-action="setMode" data-mode="custom">Custom</button>{{/if}}
```
(Leave the Simple button + the hint span unchanged. The mode-chooser row stays — a locked player still sees Simple + Play.)

- [ ] **Step 5: Verify and commit.** `node --check scripts/better-dh2e.mjs scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/better-dh2e.mjs scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs
git commit -m "feat: system setting 'Lock Custom mode to the GM' — players limited to Simple when set"
```

---

### Task 2: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (needs a GM login + a player login owning a character):
- [ ] **Settings menu:** Foundry → **Configure Settings → System (Better DH2e)** shows **"Lock Custom mode to the GM"** (a world toggle, GM-only to change), default **off**.
- [ ] **Off (default):** a player can use **Custom** on their character as before.
- [ ] **GM enables it:** the player's open sheet re-renders → the **Custom** button is **gone** on the Advancement tab; only **Simple** (+ Play) remain; a player sitting in Custom is bumped back to Play. (If a player somehow triggers `setMode custom`, it warns and refuses.)
- [ ] **GM unaffected:** the GM still sees + uses **Custom** on NPCs **and** on the player's character (for edits).
- [ ] Toggling the setting off again restores the player's Custom button (live, on re-render).
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** setting registration (Task 1 Step 1); enforcement via context + handler + template (Steps 2-4). ✓

**Deferred (declared):** future settings.

**Placeholder scan:** complete; checklist concrete (GM keeps Custom on player sheets; player loses the button + is reset).

**Type/name consistency:** the setting key `"better-dh2e"/"lockCustomMode"` is read in `_prepareContext` (`canUseCustom`) and `#onSetMode` (guard) identically; `onChange` re-renders open apps. `canUseCustom = game.user.isGM || !locked` — true for the GM always (so Custom works on NPCs + player sheets they open) and for players only when unlocked. The locked-out reset (`_advancementMode = "none"`) runs before `isCustom` is computed. The template hides the Custom button on `{{#if canUseCustom}}`; Simple/Play unaffected. No pure logic (settings/UI only) — the 119 tests are unchanged.
