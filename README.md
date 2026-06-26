# Better Dark Heresy 2E

A fresh, **Foundry VTT v13/v14** unofficial game system for **Dark Heresy 2nd Edition** — reimplemented from scratch for modern Foundry, with a cleaner character sheet and combat / advancement / psychic automation. **Ships content-free** (no rulebook text or stat blocks).

> 🧪 **Beta.** Core systems are complete and in active play; polishing toward 1.0 (still expect the occasional rough edge).

## Install

In Foundry → **Game Systems → Install System**, paste the manifest URL:

```
https://github.com/NarShaada/better-dh2e/releases/latest/download/system.json
```

## Features

- **Character sheet** — Stats / Investigation / Combat, Abilities, Gear, Afflictions, Psychic, Notes, Advancement; acolyte + NPC actors, with three UI themes (Classic / Dataslate / Dossier).
- **Characters** — 10 characteristics (base/advance/unnatural), the full 28-skill list with specialist specialties, favourites, wounds / fatigue / fate, corruption & insanity tracks, armour Agility cap + fatigue characteristic-halving, size, and **carry / lift / push** encumbrance limits.
- **XP-cost automation** — Custom (free edit) and Simple (buy with XP: cost tables + aptitudes) advancement modes, with a refundable purchase log; NPCs are Custom-only.
- **Combat & formula automation** — full attack pipeline: to-hit (aim / attack type / range) → reversed-digit hit locations → multi-hit bursts → damage (transparent breakdown, Righteous Fury, degrees-of-success die substitution) → soak / apply → Parry/Dodge evade; extensive **weapon-quality** automation (registry-driven), **craftsmanship**, **ammo** (consume / reload), and combat-tracker initiative.
- **Psychic** — psyker class & Psy Rating advancement; psychic power items; one-click **Cast** handling effective-PR (Fetter / Push), the Focus Power test, **Psychic Phenomena → Perils of the Warp** (per class), opposed resists, and attack powers routed through the combat pipeline.
- **Battlemap & conditions** (opt-in) — range-band measurement, movement-mode drag trail, and automated conditions (Stunned, Toxic, On Fire, Prone, Pinned, Run, Helpless, Unaware…) driven by weapon qualities and the combat tracker.
- **Cover system** — manual In-Cover + a GM **cover-template library**, click-to-place cover pieces (scene Regions), auto-marking of tokens in cover, and approach-side AP pre-fill at Apply Damage.
- **Area effects** — Blast (scatter + per-token soak), Spray (cone checklist), and Suppressing Fire, built as scene Regions.
- **Cybernetics & item modifiers** — situational / always-on skill & characteristic bonuses, derived-stat modifiers (movement / wounds / size / fatigue / carry), and **granted items**: cybernetics and armour can grant real, source-synced items (built-in weapons, comm-beads, cranial armour…).
- **Homebrew qualities** (opt-in) — a gated set of non-vanilla weapon qualities (e.g. Rad-Phage), separate from the core set.
- **Tools** — NPC token-name prefixes, and a migration script from classic *Dark Heresy* worlds.

## Roadmap to 1.0

1. **Ironing out bugs.**
2. **Adding small missing mechanics.**
3. **Vehicle framework.**
4. **Full (1.0) release.**

More **homebrew weapon qualities** will be added along the way (largely adapted from the *Only War* homebrew *Mars Needs Women*).

## License

[GPL-3.0](LICENSE). This is an independent, unofficial system; *Dark Heresy* and *Warhammer 40,000* are trademarks of their respective owners. No official content is included.
