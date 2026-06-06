# Better DH2e — Plan 16: Attack Pipeline (core)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The core attack chain — to-hit dialog (Aim/Type/Range) → **attack card** (per-hit reversed-digit locations, jam status, ⚅ Roll-damage / 🛡 Evade) → **damage card** (per-hit damage, modifier on first hit, Righteous Fury flagged) → **Apply Damage** (GM-only soak vs the bound target) → **Evade** (Parry/Dodge test card). Qualities are stored + flagged but **not yet automated** (Plan 17).

**Architecture:** Pure, unit-tested stage math (`attack-math.mjs`); a Foundry orchestration module (`rolls/attack.mjs`) that runs the dialog, rolls, stores the attack context in **ChatMessage flags**, and posts cards; chat-card buttons are bound via the v13 **`renderChatMessageHTML`** hook and read the message flags to continue the chain. Target is captured **at to-hit** from `game.user.targets` and bound to the card.

**Tech Stack:** Foundry v13 (DialogV2, Roll, ChatMessage + flags, `renderChatMessageHTML` hook, `fromUuid`), Vitest, Handlebars.

**Scope:** to-hit, base jam, hits/locations, damage, soak, GM apply, evade. **Out of scope:** the 7 quality modules + Shocking condition (Plan 17); crit-effect tables (P1).

**Reference:** spec §3 (combat chain, pipeline) + §11/§11a (resolved design). Reuses `evaluateTest` (test-logic.mjs), `computeArmour` (combat-data.mjs), and the `promptTest`/`performTest`/`ChatMessage` patterns in `roll-test.mjs`. Replaces Plan 8's basic `rollWeaponAttack`. Numbers confirmed in §11a; hit-location sequence + jam bands flagged "verify §10".

---

## File Structure

```
scripts/helpers/attack-math.mjs     NEW  pure: hitLocation, computeHits, locationSequence, soak, applyWounds, checkJam, isRighteousFury
test/attack-math.test.mjs           NEW  Vitest
scripts/config.mjs                  MODIFY  attackTypes, aimOptions, rangeOptions, hitLocationLabels
scripts/rolls/attack.mjs            NEW  rollAttack + damage/evade/apply orchestration (dialogs, flags, cards)
scripts/better-dh2e.mjs             MODIFY  register renderChatMessageHTML hook → bind attack-card buttons
scripts/sheets/actor-sheet.mjs      MODIFY  #onRollAttack → new rollAttack
templates/chat/attack-card.hbs      NEW
templates/chat/damage-card.hbs      NEW
styles/better-dh2e.css              MODIFY  attack/damage card styles
```

---

### Task 1: Pure attack math (TDD)

**Files:** Create `test/attack-math.test.mjs`, `scripts/helpers/attack-math.mjs`

- [ ] **Step 1: Failing test** `test/attack-math.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import { hitLocation, computeHits, locationSequence, soak, applyWounds, checkJam, isRighteousFury } from "../scripts/helpers/attack-math.mjs";

describe("hitLocation (reversed digits)", () => {
  it("reverses the d100 digits onto the bands", () => {
    expect(hitLocation(7)).toBe("rightLeg");   // 07 -> 70
    expect(hitLocation(10)).toBe("head");      // 10 -> 01
    expect(hitLocation(47)).toBe("rightLeg");  // 47 -> 74
    expect(hitLocation(55)).toBe("body");      // 55 -> 55
    expect(hitLocation(100)).toBe("leftLeg");  // 00 -> 100
  });
});
describe("computeHits", () => {
  const semi = { hits: { mode: "multi", dosPer: 2 } };
  const full = { hits: { mode: "multi", dosPer: 1 } };
  it("single is always 1", () => { expect(computeHits({ hits: { mode: "single" } }, 5, 99)).toBe(1); });
  it("semi: +1 per 2 DoS, capped", () => {
    expect(computeHits(semi, 4, 99)).toBe(3);   // 1 + floor(4/2)
    expect(computeHits(semi, 4, 2)).toBe(2);    // capped at rof
  });
  it("full: +1 per DoS, capped", () => {
    expect(computeHits(full, 3, 99)).toBe(4);   // 1 + 3
  });
});
describe("locationSequence", () => {
  it("first is the rolled location, rest cycle", () => {
    expect(locationSequence("body", 1)).toEqual(["body"]);
    expect(locationSequence("body", 3)).toEqual(["body", "rightLeg", "leftLeg"]);
  });
});
describe("soak", () => {
  it("damage minus (armour-pen) floored minus TB", () => {
    expect(soak(12, 6, 2, 3)).toBe(5);  // 12 - max(0,6-2) - 3 = 5
    expect(soak(3, 6, 0, 3)).toBe(0);   // fully soaked -> 0
  });
});
describe("applyWounds", () => {
  it("accumulates to max, overflow is critical", () => {
    expect(applyWounds(5, 10, 3)).toEqual({ wounds: 8, critical: 0 });
    expect(applyWounds(8, 10, 5)).toEqual({ wounds: 10, critical: 3 });
    expect(applyWounds(10, 10, 4)).toEqual({ wounds: 10, critical: 4 });
  });
});
describe("checkJam", () => {
  it("ranged failed roll at/above the floor jams", () => {
    expect(checkJam(96, false, true)).toBe(true);
    expect(checkJam(96, true, true)).toBe(false);   // success never jams
    expect(checkJam(96, false, false)).toBe(false); // melee never jams
    expect(checkJam(100, false, true, 100)).toBe(true); // Reliable floor
    expect(checkJam(94, false, true, 100)).toBe(false);
  });
});
describe("isRighteousFury", () => {
  it("natural 10 (or >= threshold)", () => {
    expect(isRighteousFury(10)).toBe(true);
    expect(isRighteousFury(9)).toBe(false);
    expect(isRighteousFury(9, 9)).toBe(true); // Vengeful(9)
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/attack-math.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/attack-math.mjs`:
```javascript
// scripts/helpers/attack-math.mjs — PURE (no Foundry). Combat resolution math.

const HIT_BANDS = [
  { max: 10, key: "head" }, { max: 20, key: "rightArm" }, { max: 30, key: "leftArm" },
  { max: 70, key: "body" }, { max: 85, key: "rightLeg" }, { max: 100, key: "leftLeg" }
];
const SEQ = ["head", "rightArm", "leftArm", "body", "rightLeg", "leftLeg"];

/** Hit location from a d100 roll by reversing its two digits onto the bands. */
export function hitLocation(roll) {
  const r = roll % 100;                 // 100 -> 0
  let reversed = (r % 10) * 10 + Math.floor(r / 10);
  if (reversed === 0) reversed = 100;
  return HIT_BANDS.find((b) => reversed <= b.max).key;
}

/** Total hits: single = 1; multi = 1 + floor(DoS / dosPer), capped at rof. */
export function computeHits(attackType, dos, rof) {
  if (attackType.hits?.mode !== "multi" || dos < 1) return 1;
  return Math.min(rof, 1 + Math.floor(dos / attackType.hits.dosPer));
}

/** Locations for `count` hits: first as rolled, the rest cycling a fixed order (verify §10). */
export function locationSequence(first, count) {
  const start = SEQ.indexOf(first);
  return Array.from({ length: count }, (_, i) => (i === 0 ? first : SEQ[(start + i) % SEQ.length]));
}

/** Effective damage after armour+pen and Toughness Bonus (floored at 0). */
export function soak(damage, armour, penetration, toughnessBonus) {
  return Math.max(0, damage - Math.max(0, armour - penetration) - toughnessBonus);
}

/** Apply effective damage to a Wounds threshold; overflow past max is Critical. */
export function applyWounds(current, max, effective) {
  const total = current + effective;
  return { wounds: Math.min(max, total), critical: Math.max(0, total - max) };
}

/** Ranged jam: a failed attack rolling at/above the jam floor (base 94; Reliable 100; Unreliable 91). */
export function checkJam(roll, isSuccess, isRanged, jamFloor = 94) {
  return isRanged && !isSuccess && roll >= jamFloor;
}

/** Righteous Fury: a damage die at/above the threshold (natural 10, or Vengeful X). */
export function isRighteousFury(dieValue, threshold = 10) {
  return dieValue >= threshold;
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/attack-math.test.mjs`.

- [ ] **Step 5: Commit**
```bash
git add test/attack-math.test.mjs scripts/helpers/attack-math.mjs
git commit -m "feat: pure attack-resolution math (location, hits, soak, wounds, jam, RF) with tests"
```

---

### Task 2: Config — attack types, aim, range, location labels

**Files:** `scripts/config.mjs`

- [ ] **Step 1:** Append:
```javascript
/** Aim bonuses. */
BDH.aimOptions = { none: { label: "None", mod: 0 }, half: { label: "Half Aim +10", mod: 10 }, full: { label: "Full Aim +20", mod: 20 } };

/** Range bands (ranged only). */
BDH.rangeOptions = {
  pointBlank: { label: "Point-Blank +30", mod: 30 }, short: { label: "Short +10", mod: 10 },
  normal: { label: "Normal", mod: 0 }, long: { label: "Long −10", mod: -10 }, extreme: { label: "Extreme −30", mod: -30 }
};

/** Attack types. `scope`: any|melee|ranged. `hits`: single, or multi with `dosPer`. `rof`: which weapon RoF caps multi-hits (null = uncapped, melee). */
BDH.attackTypes = {
  standard:   { label: "Standard",        mod: 10,  scope: "any",    hits: { mode: "single" } },
  calledShot: { label: "Called Shot",     mod: -20, scope: "any",    hits: { mode: "single" }, calledShot: true },
  allOut:     { label: "All-Out Attack",  mod: 30,  scope: "melee",  hits: { mode: "single" } },
  charge:     { label: "Charge",          mod: 10,  scope: "melee",  hits: { mode: "single" } },
  semiAuto:   { label: "Semi-Auto Burst", mod: 0,   scope: "ranged", hits: { mode: "multi", dosPer: 2 }, rof: "short" },
  fullAuto:   { label: "Full-Auto Burst", mod: -10, scope: "ranged", hits: { mode: "multi", dosPer: 1 }, rof: "long" },
  swift:      { label: "Swift Attack",    mod: 0,   scope: "melee",  hits: { mode: "multi", dosPer: 2 }, rof: null },
  lightning:  { label: "Lightning Attack",mod: -10, scope: "melee",  hits: { mode: "multi", dosPer: 1 }, rof: null }
};

/** Hit-location display labels. */
BDH.hitLocationLabels = { head: "Head", rightArm: "Right Arm", leftArm: "Left Arm", body: "Body", rightLeg: "Right Leg", leftLeg: "Left Leg" };
```

- [ ] **Step 2: Verify and commit.** Run: `node --check scripts/config.mjs && npm test`.
```bash
git add scripts/config.mjs
git commit -m "feat: attack-type / aim / range config + hit-location labels"
```

---

### Task 3: To-hit flow — dialog, resolution, attack card

**Files:** Create `scripts/rolls/attack.mjs`, `templates/chat/attack-card.hbs`; modify `scripts/sheets/actor-sheet.mjs`.

- [ ] **Step 1:** Create `scripts/rolls/attack.mjs` with `rollAttack`. It opens a DialogV2 (Modifier · Aim · Attack Type [filtered by weapon scope: melee weapons → melee/any, others → ranged/any] · Range [ranged only] · Called-Shot location when Called Shot is chosen), rolls 1d100, resolves via `evaluateTest`, computes hits/locations + jam, then posts the attack card with the context stored in flags.

```javascript
// scripts/rolls/attack.mjs
import { evaluateTest } from "./test-logic.mjs";
import { hitLocation, computeHits, locationSequence, checkJam } from "../helpers/attack-math.mjs";

const NS = "better-dh2e";
const { DialogV2 } = foundry.applications.api;
const { renderTemplate } = foundry.applications.handlebars;

/** Open the attack dialog, resolve to-hit, post the attack card. */
export async function rollAttack(actor, weaponId) {
  const weapon = actor.items.get(weaponId);
  if (!weapon) return null;
  const isMelee = weapon.system.weaponClass === "melee";
  const isRanged = !isMelee;
  const charKey = isMelee ? "weaponSkill" : "ballisticSkill";

  // Build dialog selects from config.
  const typeOpts = Object.entries(CONFIG.BDH.attackTypes)
    .filter(([, t]) => t.scope === "any" || t.scope === (isMelee ? "melee" : "ranged"))
    .map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("");
  const aimOpts = Object.entries(CONFIG.BDH.aimOptions).map(([k, a]) => `<option value="${k}">${a.label}</option>`).join("");
  const rangeOpts = Object.entries(CONFIG.BDH.rangeOptions).map(([k, r]) => `<option value="${k}"${k === "normal" ? " selected" : ""}>${r.label}</option>`).join("");
  const locOpts = Object.entries(CONFIG.BDH.hitLocationLabels).map(([k, l]) => `<option value="${k}">${l}</option>`).join("");

  const content = `
    <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>
    <div class="form-group"><label>Aim</label><select name="aim">${aimOpts}</select></div>
    <div class="form-group"><label>Attack Type</label><select name="attackType">${typeOpts}</select></div>
    ${isRanged ? `<div class="form-group"><label>Range</label><select name="range">${rangeOpts}</select></div>` : ""}
    <div class="form-group"><label>Called-Shot Location</label><select name="calledShotLocation">${locOpts}</select></div>`;

  const choice = await DialogV2.prompt({
    window: { title: `${weapon.name} — Attack` },
    content,
    ok: { label: "Attack", callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object },
    rejectClose: false
  });
  if (!choice) return null;

  // Combine modifiers (clamp the combined modifier ±60), roll, evaluate.
  const at = CONFIG.BDH.attackTypes[choice.attackType];
  const aim = CONFIG.BDH.aimOptions[choice.aim]?.mod ?? 0;
  const rng = isRanged ? (CONFIG.BDH.rangeOptions[choice.range]?.mod ?? 0) : 0;
  const manual = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  const base = actor.system.characteristics[charKey].total;
  const modifier = Math.max(-60, Math.min(60, manual + aim + rng + at.mod));
  const roll = await new Roll("1d100").evaluate();
  const result = evaluateTest(base, modifier, roll.total); // { target, success, degrees } — reuse existing logic

  // Hits + locations (only when the attack hits).
  const dos = result.success ? result.degrees : 0;
  const rofCap = at.rof ? (weapon.system.rateOfFire?.[at.rof] ?? 1) : Infinity;
  const nHits = result.success ? computeHits(at, dos, rofCap) : 0;
  const firstLoc = at.calledShot ? choice.calledShotLocation : hitLocation(roll.total);
  const locs = result.success ? locationSequence(firstLoc, nHits) : [];
  const jammed = checkJam(roll.total, result.success, isRanged);

  // Bound target (captured at to-hit).
  const target = game.user.targets.first() ?? null;

  const flags = {
    weaponId, isRanged,
    penetration: weapon.system.penetration ?? 0,
    damageType: weapon.system.damageType,
    qualities: weapon.system.qualities ?? [],
    targetUuid: target?.actor?.uuid ?? null,
    targetName: target?.name ?? null,
    hits: locs.map((loc, i) => ({ index: i, location: loc, label: CONFIG.BDH.hitLocationLabels[loc] })),
    success: result.success, jammed
  };

  const cardData = {
    weaponName: weapon.name, charShort: CONFIG.BDH.characteristics[charKey].short,
    target: result.target, modifier, roll: roll.total, success: result.success,
    degrees: result.degrees, attackTypeLabel: at.label,
    hits: flags.hits, jammed, targetName: flags.targetName, hasHits: nHits > 0
  };
  const html = await renderTemplate(`systems/better-dh2e/templates/chat/attack-card.hbs`, cardData);
  const msg = await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls: [roll], content: html,
    flags: { [NS]: { type: "attack", actorUuid: actor.uuid, ...flags } }
  });
  ChatMessage.applyRollMode?.(msg, game.settings.get("core", "rollMode"));
  return msg;
}
```
(NOTE: confirm `evaluateTest`'s exact return shape from `scripts/rolls/test-logic.mjs` and adapt the field names (`target`/`success`/`degrees`). Reuse whatever it already returns — do not duplicate the DoS math.)

- [ ] **Step 2:** Create `templates/chat/attack-card.hbs`:
```handlebars
<div class="bdh-card bdh-attack-card">
  <div class="bdh-card-head">{{weaponName}} — Attack ({{charShort}})</div>
  <div class="bdh-card-line">Target {{target}} · Rolled <b>{{roll}}</b> — {{#if success}}<span class="ok">Success</span> ({{degrees}} DoS){{else}}<span class="fail">Failure</span>{{/if}}</div>
  <div class="bdh-card-line">{{attackTypeLabel}}{{#if targetName}} · vs {{targetName}}{{/if}}</div>
  {{#if jammed}}<div class="bdh-card-line fail">⚠ Weapon jammed!</div>{{/if}}
  {{#if hasHits}}
    <ol class="bdh-hits">{{#each hits}}<li>Hit {{add index 1}} — {{label}}</li>{{/each}}</ol>
    <div class="bdh-card-actions"><button type="button" data-bdh="rollDamage">⚅ Roll damage</button><button type="button" data-bdh="evade">🛡 Evade</button></div>
  {{/if}}
</div>
```
(If no `add` helper exists, render the index plainly or register a tiny helper; keep it simple — `Hit — {{label}}` is acceptable.)

- [ ] **Step 3:** In `scripts/sheets/actor-sheet.mjs`, change `#onRollAttack` to call the new flow (replace the `rollWeaponAttack` import/use):
```javascript
import { rollAttack } from "../rolls/attack.mjs";
// ...
  static async #onRollAttack(event, target) {
    const id = target.closest("[data-item-id]")?.dataset.itemId;
    if (id) await rollAttack(this.actor, id);
  }
```
(Remove the now-unused `rollWeaponAttack` import if nothing else uses it; leave `rollWeaponAttack` in roll-test.mjs harmlessly or delete it.)

- [ ] **Step 4: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && node --check scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/attack-card.hbs scripts/sheets/actor-sheet.mjs
git commit -m "feat: attack to-hit dialog + resolution + attack card (hits, locations, jam, target binding)"
```

---

### Task 4: Chat-card button wiring (renderChatMessageHTML)

**Files:** `scripts/better-dh2e.mjs`, `scripts/rolls/attack.mjs`

- [ ] **Step 1:** In `scripts/rolls/attack.mjs`, export a binder that wires the card buttons by reading the message flags:
```javascript
/** Bind attack/damage card buttons (called from the renderChatMessageHTML hook). */
export function bindCardButtons(message, html) {
  const flags = message.flags?.[NS];
  if (!flags) return;
  html.querySelectorAll("[data-bdh]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (btn.dataset.bdh === "rollDamage") await rollDamage(message);
      else if (btn.dataset.bdh === "evade") await rollEvade(message);
      else if (btn.dataset.bdh === "applyDamage") await applyDamage(message);
    });
  });
}
```
(`rollDamage`/`rollEvade`/`applyDamage` are implemented in Tasks 5–7. Stub them as `async function rollDamage(){}` etc. now so this task syntax-checks, OR sequence Task 4 after 5–7. Recommended: add empty stubs here, fill in later tasks.)

- [ ] **Step 2:** In `scripts/better-dh2e.mjs`, register the hook (import `bindCardButtons`):
```javascript
import { bindCardButtons } from "./rolls/attack.mjs";
Hooks.on("renderChatMessageHTML", (message, html) => bindCardButtons(message, html));
```
(`html` is the rendered HTMLElement in v13. Place the hook registration alongside the other init/setup hooks.)

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/better-dh2e.mjs && node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/better-dh2e.mjs scripts/rolls/attack.mjs
git commit -m "feat: bind attack/damage card buttons via renderChatMessageHTML hook"
```

---

### Task 5: Damage flow — popup, per-hit roll, damage card

**Files:** `scripts/rolls/attack.mjs`, `templates/chat/damage-card.hbs`

- [ ] **Step 1:** Implement `rollDamage(message)` in `attack.mjs`. One modifier popup; roll the weapon's base damage per hit; the modifier applies to the **first hit only**; flag Righteous Fury per hit (a d10 damage die showing 10); post the damage card carrying a damage-context flag for Apply.
```javascript
async function rollDamage(message) {
  const f = message.flags[NS];
  const actor = await fromUuid(f.actorUuid);
  const weapon = actor?.items.get(f.weaponId);
  if (!weapon) return;
  const baseFormula = weapon.system.damage;            // e.g. "1d10+3"
  const mod = await DialogV2.prompt({
    window: { title: `${weapon.name} — Damage` },
    content: `<div class="form-group"><label>Damage Modifier (flat or dice)</label><input type="text" name="mod" value="+0"/></div>`,
    ok: { label: "Roll", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object.mod },
    rejectClose: false
  });
  if (mod == null) return;

  const rolls = [];
  const hits = [];
  for (const hit of f.hits) {
    const formula = hit.index === 0 && String(mod).trim() && String(mod).trim() !== "+0"
      ? `${baseFormula} + ${mod}` : baseFormula;
    const r = await new Roll(formula).evaluate();
    // Righteous Fury: any d10 term die showing 10.
    const rf = r.dice.some((d) => d.faces === 10 && d.results.some((res) => res.active && res.result === 10));
    rolls.push(r);
    hits.push({ index: hit.index, location: hit.location, label: hit.label, total: r.total, formula, rf });
  }

  const cardData = { weaponName: weapon.name, damageType: f.damageType, penetration: f.penetration, hits, targetName: f.targetName, canApply: game.user.isGM && !!f.targetUuid };
  const html = await renderTemplate(`systems/better-dh2e/templates/chat/damage-card.hbs`, cardData);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }), rolls, content: html,
    flags: { [NS]: { type: "damage", targetUuid: f.targetUuid, penetration: f.penetration, damageType: f.damageType,
      hits: hits.map((h) => ({ location: h.location, label: h.label, total: h.total, rf: h.rf })) } }
  });
}
```

- [ ] **Step 2:** Create `templates/chat/damage-card.hbs`:
```handlebars
<div class="bdh-card bdh-damage-card">
  <div class="bdh-card-head">{{weaponName}} — Damage ({{damageType}}, Pen {{penetration}})</div>
  <ol class="bdh-hits">{{#each hits}}<li>{{label}}: <b>{{total}}</b>{{#if rf}} <span class="bdh-rf">☠ Righteous Fury!</span>{{/if}}</li>{{/each}}</ol>
  {{#if canApply}}<div class="bdh-card-actions"><button type="button" data-bdh="applyDamage">Apply Damage → {{targetName}}</button></div>{{/if}}
</div>
```

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs templates/chat/damage-card.hbs
git commit -m "feat: damage roll (per-hit, modifier on first, Righteous Fury flag) + damage card"
```

---

### Task 6: Apply Damage — soak vs the bound target (GM)

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Implement `applyDamage(message)`. Reads the damage flags, the target actor, soaks per hit against its equipped armour at each location + TB, sums wounds, applies, and posts a summary.
```javascript
import { computeArmour } from "../helpers/combat-data.mjs";
import { soak, applyWounds } from "../helpers/attack-math.mjs";

async function applyDamage(message) {
  const f = message.flags[NS];
  const target = await fromUuid(f.targetUuid);
  if (!target) return ui.notifications.warn("No target to apply damage to.");
  const sys = target.system;
  const tb = sys.characteristics.toughness.bonus;
  const equipped = target.items.filter((i) => i.type === "armour" && i.system.equipped).map((a) => a.system);
  const ap = computeArmour(equipped, 0);               // pure per-location AP (pass tb=0 so TB isn't folded in)
  let wounds = sys.wounds.value, totalCrit = 0, lines = [];
  for (const h of f.hits) {
    const eff = soak(h.total, ap[h.location] ?? 0, f.penetration, tb);  // soak applies pen to AP, then TB
    const res = applyWounds(wounds, sys.wounds.max, eff);
    wounds = res.wounds; totalCrit += res.critical;
    lines.push(`${h.label}: ${h.total} → ${eff} dmg${res.critical ? ` (${res.critical} critical)` : ""}`);
  }
  await target.update({ "system.wounds.value": wounds });
  const crit = totalCrit > 0 ? `<div class="bdh-card-line fail">Critical damage: ${totalCrit} — consult Critical Effects (location × type).</div>` : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: target }),
    content: `<div class="bdh-card"><div class="bdh-card-head">${target.name} — Damage Applied</div><div class="bdh-card-line">${lines.join("<br>")}</div>${crit}<div class="bdh-card-line">Wounds: ${wounds} / ${sys.wounds.max}</div></div>`
  });
}
```
(NOTE: `computeArmour(equipped, 0)` returns pure per-location AP — passing `tb=0` keeps TB out so `soak()` applies penetration to AP and subtracts TB exactly once. Confirm `computeArmour`'s signature `(armours, toughnessBonus)` during review.)

- [ ] **Step 2: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Apply Damage — per-location soak vs target's equipped armour + TB, wounds + critical"
```

---

### Task 7: Evade flow — Parry / Dodge test card

**Files:** `scripts/rolls/attack.mjs`

- [ ] **Step 1:** Implement `rollEvade(message)`. Prompts Reaction (Parry → WS / Dodge → the Dodge skill) + Modifier, rolls vs the **defender** (the bound target if present and owned, else the current user's selected token's actor, else the attacker), and posts a standard test card via the existing `performTest` (reuse `roll-test.mjs`). Keep it a plain test (no auto-negation).
```javascript
import { performTest } from "./roll-test.mjs";

async function rollEvade(message) {
  const f = message.flags[NS];
  // Defender: prefer the bound target's actor if the user can modify it, else their own selected token / character.
  const defender = (await fromUuid(f.targetUuid)) ?? canvas.tokens?.controlled?.[0]?.actor ?? game.user.character;
  if (!defender) return ui.notifications.warn("Select a token to evade with.");
  const choice = await DialogV2.prompt({
    window: { title: "Evade" },
    content: `<div class="form-group"><label>Reaction</label><select name="reaction"><option value="dodge">Dodge</option><option value="parry">Parry</option></select></div>
              <div class="form-group"><label>Modifier</label><input type="text" name="modifier" value="+0"/></div>`,
    ok: { label: "React", callback: (e, b) => new foundry.applications.ux.FormDataExtended(b.form).object },
    rejectClose: false
  });
  if (!choice) return;
  const modifier = parseInt(String(choice.modifier).replace(/[^-\d]/g, ""), 10) || 0;
  if (choice.reaction === "parry") {
    const base = defender.system.characteristics.weaponSkill.total;
    return performTest(defender, { label: "Parry (WS)", base, modifier });
  }
  const dodge = defender.system.skills.dodge;
  const base = defender.system.characteristics.agility.total + (CONFIG.BDH.skillRanks[dodge.rank] ?? -20);
  return performTest(defender, { label: "Dodge", base, modifier });
}
```
(Adapt `performTest`'s call shape to its actual signature in `roll-test.mjs`. Parry/Balanced-Unbalanced modifiers are Plan 17.)

- [ ] **Step 2: Verify and commit.** Run: `node --check scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/attack.mjs
git commit -m "feat: Evade — Parry/Dodge reaction test card"
```

---

### Task 8: Styles + deploy & verify

**Files:** `styles/better-dh2e.css`

- [ ] **Step 1: Append:**
```css

/* Attack / damage chat cards */
.bdh-card { border:1px solid var(--bdh-brown, #6b4a2b); border-radius:5px; padding:6px 8px; background:#efe6cd; color:#2b2017; font-family:Georgia, serif; }
.bdh-card-head { font-weight:bold; color:#5a2a2a; border-bottom:1px solid #c9b896; margin-bottom:3px; }
.bdh-card-line { font-size:12px; margin:2px 0; }
.bdh-card-line .ok { color:#3d6a4a; font-weight:bold; }
.bdh-card-line .fail { color:#7a2a2a; font-weight:bold; }
.bdh-hits { margin:3px 0 4px 18px; font-size:12px; }
.bdh-rf { color:#7a2a2a; font-weight:bold; }
.bdh-card-actions { display:flex; gap:6px; margin-top:4px; }
.bdh-card-actions button { flex:1; background:#5a2a2a; color:#e7d8b8; border:none; border-radius:3px; font-size:11px; padding:3px; cursor:pointer; }
```

- [ ] **Step 2: Commit**
```bash
git add styles/better-dh2e.css
git commit -m "feat: attack/damage chat-card styles"
```

- [ ] **Step 3: Deploy** — `npm run deploy`. **Step 4: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 5: Browser checklist** (BDH Test World; an acolyte with an equipped ranged weapon + an NPC token on a scene):
- [ ] On the Combat sub-tab, an equipped weapon's **⚔ attack** opens the dialog (Modifier · Aim · Attack Type filtered by class · Range for ranged · Called-Shot location). Roll → an **attack card** posts: target number, roll, Success/DoS, attack type, and **one line per hit with its location**; **⚅ Roll damage** / **🛡 Evade** buttons show on a hit.
- [ ] **Target an NPC token** (T) before attacking → the card reads "vs ‹name›".
- [ ] **Semi/Full-Auto** with enough DoS produces **multiple hit lines** (capped at the weapon's RoF); a **Called Shot** uses the chosen location.
- [ ] A **failed ranged** attack rolling 94+ shows **⚠ jammed**.
- [ ] **⚅ Roll damage** → one modifier popup → a **damage card** with per-hit damage (the modifier on the first hit only); a damage die of 10 shows **☠ Righteous Fury**.
- [ ] As **GM** with a target, the damage card shows **Apply Damage → ‹name›**; pressing it reduces the target's **Wounds** by the soaked amount (armour at that location + TB) and reports any **critical**. With **no target**, there's no Apply button.
- [ ] **🛡 Evade** → Parry/Dodge dialog → a standard test card.
- [ ] **F12**: no errors.

- [ ] **Step 6:** Commit any fix.

---

## Self-Review

**Coverage (§3/§11/§11a core):** pure math (Task 1, TDD); attack config (Task 2); to-hit dialog/card + target binding + jam + hits/locations (Task 3); card-button hook (Task 4); damage popup/roll/RF/card (Task 5); GM Apply soak vs target (Task 6); Parry/Dodge evade (Task 7). ✓

**Deferred (declared):** the 7 quality modules + Shocking condition (Plan 17); crit-effect tables (P1); evade DoS auto-negation (P3); quality flagging on cards is added in Plan 17 (this plan stores `qualities` in flags for it).

**Placeholder scan:** complete; hit-location sequence + jam bands flagged "verify §10"; the `evaluateTest`/`performTest`/`computeArmour` integration notes tell the implementer to match existing shapes (no duplicated math).

**Type/name consistency:** pure helpers' signatures match Task-1 tests + their callers (attack.mjs). Card buttons use `data-bdh` read by `bindCardButtons` (Task 4) via `renderChatMessageHTML` (verified v13 hook). Flags namespace `better-dh2e`, `type` ∈ {attack, damage}. Targeting via `game.user.targets.first()` at to-hit, stored as `targetUuid`. Apply is GM-gated (`game.user.isGM`) and only when `targetUuid` set. `applyDamage` gets pure AP via `computeArmour(equipped, 0)` then lets `soak()` apply pen-to-AP then TB (no double-count). Reuses `evaluateTest`/`performTest`/`computeArmour`/`CONFIG.BDH`; replaces Plan 8 `rollWeaponAttack`.
