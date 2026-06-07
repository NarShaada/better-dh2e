# Better DH2e — Plan 32: Psychic Manifest Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cast psychic powers end-to-end from a **Cast** button: choose effective PR (Fetter/Normal/Push), roll the Focus Power test, resolve **Psychic Phenomena → Perils of the Warp**, and apply the effect — narrative for Effect powers, the full attack pipeline (Evade / Roll Damage) for attack-type powers.

**Architecture:** Pure helpers (`psychic-manifest.mjs`) do all push/fetter/phenomena/PR-substitution math (TDD). A new `manifest.mjs` runs the cast flow and renders one `cast-card.hbs`. Attack-type powers synthesize a PR-resolved weapon profile (damage/pen/qualities + Blast) and reuse the existing attack card buttons; `rollDamage` is extended to read that profile from the message flags (no weapon item). Effect powers print a narrative card. Phenomena/perils are rolled inline and displayed; the GM reads the tables (no automated table effects).

**Tech Stack:** Foundry v13/v14 (DialogV2, Roll, renderTemplate, chat hooks), DataModels, Vitest, Handlebars.

**Scope:** the whole manifest (PR choice, focus roll, phenomena/perils, effect + attack application, qualities on attack powers, PR-formula substitution). **Out of scope:** automated phenomena/perils *table effects* (GM adjudicates); sustained-power tracking; buying powers in advancement.

**Reference (confirmed with the designer):**
- Effective PR: range `1 … normalPR + maxPush`; default normalPR. **maxPush**: Bound +2, Daemonic +3, Unbound +4. **Fetter** (below normal): +10 to focus test per point below; floor 1 (PR-1 psyker can't fetter). **Push** (above normal): −10 per point above. These stack on top of the power's `focusModifier` + a circumstance modifier box. Effective PR drives the power's strength.
- Focus roll: normal d100 test vs resolved `focusTest` (characteristic **or** skill) total; success ≤ target, DoS as usual. Opposed powers show a resist box (existing pattern). Phenomena fire off the roll **regardless of success**.
- **Phenomena**: d100 (+ class modifier); if the modified total ≥ **75**, also roll Perils (d100). Triggers/modifiers:
  | Class | Normal/Fettered | Push |
  |---|---|---|
  | Bound | doubles (no mod) | **not** doubles (no mod) |
  | Unbound | doubles, **+10** | always, **+5 × pushPts** (max +20) |
  | Daemonic | doubles, **+10** | always, **+10 × pushPts** (max +30) |
  Daemonic ignore their own phenomena (narrative note on the card). "Doubles" = matching digits on the focus d100 (00,11,…,99).
- Apply: **Effect** → "casts / fails to cast [Name] at [Fettered/Pushed] PR n" + effect text. **Attack** (Bolt/Barrage/Storm/Blast) → focus roll = the to-hit; full profile resolved off effective PR → Evade + Roll Damage. Hits: Bolt 1; Barrage 1+⌊DoS/2⌋ (cap effPR); Storm 1+DoS (cap effPR); Blast 1 + Blast(radius). Damage/pen substitute **effective** PR; `1d10+2+2*PR` @3 → `1d10+2+2*3`.

Builds on: the psychicPower model + sheet (Plan 29), psy rating/class (Plan 28), the attack pipeline `rollAttack`/`rollDamage`/`rollEvade`/`applyDamage`/`bindCardButtons` + `computeHits`/`locationSequence`/`hitLocation`/`effectivePenetration` (attack-math), the weapon quality selector, and `evaluateTest`.

---

## File Structure

```
scripts/helpers/psychic-manifest.mjs    NEW     pure: push/fetter/phenomena/substitutePR/resolveFocusTarget
test/psychic-manifest.test.mjs          NEW     Vitest
scripts/data/item/psychic-power-model.mjs MODIFY add `qualities` (like weapon)
scripts/sheets/item-sheet.mjs           MODIFY  psychicPower quality selector context (attack types)
templates/item/item-sheet.hbs           MODIFY  quality selector block for attack psychicPowers
scripts/rolls/manifest.mjs              NEW     rollManifest (cast flow) + cast-card assembly
scripts/rolls/attack.mjs                MODIFY  rollDamage reads a psychic profile from flags
templates/chat/cast-card.hbs            NEW     cast card (narrative + phenomena + attack buttons)
scripts/sheets/actor-sheet.mjs          MODIFY  castPower action; Psychic-tab Cast button context
templates/actor/actor-sheet.hbs         MODIFY  Cast button per power
better-dh2e.mjs                          MODIFY  wire castPower → rollManifest (if hook wiring needed)
styles/better-dh2e.css                  MODIFY  cast-card phenomena styling
```

---

### Task 1: `qualities` on psychicPower + quality selector (attack types)

**Files:** `scripts/data/item/psychic-power-model.mjs`, `scripts/sheets/item-sheet.mjs`, `templates/item/item-sheet.hbs`

- [ ] **Step 1: Model.** In `psychic-power-model.mjs` `defineSchema()`, add a `qualities` field identical to the weapon model's (read `scripts/data/item/weapon-model.mjs` for the exact shape) — an `ArrayField` of a `SchemaField({ key: StringField, value: NumberField({nullable:true, initial:null}) })`. Add it after `blastRadius`:
```javascript
      qualities: new fields.ArrayField(new fields.SchemaField({
        key:   new fields.StringField({ required: true }),
        value: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
      }), { initial: [] }),
```
(Match the weapon model's exact field options if they differ.)

- [ ] **Step 2: Sheet context.** In `item-sheet.mjs`, inside the existing `if (context.isPsychicPower) { ... }` block, when the type is an attack, expose the same quality context the weapon block builds:
```javascript
      if (context.psyIsAttack) {
        context.qualityChoices = Object.fromEntries(Object.entries(BDH.qualities).map(([k, v]) => [k, v.label]));
        context.qualityList = (s.qualities ?? []).map((q, i) => {
          const cfg = BDH.qualities[q.key];
          const label = cfg?.label ?? q.key;
          return { index: i, key: q.key, display: cfg?.takesValue && q.value ? `${label} (${q.value})` : label };
        });
      }
```
(The existing `addQuality`/`removeQuality` item-sheet actions already operate on `this.document.system.qualities`, so they work for psychicPower unchanged.)

- [ ] **Step 3: Template.** In `templates/item/item-sheet.hbs`, inside the `{{#if isPsychicPower}}` section's `{{#if psyIsAttack}}` group (after penetration/blastRadius), add the same quality-selector markup the weapon block uses (read the `{{#if isWeapon}}` quality block ~lines 118-128 and replicate): the `{{#each qualityList}}` chips with `data-action="removeQuality"`, and the `<select class="bdh-quality-key">{{selectOptions qualityChoices}}</select>` + `<input class="bdh-quality-value">` + `<button data-action="addQuality">`.

- [ ] **Step 4: Verify and commit.** `node --check scripts/data/item/psychic-power-model.mjs scripts/sheets/item-sheet.mjs && npm test`.
```bash
git add scripts/data/item/psychic-power-model.mjs scripts/sheets/item-sheet.mjs templates/item/item-sheet.hbs
git commit -m "feat: psychicPower qualities + weapon-style quality selector for attack types"
```

---

### Task 2: Pure manifest helpers (TDD)

**Files:** create `test/psychic-manifest.test.mjs`, `scripts/helpers/psychic-manifest.mjs`.

- [ ] **Step 1: Failing test** `test/psychic-manifest.test.mjs`:
```javascript
import { describe, it, expect } from "vitest";
import {
  maxPush, manifestState, fetterPushModifier, isDoubles,
  phenomenaTriggers, phenomenaModifier, substitutePR, resolveFocusTarget,
} from "../scripts/helpers/psychic-manifest.mjs";

describe("maxPush", () => {
  it("by class", () => {
    expect(maxPush("bound")).toBe(2);
    expect(maxPush("daemonic")).toBe(3);
    expect(maxPush("unbound")).toBe(4);
    expect(maxPush("???")).toBe(0);
  });
});

describe("manifestState + fetterPushModifier", () => {
  it("classifies and modifies", () => {
    expect(manifestState(2, 3)).toBe("fettered");
    expect(manifestState(3, 3)).toBe("normal");
    expect(manifestState(5, 3)).toBe("pushed");
    expect(fetterPushModifier(1, 3)).toBe(20);   // 2 below → +20
    expect(fetterPushModifier(3, 3)).toBe(0);
    expect(fetterPushModifier(5, 3)).toBe(-20);  // 2 above → -20
  });
});

describe("isDoubles", () => {
  it("matches repeated digits incl. 100→00", () => {
    expect(isDoubles(11)).toBe(true);
    expect(isDoubles(55)).toBe(true);
    expect(isDoubles(100)).toBe(true);   // "00"
    expect(isDoubles(5)).toBe(false);    // "05"
    expect(isDoubles(23)).toBe(false);
  });
});

describe("phenomenaTriggers", () => {
  it("normal/fettered: doubles for all classes", () => {
    for (const c of ["bound", "unbound", "daemonic"]) {
      expect(phenomenaTriggers(c, "normal", true)).toBe(true);
      expect(phenomenaTriggers(c, "fettered", false)).toBe(false);
    }
  });
  it("push: bound on non-doubles, others always", () => {
    expect(phenomenaTriggers("bound", "pushed", true)).toBe(false);
    expect(phenomenaTriggers("bound", "pushed", false)).toBe(true);
    expect(phenomenaTriggers("unbound", "pushed", true)).toBe(true);
    expect(phenomenaTriggers("daemonic", "pushed", true)).toBe(true);
  });
});

describe("phenomenaModifier", () => {
  it("standing +10 for unbound/daemonic on normal/fettered; 0 for bound", () => {
    expect(phenomenaModifier("bound", "normal", 0)).toBe(0);
    expect(phenomenaModifier("unbound", "fettered", 0)).toBe(10);
    expect(phenomenaModifier("daemonic", "normal", 0)).toBe(10);
  });
  it("push scaling capped", () => {
    expect(phenomenaModifier("bound", "pushed", 2)).toBe(0);
    expect(phenomenaModifier("unbound", "pushed", 3)).toBe(15);
    expect(phenomenaModifier("unbound", "pushed", 4)).toBe(20);   // cap
    expect(phenomenaModifier("daemonic", "pushed", 2)).toBe(20);
    expect(phenomenaModifier("daemonic", "pushed", 3)).toBe(30);  // cap
  });
});

describe("substitutePR", () => {
  it("replaces the PR token (incl. multiplication)", () => {
    expect(substitutePR("1d10+PR", 3)).toBe("1d10+3");
    expect(substitutePR("1d10+2+2*PR", 3)).toBe("1d10+2+2*3");
    expect(substitutePR("PR", 5)).toBe("5");
    expect(substitutePR("1d10", 3)).toBe("1d10");
  });
});

describe("resolveFocusTarget", () => {
  const system = {
    characteristics: { willpower: { total: 45 }, perception: { total: 40 } },
    skills: { psyniscience: { total: 50 } },
  };
  it("resolves a characteristic", () => {
    expect(resolveFocusTarget(system, "willpower")).toEqual({ kind: "characteristic", key: "willpower", total: 45 });
  });
  it("resolves a skill", () => {
    expect(resolveFocusTarget(system, "psyniscience")).toEqual({ kind: "skill", key: "psyniscience", total: 50 });
  });
  it("falls back to willpower for an unknown key", () => {
    expect(resolveFocusTarget(system, "nope")).toEqual({ kind: "characteristic", key: "willpower", total: 45 });
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/psychic-manifest.test.mjs`.

- [ ] **Step 3: Implement** `scripts/helpers/psychic-manifest.mjs`:
```javascript
// scripts/helpers/psychic-manifest.mjs — PURE. Psychic manifest math.

export const MAX_PUSH = { bound: 2, daemonic: 3, unbound: 4 };
export function maxPush(psykerClass) { return MAX_PUSH[psykerClass] ?? 0; }

/** "fettered" | "normal" | "pushed" */
export function manifestState(effectivePR, normalPR) {
  if (effectivePR < normalPR) return "fettered";
  if (effectivePR > normalPR) return "pushed";
  return "normal";
}

/** Focus-test modifier from the PR choice: +10/pt fettered, -10/pt pushed. */
export function fetterPushModifier(effectivePR, normalPR) {
  return (normalPR - effectivePR) * 10;
}

/** Matching tens/units on a d100 (1..100; 100 → "00", a double). */
export function isDoubles(d100) {
  const n = d100 % 100;
  return Math.floor(n / 10) === (n % 10);
}

/** Does phenomena trigger? state: "fettered"|"normal"|"pushed". */
export function phenomenaTriggers(psykerClass, state, doubles) {
  if (state !== "pushed") return doubles;
  if (psykerClass === "bound") return !doubles;
  return true;
}

/** Modifier added to the phenomena d100. */
export function phenomenaModifier(psykerClass, state, pushPoints) {
  if (state === "pushed") {
    if (psykerClass === "unbound")  return Math.min(5 * pushPoints, 20);
    if (psykerClass === "daemonic") return Math.min(10 * pushPoints, 30);
    return 0;
  }
  return (psykerClass === "unbound" || psykerClass === "daemonic") ? 10 : 0;
}

/** Substitute the effective PR into a formula token (handles +PR, *PR, bare PR). */
export function substitutePR(formula, effectivePR) {
  return String(formula ?? "").replace(/\bPR\b/gi, String(effectivePR));
}

/** Resolve a focusTest key to {kind, key, total} against an actor system; falls back to willpower. */
export function resolveFocusTarget(system, focusTest) {
  if (system?.characteristics?.[focusTest] != null) {
    return { kind: "characteristic", key: focusTest, total: system.characteristics[focusTest].total ?? 0 };
  }
  if (system?.skills?.[focusTest] != null && typeof system.skills[focusTest].total === "number") {
    return { kind: "skill", key: focusTest, total: system.skills[focusTest].total };
  }
  return { kind: "characteristic", key: "willpower", total: system?.characteristics?.willpower?.total ?? 0 };
}
```

- [ ] **Step 4: Run — PASS + check.** `npx vitest run test/psychic-manifest.test.mjs`, then `node --check scripts/helpers/psychic-manifest.mjs && npm test`.

- [ ] **Step 5: Commit.**
```bash
git add scripts/helpers/psychic-manifest.mjs test/psychic-manifest.test.mjs
git commit -m "feat: pure psychic-manifest helpers (push/fetter/phenomena/substitutePR/focus) (TDD)"
```

---

### Task 3: Cast flow + Effect card + Cast button

**Files:** create `scripts/rolls/manifest.mjs`, `templates/chat/cast-card.hbs`; modify `scripts/sheets/actor-sheet.mjs`, `templates/actor/actor-sheet.hbs`, `better-dh2e.mjs`, `styles/better-dh2e.css`.

This task delivers a working cast for **Effect** powers (attack rendering comes in Task 4). Read `scripts/rolls/attack.mjs` for `evaluateTest`, `DialogV2.prompt`, `renderTemplate`, the `NS` constant, and how cards are created (`ChatMessage.create`), and `templates/chat/attack-card.hbs` for card style.

- [ ] **Step 1: `manifest.mjs` — the cast flow.** Create `scripts/rolls/manifest.mjs` exporting `async function rollManifest(actor, powerId)`:
  - Resolve `power = actor.items.get(powerId)`; `const s = power.system`. Bail if not a `psychicPower`.
  - `const normalPR = actor.system.psyRating ?? 0;` if `< 1` → `ui.notifications.warn("This character has no Psy Rating.")` and return.
  - `const psykerClass = actor.system.psykerClass;` `const mp = maxPush(psykerClass);`
  - Build the **effective-PR `<select>`** options from `1` to `normalPR + mp`, default `normalPR`, each labelled by state+modifier, e.g.:
    ```javascript
    const prOpts = [];
    for (let pr = 1; pr <= normalPR + mp; pr++) {
      const st = manifestState(pr, normalPR);
      const m = fetterPushModifier(pr, normalPR);
      const tag = st === "normal" ? "Normal" : st === "fettered" ? `Fettered +${m}` : `Push ${m}`;
      prOpts.push(`<option value="${pr}"${pr === normalPR ? " selected" : ""}>PR ${pr} — ${tag}</option>`);
    }
    ```
  - Dialog (DialogV2.prompt) with content: the effective-PR select (`name="effPR"`) + a circumstance modifier box (`name="modifier" value="+0"`). `ok` returns the FormDataExtended object.
  - Compute: `effPR = Number(choice.effPR)`, `state = manifestState(effPR, normalPR)`, `pushPts = Math.max(0, effPR - normalPR)`, `circ = parseInt(String(choice.modifier).replace(/[^-\d]/g,""),10)||0`.
  - `const focus = resolveFocusTarget(actor.system, s.focusTest);`
  - `const focusMod = (s.focusModifier ?? 0) + fetterPushModifier(effPR, normalPR) + circ;`
  - Roll: `const roll = await new Roll("1d100").evaluate();` `const result = evaluateTest({ base: focus.total, modifier: focusMod, roll: roll.total });` → `success, degrees, target, modifier`. `const dos = success ? degrees : 0;` `const doubles = isDoubles(roll.total);`
  - **Phenomena:** `const phenTriggered = phenomenaTriggers(psykerClass, state, doubles);` if triggered: `const phenRoll = await new Roll("1d100").evaluate();` `const phenMod = phenomenaModifier(psykerClass, state, pushPts);` `const phenTotal = phenRoll.total + phenMod;` `let perilRoll = null; if (phenTotal >= 75) perilRoll = (await new Roll("1d100").evaluate()).total;`
  - **State label** for the card: `const stateLabel = state === "normal" ? "" : state === "fettered" ? "Fettered " : "Pushed ";`
  - Assemble `cardData` (see Step 2) and, for an **Effect** power, `ChatMessage.create({ speaker, content: await renderTemplate("systems/better-dh2e/templates/chat/cast-card.hbs", cardData), flags: { [NS]: { type: "cast" } } })`.
  - (Task 4 adds the attack branch before message creation.)
  - Export `rollManifest`.

- [ ] **Step 2: `cast-card.hbs`.** Create `templates/chat/cast-card.hbs` rendering, from `cardData`:
  - Header: `{{casterName}} {{#if success}}casts{{else}}fails to cast{{/if}} <b>{{powerName}}</b>{{#if stateLabel}} at {{stateLabel}}PR {{effPR}}{{else}} at PR {{effPR}}{{/if}}`.
  - Focus line: `{{focusLabel}} test — rolled {{roll}} vs {{target}} → {{#if success}}{{degrees}} DoS{{else}}Failed{{/if}}`.
  - Phenomena block (`{{#if phenTriggered}}`): `Psychic Phenomena: d100 {{phenRoll}}{{#if phenMod}} {{phenSign}}{{phenMod}}{{/if}} = {{phenTotal}}` and `{{#if perilRoll}}<b>Perils of the Warp!</b> d100 {{perilRoll}} — GM consult the table.{{/if}}`.
  - `{{#if daemonicNote}}<div class="bdh-note">{{daemonicNote}}</div>{{/if}}` (set `daemonicNote` = "Daemonic — unaffected by its own phenomena." when class is daemonic and phenTriggered).
  - Effect text: `{{#if effectText}}<div class="bdh-effect">{{{effectText}}}</div>{{/if}}` (the power description).
  - Leave a `{{#if isAttack}} … {{/if}}` placeholder region for Task 4's buttons/hits.
  - `cardData` keys to set in manifest.mjs: `casterName, powerName, success, stateLabel, effPR, focusLabel` (resolve `focus.key`→localized characteristic/skill label), `roll, target, degrees, phenTriggered, phenRoll, phenMod, phenSign` (`phenMod>=0?"+":""`), `phenTotal, perilRoll, daemonicNote, effectText` (the power's `description`), `isAttack` (false here; Task 4 sets true for attack types).

- [ ] **Step 3: Cast button (context + template).** In `actor-sheet.mjs`, the `psychicPowers` map already exists — add `castable: (this.document.system.psyRating ?? 0) >= 1` to the context (or compute per power). In `templates/actor/actor-sheet.hbs` Psychic-tab power row, add a Cast button when castable:
```handlebars
          {{#if @root.castable}}<a class="bdh-cast" data-action="castPower" data-item-id="{{p.id}}" title="Cast">✦ Cast</a>{{/if}}
```
Add the action handler in actor-sheet.mjs:
```javascript
  static async #onCastPower(event, target) {
    const power = this.actor.items.get(target.dataset.itemId);
    if (power) await rollManifest(this.actor, power.id);
  }
```
Register `castPower: DarkHeresyActorSheet.#onCastPower` in `DEFAULT_OPTIONS.actions`, and `import { rollManifest } from "../rolls/manifest.mjs";`.

- [ ] **Step 4: Styles.** Append minimal CSS for `.bdh-cast` (button-ish), `.bdh-effect`, `.bdh-note` to `styles/better-dh2e.css` (match existing chat-card/section styles).

- [ ] **Step 5: Verify and commit.** `node --check scripts/rolls/manifest.mjs scripts/sheets/actor-sheet.mjs && npm test`.
```bash
git add scripts/rolls/manifest.mjs templates/chat/cast-card.hbs scripts/sheets/actor-sheet.mjs templates/actor/actor-sheet.hbs styles/better-dh2e.css
git commit -m "feat: psychic cast flow — effective-PR dialog, focus roll, phenomena/perils, Effect card + Cast button"
```

---

### Task 4: Attack-type powers → the attack pipeline

**Files:** `scripts/rolls/manifest.mjs`, `scripts/rolls/attack.mjs`, `templates/chat/cast-card.hbs`

Read `rollAttack` (attack.mjs:352-520) and `rollDamage` (~190-230) and `templates/chat/attack-card.hbs` for the hits/buttons markup, and `scripts/helpers/psychic-data.mjs` for `isPsychicAttack`.

- [ ] **Step 1: Attack synthesis in `rollManifest`.** Before creating the message, if `isPsychicAttack(s.type)`:
  - Map the power type → existing attack-type hit config:
    ```javascript
    const MAP = { bolt: "standard", barrage: "semiAuto", storm: "fullAuto", blast: "standard" };
    const at = CONFIG.BDH.attackTypes[MAP[s.type]];
    const rofCap = (s.type === "barrage" || s.type === "storm") ? effPR : Infinity;
    const nHits = success ? computeHits(at, dos, rofCap) : 0;
    ```
  - Qualities: `const qualities = [...(s.qualities ?? [])]; if (s.type === "blast" && s.blastRadius > 0) qualities.push({ key: "blast", value: s.blastRadius });`
  - Penetration: `const penBase = Number((await new Roll(substitutePR(String(s.penetration||"0"), effPR) || "0").evaluate()).total) || 0;` then `const penetration = effectivePenetration(penBase, { qualities, dos, success, closeRange: false });`
  - Damage formula: `const damage = substitutePR(s.damage || "", effPR);`
  - Locations: `const firstLoc = hitLocation(roll.total); const locs = success ? locationSequence(firstLoc, nHits) : []; const hits = locs.map((loc, i) => ({ index: i, location: loc, label: CONFIG.BDH.hitLocationLabels[loc] }));`
  - Target token: `const targetToken = game.user.targets.first() ?? null;`
  - Set `cardData.isAttack = true` and add `hits`, `qualityLabels`, etc. for the card.
  - Build the message flags so Evade/Roll Damage/Apply work — a **psychic** profile (no weapon):
    ```javascript
    const flags = { [NS]: {
      type: "attack", psychic: true, actorUuid: actor.uuid,
      damage, penetration, damageType: s.damageType, qualities,
      isRanged: true, dos, hits, success, jammed: false, scatterDmg: 0,
      targetUuid: targetToken?.actor?.uuid ?? null, targetName: targetToken?.name ?? null,
      maximal: false,
    }};
    ```
  - Create the message with these flags (instead of the `type:"cast"` flags) when it's an attack power.

- [ ] **Step 2: `cast-card.hbs` attack region.** Fill the `{{#if isAttack}}` region with the same hits list + buttons as `attack-card.hbs`: the `{{#each hits}}` location rows, a **Roll Damage** button (`data-bdh="rollDamage"`) and an **Evade** button (`data-bdh="evade"`), plus `{{qualityLabels}}`. (Copy the markup from attack-card.hbs so `bindCardButtons` wires them identically.)

- [ ] **Step 3: `rollDamage` psychic branch.** In `attack.mjs` `rollDamage`, source the profile from flags when `f.psychic`:
```javascript
  const psychic = !!f.psychic;
  const weapon = psychic ? null : actor.items.get(f.weaponId);
  if (!psychic && !weapon) return;
  const baseFormula = psychic ? (f.damage || "0") : weapon.system.damage;
  const qualities = psychic ? (f.qualities ?? []) : (f.qualities ?? weapon.system.qualities ?? []);
```
Then guard the melee-only bits so they only run for weapons:
```javascript
  const craftDmg = (!psychic && !f.isRanged) ? meleeCraftDamageBonus(weapon.system.craftsmanship) : 0;
  const strBonus = (!psychic && !f.isRanged) ? (actor.system.characteristics.strength?.bonus ?? 0) : 0;
```
The rest (Tearing via `weaponDamageFormula(qualities, weaponBase)`, accurate dice, RF threshold via `vengefulValue`, the per-hit loop) stays the same but reads the local `qualities`/`baseFormula`. Confirm `f.maximal` is false for psychic (no maximal row), and the `weapon`-named references later in the function fall back to the psychic values (e.g. the card's weapon name → use `f.weaponName ?? weapon?.name`; add `weaponName` to the psychic flags as the power name). Add `weaponName: power.name` to the Task-1 psychic flags.

- [ ] **Step 4: Verify `rollEvade`/`applyDamage` are weapon-agnostic.** Read both — they should operate purely off flags (`targetUuid`, `hits`, `dos`, `penetration`, `damageType`). If either dereferences a weapon item, add the same `f.psychic` guard. (Likely no change needed.)

- [ ] **Step 5: Verify and commit.** `node --check scripts/rolls/manifest.mjs scripts/rolls/attack.mjs && npm test`.
```bash
git add scripts/rolls/manifest.mjs scripts/rolls/attack.mjs templates/chat/cast-card.hbs
git commit -m "feat: attack-type psychic powers route through the attack pipeline (Evade/Roll Damage, PR-resolved profile + qualities)"
```

---

### Task 5: Deploy & verify

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`. **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Browser checklist** (a psyker on the dh2e sandbox — set PR ≥ 2 and a class; create a couple of powers):
- [ ] **Cast button** shows on each power when PR ≥ 1; opens a dialog with the **effective-PR dropdown** (Fettered/Normal/Push options to normalPR+maxPush by class) + a modifier box.
- [ ] **Fetter** lowers effective PR and **adds +10/pt** to the focus test; **Push** raises it and **−10/pt** (and the resolved damage uses the chosen PR).
- [ ] **Effect power:** card reads "casts / fails to cast [Name] at [Fettered/Pushed] PR n" + effect text + focus result.
- [ ] **Phenomena:** rolling doubles on a normal/fettered cast (or any push per the class rules) shows the Phenomena d100 (+ the class modifier); a modified 75+ also shows a Perils roll. Bound-on-push triggers on non-doubles; Unbound/Daemonic always on push (with the right +mod); Daemonic shows the "unaffected" note.
- [ ] **Attack power (Bolt):** a successful cast shows hit location(s) + **Evade** + **Roll Damage**; Roll Damage uses the PR-substituted formula (e.g. `1d10+2+2*PR` at PR 3 rolls `1d10+8`) and respects qualities (Tearing/Blast/etc.); Apply Damage works (and obeys the ownership rule). **Barrage/Storm** produce multiple hits scaling with DoS, capped at effective PR.
- [ ] **F12:** no errors.

- [ ] **Step 4:** Commit any fix.

---

## Self-Review

**Coverage:** qualities on attack powers (T1); push/fetter/phenomena/substitute/focus math (T2, TDD); cast dialog + focus roll + phenomena/perils + Effect card + Cast button (T3); attack-type routing through the pipeline + psychic rollDamage (T4). ✓

**Deferred (declared):** automated phenomena/perils table effects; sustained tracking; power advancement.

**Placeholder scan:** complete; checklist concrete (fetter +10/pt, push −10/pt, push phenomena caps +20/+30, `1d10+2+2*PR`@3, hit scaling capped at effPR).

**Type/name consistency:** helper signatures match the Task-2 tests (`maxPush`/`manifestState`/`fetterPushModifier`/`isDoubles`/`phenomenaTriggers`/`phenomenaModifier`/`substitutePR`/`resolveFocusTarget`). `rollManifest(actor, powerId)` is imported by the `castPower` action; it reuses `evaluateTest`, `computeHits`, `locationSequence`, `hitLocation`, `effectivePenetration`, `substitutePR`. Attack powers write `type:"attack", psychic:true` flags carrying `damage` (PR-substituted), `penetration`, `damageType`, `qualities`, `hits`, `weaponName`; `rollDamage` branches on `f.psychic` to use those instead of a weapon item (skipping melee craft/Str-bonus), and `bindCardButtons` (Plan 30) already gates Apply Damage by target ownership. `psychicPower.qualities` mirrors the weapon `qualities` SchemaField so the shared `addQuality`/`removeQuality` actions + the pipeline's quality helpers work unchanged. Blast pushes a `{key:"blast", value: blastRadius}` quality. Phenomena modifier caps: unbound 5×pts→20, daemonic 10×pts→30 (pushPts bounded by maxPush).
