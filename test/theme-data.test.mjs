// test/theme-data.test.mjs
import { describe, it, expect } from "vitest";
import { THEMES, themeChoices, themeBodyClasses, ALL_THEME_CLASSES } from "../scripts/helpers/theme-data.mjs";

describe("theme registry", () => {
  it("has exactly the four known themes, classic first", () => {
    expect(Object.keys(THEMES)).toEqual(["classic", "dataslate", "dossier", "heretic"]);
  });

  it("classic applies no body classes (existing CSS untouched)", () => {
    expect(themeBodyClasses("classic")).toEqual([]);
  });

  it("the modern themes apply the shared marker plus their own class", () => {
    expect(themeBodyClasses("dataslate")).toEqual(["bdh-themed", "bdh-theme-dataslate"]);
    expect(themeBodyClasses("dossier")).toEqual(["bdh-themed", "bdh-theme-dossier"]);
    expect(themeBodyClasses("heretic")).toEqual(["bdh-themed", "bdh-theme-heretic"]);
  });

  it("unknown / missing values fall back to classic (no classes)", () => {
    expect(themeBodyClasses("neon")).toEqual([]);
    expect(themeBodyClasses(undefined)).toEqual([]);
  });

  it("themeChoices maps id → label for the settings dropdown", () => {
    expect(themeChoices()).toEqual({
      classic: "Classic (parchment)",
      dataslate: "Dataslate (dark gothic-tech)",
      dossier: "Dossier (refined light)",
      heretic: "Heretic (defaced dataslate)"
    });
  });

  it("ALL_THEME_CLASSES lists every class any theme can apply (for removal on switch)", () => {
    expect(ALL_THEME_CLASSES.sort()).toEqual([
      "bdh-theme-dataslate", "bdh-theme-dossier", "bdh-theme-heretic", "bdh-themed"
    ]);
  });
});
