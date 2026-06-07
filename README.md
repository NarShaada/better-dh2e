# Better Dark Heresy 2E

A fresh, **Foundry VTT v13/v14** unofficial game system for **Dark Heresy 2nd Edition** — reimplemented from scratch for modern Foundry, with a cleaner character sheet and combat / advancement / psychic automation. **Ships content-free** (no rulebook text or stat blocks).

> ⚠️ **Alpha.** Core systems are complete and in use, but expect rough edges and breaking changes before 1.0.

## Install

In Foundry → **Game Systems → Install System**, paste the manifest URL:

```
https://github.com/NarShaada/better-dh2e/releases/latest/download/system.json
```

## What's in alpha

- **Character sheet** — Stats / Investigation / Combat, Abilities, Gear, Afflictions, Psychic, Notes, Advancement; acolyte + NPC actors.
- **Characters** — 10 characteristics (base/advance/unnatural), the full 28-skill list with specialist specialties, favourites, wounds / fatigue / fate, corruption & insanity tracks, armour Agility cap + fatigue characteristic-halving (shown in red), and **carry / lift / push** encumbrance limits.
- **Advancement** — Custom (free edit) and Simple (buy with XP: cost tables + aptitudes) modes, with a refundable purchase log; NPCs are Custom-only.
- **Combat** — full attack pipeline: to-hit (aim / attack type / range) → reversed-digit hit locations → multi-hit bursts → damage (transparent breakdown, Righteous Fury, degrees-of-success die substitution) → soak / apply to target → Parry/Dodge evade; weapon **qualities** (registry-driven, marked ⚙ when automated), **craftsmanship**, **ammo** (consume / reload), and **combat-tracker initiative**.
- **Psychic** — psyker class & Psy Rating advancement; psychic power items (discipline / resolution type / focus test / attack profile + qualities); a one-click **Cast** that handles effective-PR (Fetter / Push), the Focus Power test, **Psychic Phenomena → Perils of the Warp** (per psyker class), opposed resists, and attack powers routed through the combat pipeline.

## Release notes

### v0.1.5 — Psychic powers

The psychic subsystem lands, alongside the encumbrance rules and the fixes/errata surfaced by playtesting.

**Psychic powers (new):**
- **Psyker class** (Bound / Unbound / Daemonic) and **Psy Rating** advancement — buy ranks in Simple mode (200 × new level, refundable); editable freely in Custom.
- **Psychic power items** — discipline, resolution **type** (Effect / Psychic Bolt / Barrage / Storm / Blast), Focus Power test against any **characteristic *or* skill**, opposed tests, attack profile (damage / penetration / type / blast radius) with **weapon qualities**, plus range / duration / sustained / action / XP cost.
- **Manifest engine** — one **Cast** button runs the whole flow: pick the effective Psy Rating (**Fetter** for an easier test and weaker effect, **Push** for a harder test and stronger effect, within your class's push limit), roll the **Focus Power test** (with all modifiers + a circumstance box), and resolve **Psychic Phenomena → Perils of the Warp** — with Bound / Unbound / Daemonic each triggering and scaling the rolls differently. Effect powers print a result card (with an **opposed Resist** button when applicable); attack powers (Bolt / Barrage / Storm / Blast) feed the existing **combat pipeline** (Evade / Roll Damage / Apply), with hits scaling by type and damage/penetration scaling off the effective PR (PR-aware formulas like `1d10+2+2*PR`).

**Improvements & fixes (from playtesting):**
- **Encumbrance** — Carry / Lift / Push limits on the Gear tab (DH2e Table 7-26, from Strength + Toughness bonus); carried weight turns red when over the carry limit.
- **Apply Damage** chat button now respects **target ownership** — the GM always sees it, a player only when their own character is the target, nobody else.
- **Called-Shot Location** appears in the attack dialog only when the Called Shot attack type is selected.
- **Combat** tab hides the Favourite Talents / Traits sections when the character has none.
- **Aptitude editor** (characters + talents) reworked to chips + a dropdown/Add control (character aptitudes editable in Custom mode only).
- **Errata** — Common Lore aptitudes corrected to **Intelligence + General**.

### Earlier

- **v0.1.4** — psyker advancement + psychic power data model foundation.
- **v0.1.3** — melee damage adds the Strength Bonus; Charge is +20.
- **v0.1.2** — Foundry **v14** support.
- **v0.1.1** — full weapon-quality set.
- **v0.1.0** — alpha (sheet, characters, advancement, core combat).

## Development

- Pure rules logic is unit-tested with Vitest (`npm test`); Foundry-coupled code is verified in-browser.
- Build the install zip: `tools/package.sh`.

## License

[GPL-3.0](LICENSE). This is an independent, unofficial system; *Dark Heresy* and *Warhammer 40,000* are trademarks of their respective owners. No official content is included.
