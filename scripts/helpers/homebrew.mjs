// scripts/helpers/homebrew.mjs — reads the Homebrew Qualities world setting (gates non-core weapon qualities).

/** Whether the user has opted into homebrew weapon qualities. */
export function homebrewQualitiesEnabled() {
  return game.settings.get("better-dh2e", "homebrewQualities") === true;
}
