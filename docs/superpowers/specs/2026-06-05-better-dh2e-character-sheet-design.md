# Better DH2e — Standalone Foundry System & Character Sheet Design

- **Date:** 2026-06-05
- **Status:** Approved design (pre-implementation)
- **Scope of this spec:** The standalone system skeleton, data model, character sheet (including the Advancement tab), and rules/automation engine. **Full psychic automation** and the **fast-attack save-template** behavior are deliberately deferred to future phases (see §9).

---

## 1. Overview & Goals

A brand-new, **standalone** Foundry VTT *game system* for **Dark Heresy 2nd Edition**, replacing the day-to-day experience of the existing community `dark-heresy` system. Three goals, in the user's words:

1. **Better support** — works on modern Foundry (the current system needs compatibility hacks on v13).
2. **Better character sheet** — the existing sheet is dense and unintuitive; this redesigns it.
3. **More automation** — the existing system hand-waves several mechanics; this automates them.

**Hard constraints**

- Does **not** modify the installed `dark-heresy` system, its world `dh2e`, or any installed module on the remote (Foundry **v13.351.0**, `/opt/foundrydata`). This is a separate system with its own id.
- **Built fresh, no code reuse** from the existing GPL system. The rules math is simple enough that owning every line is worth more than porting; we want complete control and understanding. This makes the result original work with no GPL-derivative entanglement.
- **Content-free.** DH2e is all-rights-reserved (GW/FFG/Cubicle 7); there is no SRD. We ship the *rules engine + blank compendium structures only* — no rulebook prose, statblocks, tables, or art. Owners populate content from their own legally-purchased books.

## 2. Architecture & Constraints

- **Target:** Foundry **v13+**, built native: **ApplicationV2** sheets and **DataModels** (`foundry.data.fields`); no jQuery, no legacy `ActorSheet`/`document.data` patterns.
- **System id:** new and distinct (e.g. `better-dh2e`) so it installs alongside the existing system without collision.
- **Build:** standard system layout (`system.json`, `lang/`, `templates/`, `styles/`, `scripts/`, `packs/`), bundled ES module entry point.
- **Rules tables are data-driven** where community sources disagree (XP costs, Psy-push values) so GMs can match their printing/house rules without code changes.

## 3. Rules Engine (reimplemented from the book)

Core resolution and the DH2e-specific details that automation must get right:

- **d100 roll-under:** result ≤ modified target = success. Natural **01 always succeeds, 100 always fails**.
- **Characteristic Bonus** = tens digit (T 42 → TB 4); `unnatural` adds to the bonus.
- **Degrees of Success / Failure (DH2e formula):** `DoS = 1 + (tens(target) − tens(roll))` on success; `DoF = 1 + (tens(roll) − tens(target))` on failure. Surface DoS/DoF on every test.
- **Tests:** characteristic and skill (skill = governing characteristic + rank bonus); ±10 difficulty steps; combined modifier cap **±60**; assistance +10.
- **Combat chain:**
  1. Modified attack test (WS melee / BS ranged; attack-type, aim, range modifiers).
  2. **Hit location = reverse the roll's digits** against the location bands (01–10 Head, 11–20 R Arm, 21–30 L Arm, 31–70 Body, 71–85 R Leg, 86–100 L Leg). Fixed multi-hit location sequence for extra hits.
  3. **Damage:** weapon dice (+SB melee), optional die-for-DoS substitution, trait handling.
  4. **Soak:** subtract `(Armour − Penetration)` (floor 0) from damage, then `Toughness Bonus`.
  5. Overflow past **Wounds** (a threshold, not a pool) = **Critical**, triggering Critical Effects by location × damage type.
- **Rate of Fire extra hits:** semi-auto +1 hit / 2 extra DoS; full-auto +1 / extra DoS; capped at weapon RoF; **Storm** doubles.
- **Righteous Fury:** natural 10 on a damage die (or **Vengeful (X)**); if it dealt damage → roll the matching Critical Effect; if it dealt none → 1 point ignoring armour/TB.
- **Weapon traits** that drive automation: Tearing, Proven (X), Primitive (X), Razor Sharp, Felling (X), Accurate, Storm, Twin-Linked, Concussive, Shocking, Snare, Toxic, Flame, Blast, Force, Vengeful. Stored structured (not parsed from free text).
- **Psychic — kept simple, automation out of scope for this version.** Psy Rating is represented as an ordinary **trait** item; psychic powers are **simple descriptive items** in the Psychic tab. Full psychic resolution (Focus Power test, Fettered/Unfettered/Push, Psychic Phenomena → Perils of the Warp, PR-capped attack powers) is a **future phase** (§9).
- **Fate:** spend (+10 & reroll, reroll, extra action, reduce damage) vs **burn** (permanent −1 max). Refresh to max each session.
- **Corruption / Insanity:** each +10 crosses a threshold → Malignancy / Trauma test with the track penalty; disorders at 40/60/80 IsP; track penalties (−10/−20/−30) applied to relevant tests.
- **Fatigue:** any characteristic whose bonus < current Fatigue is halved (structured time); over the max → Unconscious. **This system's design decision:** the Fatigue bar's **default max = Toughness Bonus**, editable in Custom advancement (traits/talents may raise/lower it — rare). *Heads-up: DH2e RAW and the current Plan-1 `fatigueMax` use **TB + WB** (the unconscious threshold) — reconcile the max formula when fatigue is wired (§13).*
- **Encumbrance:** carry capacity from SB+TB table; over → Agility/movement penalties.
- **Advancement:** two aptitudes per advance; XP cost by 2/1/0 aptitude matches (cost tables **configurable**).

### Automation extensibility (resolution pipeline)

Automation lands in the hottest part of the code — the roll/damage formulas — and will be added iteratively, so the engine is built to absorb it without rework:

- Resolution runs as an ordered **pipeline of small stages** over a mutable **context** (actor, item, target, modifiers, dice, hits, damage, queued follow-ups), e.g. `collectModifiers → resolveToHit → computeHits → assignLocations → resolveDamage → modifyDamage → resolveSoak → applyToTarget → queuedEffects`.
- Each **weapon quality / talent / ammo effect / condition** is a **self-contained module** that hooks one or more stages and mutates the context, **registered against its structured key**. Adding a rule = one module + one registry entry; the pipeline core is untouched. Examples: **Tearing** → `modifyDamage`; **Razor Sharp** → `resolveSoak` (double Pen at DoS ≥ 3); **Toxic (X)** → `queuedEffects` (Toughness test at −10·X).
- Qualities are stored as **structured data** on items (`[{key, value}]`), never regex-parsed from free text → reliable triggering.
- **Static/passive** modifiers ride Foundry **Active Effects**; the pipeline owns the **roll-time, conditional, dice-level** behavior Active Effects can't express.
- **Graceful degradation:** an un-implemented quality is still displayed and flagged on the card, never silently dropped — so qualities are automated one at a time.
- Each stage is independently testable (TDD-friendly), matching the staged automation phasing (§8). Exact per-quality behavior (e.g. Tearing's die handling) is verified against the book per module (§10).

## 4. Data Model

**Actor types:** `acolyte`, `npc`.

- **Characteristics** (10: WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf): store `base`, `advance`, `unnatural`; derive `total = base + advance` and `bonus = floor(total/10) + unnatural`. **Influence** is modeled as a characteristic but flagged special (it behaves differently and is presented apart on the sheet).
- **Skills:** rank/tier, governing characteristic(s); derive total = characteristic.total + rank bonus. **Specialist skills** carry no rank of their own — instead a **dynamic list of specializations**, each an independent entry `{ name, rank, characteristic (defaults from parent) }`, advanceable like its own skill (replaces the old fixed `specialities{}` map so arbitrary names can be added on the fly).
- **Resources:** Wounds (threshold: `value`/`max` + `critical`), Fatigue (`value`/`max` derived TB+WB), Fate (`value`/`max`), Corruption, Insanity. (**Psy Rating is not a resource** — it is a `trait` item; see the item table.)

**Item types**

| Type | Key fields | Notes |
|---|---|---|
| `weapon` | class, range, RoF (single/semi/full), damage, damageType, penetration, clip, structured `traits`, **embedded mods**, `equipped` | Owns its modifications; clip tracking lives here. |
| `armour` | per-location AP (head/arms/body/legs), `additive` flag, maxAgility, craftsmanship, `equipped` | One non-additive piece equippable at a time; additive layers stack. |
| `forceField` | protectionRating, overload, craftsmanship, `equipped` | Distinct mechanics; equip surfaces PR on Combat. |
| `talent` | tier, aptitudes, prerequisites, benefit, **favourite** flag | Favourites surface on the Combat sub-tab. |
| `psychicPower` | name, discipline, action, range, description, cost | **Simple descriptive item** (no Focus-Power/Phenomena automation this version); `cost` lets Simple advancement charge it. |
| `trait`, `mutation`, `malignancy`, `mentalDisorder`, `cybernetic` | description, source, effect | Body/mind items → Afflictions tab. |
| `criticalInjury` / `lastingInjury` | type, location, description | Persistent injuries surface on Combat. |
| `gear` | name, description (holds effect text), craftsmanship (P/N/G/B), quantity | **Generic** catch-all. |
| `aptitude` | name | Drives XP cost. |

*Psy Rating* uses the existing `trait` item — no dedicated psyker fields this version (relocating it to a structured control is part of the future psychic phase, §9).

**Removed vs. the old system** (deliberate simplifications):

- `ammunition` → **generic `gear`** ("pure squash": qty + description; clip tracking stays on the weapon; special-ammo effects are applied manually — accepted tradeoff).
- `weaponModification` → **embedded inside `weapon`** (installed = part of the weapon; uninstalled mods are not tracked as standalone items).
- `drug`, `tool` → **generic `gear`**.
- `cybernetic` stays a type but moves presentation from Gear → **Afflictions**.

## 5. Equipped Model

- `equipped` boolean on `weapon`, `armour`, `forceField`. Equipped items appear on the **Combat** sub-tab.
- **Armour rule:** only one **non-additive** armour piece equipped at a time (radio behavior); **additive** layers may stack (checkbox).
- Equipping a **force field** adds its **Protection Rating** display under the armour row on Combat.

## 6. Character Sheet

*(Roll dialogs and chat cards for the sheet's click-to-roll affordances — characteristic, skill, attack — are detailed in §11.)*

**Top-level tabs:** `Stats · Abilities · Gear · Notes · Afflictions · Psychic (last, hideable) · ⚙ Advancement`.

**Header.** Crest, **shrunk name label** (to free space), origin/background/role/home-world, and a **clickable Fate** widget that opens a "how to spend" dialog.

**Stats tab.**
- Persistent **characteristic row**: squares with FFG short names (WS, BS, S, T, Ag, Int, Per, WP, Fel, Inf), each with a **bonus mini-box on top** (tens digit / unnatural). **Influence is offset** with a divider to mark its special status. Clicking a square opens the roll dialog.
- Persistent **Fatigue bar** under the header (Corruption/Insanity moved to Afflictions).
- A **sub-tab toggle** inside Stats: **Investigation** | **Combat**.
  - **Investigation:** the skill list (two columns, K/T/E/V tiers) with a **"Hide untrained"** button to collapse below-Known rows for at-a-glance reading. **Specialist skills** (Linguistics, Common Lore, Trade…) render as an **expandable parent** with their specializations as click-to-roll children (the roll dialog defaults to the parent's characteristic). The **"＋ add specialization"** control is *not* shown here — adding one is an advancement action.
  - **Combat:** **Armour row** (6 location squares mirroring the characteristic layout — small box = TB, big box = total protection; force-field PR appears here when equipped); **combat gear** (equipped weapons, **two-tier attack** — see below); **Wounds** (current/max + critical); **Lasting injuries & conditions** box (persistent crit effects: lost limb, blindness, bleeding…); **★ favourite talents** (starred on Abilities); compact **Movement & Initiative**.

**Two-tier attacks** (affordance now, behavior deferred): the **weapon name (⚙)** opens the full dialog (attack type, aim, range, ammo) to roll *and* **"Save as template."** The **⚔ Attack** button then fast-rolls that saved configuration in one click, showing its current mode beneath it.

**Abilities tab.** Keep current structure; modernise to the new theme. Talents get a **★ favourite** toggle (drives the Combat list).

**Gear tab.** Consolidated to **Weapons · Protection (Armour + Force Field) · Gear**. Equipped boxes on Weapons/Armour/Force-Field. Weapons own their mods (⚙). The **Gear** list shows **name · short description · craftsmanship (P/N/G/B) · quantity**. Encumbrance bar at the top.

**Notes tab.** Keep as-is; modernise look.

**Afflictions tab.** Two **track meters** (Corruption, Insanity) showing value, current **track tier** + test penalty, a four-band ladder, the **"next test at…"** threshold, and a one-click **Malignancy / Trauma test** button. Three lists below: **Mutations & Malignancies**, **Mental Disorders**, **Cybernetics**. Threshold crossings can auto-prompt the matching test and file results here.

**Psychic tab.** Keep; make **hideable** and ordered last (most characters never use it). Powers are **simple descriptive items**; **Psy Rating shows as a trait**. No psychic automation this version (future phase, §9).

**Advancement tab.** A control center plus a global sheet **mode**. The tab itself holds:

- an **Aptitudes** picker — select the character's aptitudes from a fixed, hardcoded list (selecting is *not* itself an XP purchase);
- an **XP ledger** — **Total / Spent / Free**;
- two **mode toggles**: **Simple** and **Custom**.

Activating a mode overlays advancement affordances across the *whole* sheet (characteristic squares, skill rows, etc.) until the mode is pressed again, which returns the sheet to play mode.

- **Custom mode** — *free edit, no auto-cost.* Unlocks direct editing of characteristics (type any value), skills (rank dropdown: Untrained −20 / Known +0 / Trained +10 / Experienced +20 / Veteran +30), and the **Spent XP** field; dropped talents/powers are not charged. For building characters or reconciling by hand.
- **Simple mode** — *auto-cost, buy-only.* Computes cost from aptitudes and subtracts from Free XP automatically:
  - **Characteristics:** a **+5 button** usable up to 5 times (the five advance tiers Simple → Intermediate → Trained → Proficient → Expert); displays how many advances are taken and the next tier's cost; each press adds 5 and charges the escalating cost.
  - **Skills:** a **"+"** that advances to the next rank (Known → Trained → Experienced → Veteran) and charges per the skill table. **Specialist skills** advance **per specialization** (each its own "+" in Simple / rank dropdown in Custom); the **"＋ add specialization"** control — available **only in an advancement mode** — creates a new one that **starts at Known** (adding a specialization *is* buying a new skill: Untrained = un-owned/no investment, Known = the first purchased rank), charging the Known cost in Simple and free-set in Custom.
  - **Talents / Psychic Powers:** dropped onto the sheet as items (no compendium — the user authors them); cost is auto-charged from the item's **tier + aptitudes** (talents) or its **cost** field (powers).
  - Simple is **buy-only**; corrections to a mistaken purchase are made in Custom.
- **Cost tables** (characteristic / skill / talent by 2/1/0 aptitude matches) are **data-driven/configurable** (§10).

*Psy Rating advancement is excluded for now* (it's a trait this version); wiring it into Simple advancement is part of the future psychic phase (§9).

## 7. Theming

Modernised **parchment** aesthetic (validated in mockups): warm parchment field `#e7d8b8`, panels `#efe6cd`, maroon chrome `#5a2a2a`/`#6b4a2b`, gold accents `#c9a24b`/`#b8902f`, serif type. Applied consistently across all tabs. Cleaner hierarchy, larger hit targets, explicit click-to-roll affordances — the antidote to the old sheet's density.

## 8. Automation Phasing

- **P0 — correctness:** DoS/DoF (tens-digit formula), reversed-digit hit location, RoF extra-hits, full damage→soak→wounds→critical pipeline.
- **P1 — wow:** Righteous Fury + Critical Effect tables, Fate-point buttons (spend/reroll/reduce/burn).
- **P2 — bookkeeping:** XP-cost gating on advancement (Simple mode), Corruption/Insanity auto-prompts, Fatigue & Encumbrance engines, condition/status automation from weapon qualities.
- **P3 — QoL:** modifier stacking with the ±60 cap shown, reaction (Dodge/Parry) tracking with per-DoS hit negation, opposed-test resolver, **fast-attack save-template** behavior.
- **Future (post-1.0):** full psychic automation — Focus Power tests, Fettered/Unfettered/Push, Psychic Phenomena → Perils, PR-capped attack powers — plus relocating Psy Rating to a structured control in the Psychic tab and wiring it into Simple advancement.

## 9. Deferred / Out of Scope (this spec)

**Planned major features (future versions):**

- **Vehicles** — a dedicated vehicle sheet and its tangled interactions with characters (transport, cover, vehicle-scale weapons and combat). An entire subsystem; **not modeled at all** in this version.
- **Detailed psychic powers** — full Focus Power tests, Fettered/Unfettered/Push, Psychic Phenomena → Perils, PR-capped attack powers, plus relocating Psy Rating to a dedicated Psychic-tab control and wiring it into Simple advancement. *This version keeps psychic simple:* Psy Rating is a trait, powers are descriptive items (see §3/§6).

**Deferred details (this version):**

- **Fast-attack save-template** behavior (affordance designed; logic in P3).
- **Compendium content** (ships blank; populated by owners).

## 10. To Verify Against the Printed Rulebook

Treat these as data, confirm exact values before locking:

1. **Characteristic-advance XP table** (Wikidot vs. quick-refs disagree).
2. **Psy Rating → Focus Power modifier and Push values** per psyker type *(needed only for the future psychic phase, §9)*.
3. **Encumbrance (SB+TB) table** values (not mirrored on open wikis).

## 11. Rolls & Dialogs

**Shared model.** Every roll opens a small dialog (**Roll / Cancel**) and posts a **chat card**. The **Modifier** field parses a signed integer — `10` or `+10` → +10, `-10` → −10 — and every modifier (manual, aim, range, attack type) adjusts the **target number**, never the die. Combined modifiers are capped at **±60**. Cards report: what was rolled, the target (with a transparent modifier breakdown), the die result, **Success / Failure** (green/red), and **DoS or DoF**.

**Characteristic test.** Dialog: Modifier. Card: characteristic · modifier · target · rolled · outcome · DoS/DoF.

**Skill test.** Dialog adds a **characteristic selector** (the skill's usual characteristic pre-selected, since some skills may be rolled off another) above Modifier. Card additionally shows the chosen characteristic and the skill rank.

**Attack test — to-hit only.** Dialog: Modifier · **Aiming** (None / Half +10 / Full +20) · **Attack Type** · **Range** (ranged weapons only: Point-Blank +30 / Short +10 / Normal +0 / Long −10 / Extreme −30). Attack Type carries both a flat modifier *and* a hit-scaling rule; its internals are **hardcoded** (exact numbers to verify, §10):

- **Single-hit:** Standard (+10), Called Shot (−20, choose location), All-Out Attack (melee, no reactions), Charge (melee +10).
- **Multi-hit (DoS-scaling):** Semi-Auto Burst (+0, +1 hit per 2 DoS), Full-Auto Burst (−10, +1 hit per DoS), Swift Attack (melee), Lightning Attack (melee). Extra hits are capped at the weapon's RoF; **Storm** doubles.

The attack card shows outcome, **DoS**, the attack type, and **one line per hit with its rolled hit location** (reversed-digit rule; multi-hit uses the location sequence). It carries two action buttons — **⚅ Roll damage** and **🛡 Evade** — that launch the damage and evasion steps as their own follow-up cards (below). This keeps the to-hit card focused and matches the staged automation plan.

**Damage (from the attack card).** Popup shows the weapon's **base damage** and a **Modifier** whose regex accepts flat numbers *and* dice (`+2`, `-1`, `1d5`, `1d10+3`). **One popup per attack** — even for a burst (per-hit popups would be tedious). The card rolls the weapon's **base damage for each hit** at its location; the **Modifier is applied once, to the first hit only** (the common case in the rules). **Righteous Fury** (a damage die showing 10, or Vengeful X) is flagged on its hit and its **1d5 is rolled inline as the index into the Critical Effect table — NOT added as bonus damage** (RF is a separate critical effect; until the crit tables exist (P1) the GM consults the rules manually). An **Apply Damage** button runs the soak pipeline (`Armour − Pen`, then `TB`, overflow → Critical) against the **targeted token**; with **no target there is no button** and players/GM adjust wounds by hand.

**Evade (from the attack card).** Prompts a **Reaction** — **Parry** (WS) or **Dodge** (Agility / Dodge skill) — plus a Modifier, and posts a **standard test card** like any other roll. Using its DoS to actually negate extra hits is later reaction automation (P3); for now the GM reads the result.

## 12. Mockup References

Validated wireframes are committed under `docs/superpowers/specs/mockups/`:

- `stats-investigation.html` — Stats/Investigation view, characteristic row, skills + hide-untrained.
- `combat-subtab-v2.html` — Stats/Combat view, armour row, two-tier attacks, wounds, lasting injuries, favourites, movement/init.
- `gear-tab.html` — consolidated Gear tab (Weapons · Protection · Gear) with equipped boxes & craftsmanship badges.
- `afflictions-tab.html` — Afflictions tab (Corruption/Insanity tracks + lists).
- `advancement-tab.html` — Advancement tab (Aptitudes + XP ledger + Simple/Custom mode toggles and their in-place affordances).
- `roll-dialogs.html` — characteristic / skill / attack dialogs and their chat cards (attack = to-hit only, with Roll-damage & Evade buttons).
- `damage-evade.html` — damage popup (regex modifier) + damage card (one popup per burst, modifier on first hit, RF as a separate crit-effect index, Apply-Damage on token), and the Evade reaction card.
- `specialist-skills.html` — specialist skill as a parent with on-the-fly specializations (add only in advancement modes, new ones start at Known); per-specialization advancement.

## 13. Open Design Items (to detail during implementation)

Intentionally small; each is designed when its build phase is reached, not blocking the plan:

- **Item edit sheets** — the per-type editing UI and editable fields for each item: weapon, armour, force field, gear, psychic power, cybernetic, mutation / malignancy / mental disorder, critical / lasting injury, aptitude. **Talents and traits are ordinary items** and need their own simple edit sheets too. (Data fields are fixed in §4; this is the editing layout.)
- **Fate-point spending mechanism** — the exact options the clickable Fate widget offers and how each wires up: **+10 & reroll**, **reroll**, extra **half-action**, **reduce damage** (from the damage card), recover from stun, and **burn** to survive (permanent −1 max); plus per-session refresh to max.
- **NPC sheet specifics** — the NPC actor's simpler stat presentation, threat level / faction fields, and the limited/observer view.
- **Craftsmanship effects** (Poor / Normal / Good / Best) — the mechanical modifiers per item category.
- **Fatigue wiring** — (a) quick **+ / −** buttons beside the Fatigue bar that nudge *current* fatigue by 1 (happens often in play; must NOT require advancement mode); (b) **default max = Toughness Bonus**, overridable in Custom advancement (traits/talents may change it — rare) — *resolve here whether the bar max is TB (design intent) or TB+WB (RAW / current Plan-1 code)*; (c) the **fatigue-affects-characteristics** mechanism (a characteristic whose bonus < current fatigue is halved) — mechanism exists, to be detailed when wired.
- Already noted inline and excluded from this version: fast-attack save-template behavior (§9), reaction hit-negation (§8, P3).
