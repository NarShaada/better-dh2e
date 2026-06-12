// test/theme-data.test.mjs
import { describe, it, expect } from "vitest";
import { THEMES, themeChoices, themeBodyClasses, ALL_THEME_CLASSES } from "../scripts/helpers/theme-data.mjs";

describe("theme registry", () => {
  it("has exactly the three known themes, classic first", () => {
    expect(Object.keys(THEMES)).toEqual(["classic", "dataslate", "dossier"]);
  });

  it("classic applies no body classes (existing CSS untouched)", () => {
    expect(themeBodyClasses("classic")).toEqual([]);
  });

  it("dataslate and dossier apply the shared marker plus their own class", () => {
    expect(themeBodyClasses("dataslate")).toEqual(["bdh-themed", "bdh-theme-dataslate"]);
    expect(themeBodyClasses("dossier")).toEqual(["bdh-themed", "bdh-theme-dossier"]);
  });

  it("unknown / missing values fall back to classic (no classes)", () => {
    expect(themeBodyClasses("neon")).toEqual([]);
    expect(themeBodyClasses(undefined)).toEqual([]);
  });

  it("themeChoices maps id → label for the settings dropdown", () => {
    expect(themeChoices()).toEqual({
      classic: "Classic (parchment)",
      dataslate: "Dataslate (dark gothic-tech)",
      dossier: "Dossier (refined light)"
    });
  });

  it("ALL_THEME_CLASSES lists every class any theme can apply (for removal on switch)", () => {
    expect(ALL_THEME_CLASSES.sort()).toEqual(["bdh-theme-dataslate", "bdh-theme-dossier", "bdh-themed"]);
  });
});
