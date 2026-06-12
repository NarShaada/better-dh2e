// scripts/helpers/theme-data.mjs
// UI theme registry. Pure data — no Foundry globals — so it stays unit-testable.
// "classic" deliberately maps to zero classes: the live styles/better-dh2e.css
// is the classic theme and must keep working with no body class present.

export const THEMES = {
  classic:   { label: "Classic (parchment)",          bodyClasses: [] },
  dataslate: { label: "Dataslate (dark gothic-tech)", bodyClasses: ["bdh-themed", "bdh-theme-dataslate"] },
  dossier:   { label: "Dossier (refined light)",      bodyClasses: ["bdh-themed", "bdh-theme-dossier"] }
};

/** id → label map in the shape `game.settings.register` expects for `choices`. */
export function themeChoices() {
  return Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.label]));
}

/** Body classes for a setting value; unknown values behave as classic. */
export function themeBodyClasses(value) {
  return THEMES[value]?.bodyClasses ?? [];
}

/** Every class any theme can apply — remove these before applying the new set. */
export const ALL_THEME_CLASSES = [...new Set(Object.values(THEMES).flatMap((t) => t.bodyClasses))];
