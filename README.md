# Better Dark Heresy 2E

A fresh, **Foundry VTT v13-native** unofficial game system for **Dark Heresy 2nd Edition** — reimplemented from scratch for modern Foundry, with a cleaner character sheet and combat/advancement automation. **Ships content-free** (no rulebook text or stat blocks).

> ⚠️ **Alpha.** Core systems are complete and in use, but expect rough edges and breaking changes before 1.0.

## Install

In Foundry → **Game Systems → Install System**, paste the manifest URL:

```
https://github.com/NarShaada/better-dh2e/releases/latest/download/system.json
```

## What's in alpha

- **Character sheet** — Stats / Investigation / Combat, Abilities, Gear, Afflictions, Psychic, Notes, Advancement; acolyte + NPC actors.
- **Characters** — 10 characteristics (base/advance/unnatural), the full 28-skill list with specialist specialties, favourites, wounds / fatigue / fate, corruption & insanity tracks, armour Agility cap + fatigue characteristic-halving (shown in red).
- **Advancement** — Custom (free edit) and Simple (buy with XP: cost tables + aptitudes) modes, with a refundable purchase log; NPCs are Custom-only.
- **Combat** — full attack pipeline: to-hit (aim / attack type / range) → reversed-digit hit locations → multi-hit bursts → damage (transparent breakdown, Righteous Fury, degrees-of-success die substitution) → soak / apply to target → Parry/Dodge evade; weapon **qualities** (registry-driven, marked ⚙ when automated), **craftsmanship**, **ammo** (consume / reload), and **combat-tracker initiative**.

## Development

- Pure rules logic is unit-tested with Vitest (`npm test`); Foundry-coupled code is verified in-browser.
- Build the install zip: `tools/package.sh`.

## License

[GPL-3.0](LICENSE). This is an independent, unofficial system; *Dark Heresy* and *Warhammer 40,000* are trademarks of their respective owners. No official content is included.
