// scripts/helpers/theme-data.mjs
// UI theme registry. Pure data — no Foundry globals — so it stays unit-testable.
// "classic" deliberately maps to zero classes: the live styles/better-dh2e.css
// is the classic theme and must keep working with no body class present.

// Labels are in-fiction; the ids stay descriptive (and are what the CSS classes derive from).
// `polarity` selects which chrome recipe styles/bdh-chrome.css applies. It is a data field
// rather than a CSS selector list so a future theme gets correct chrome by declaring it.
export const THEMES = {
  classic:   { label: "Parchment",             polarity: null,    bodyClasses: [] },
  dataslate: { label: "For The Machine God",   polarity: "dark",  bodyClasses: ["bdh-themed", "bdh-theme-dataslate"] },
  dossier:   { label: "Agents Of The Throne",  polarity: "light", bodyClasses: ["bdh-themed", "bdh-theme-dossier"] },
  heretic:   { label: "Your Emperor Is False", polarity: "dark",  bodyClasses: ["bdh-themed", "bdh-theme-heretic"] }
};

/** Body class that extends the active theme to Foundry's own interface. */
export const CHROME_CLASS = "bdh-chrome";

const POLARITY_CLASS = { dark: "bdh-polarity-dark", light: "bdh-polarity-light" };

/** id → label map in the shape `game.settings.register` expects for `choices`. */
export function themeChoices() {
  return Object.fromEntries(Object.entries(THEMES).map(([id, t]) => [id, t.label]));
}

/** Body classes for a setting value; unknown values behave as classic. */
export function themeBodyClasses(value) {
  const theme = THEMES[value];
  if (!theme?.bodyClasses.length) return [];
  const polarity = POLARITY_CLASS[theme.polarity];
  return polarity ? [...theme.bodyClasses, polarity] : [...theme.bodyClasses];
}

/**
 * Body classes for a theme id plus the chrome opt-in.
 * Classic (and any unknown value) stays inert: it means "core untouched", so the
 * chrome switch must not add anything for it.
 */
export function bodyClassesFor(themeId, chromeEnabled = false) {
  const classes = themeBodyClasses(themeId);
  if (!classes.length) return [];
  return chromeEnabled ? [...classes, CHROME_CLASS] : classes;
}

/** Every class this module can apply — remove these before applying the new set. */
export const ALL_THEME_CLASSES = [...new Set([
  ...Object.keys(THEMES).flatMap((id) => themeBodyClasses(id)),
  CHROME_CLASS
])];
