// test/theme-data.test.mjs
import { describe, it, expect } from "vitest";
import { THEMES, themeChoices, themeBodyClasses, bodyClassesFor, CHROME_CLASS, ALL_THEME_CLASSES } from "../scripts/helpers/theme-data.mjs";

describe("theme registry", () => {
  it("has exactly the four known themes, classic first", () => {
    expect(Object.keys(THEMES)).toEqual(["classic", "dataslate", "dossier", "heretic"]);
  });

  it("classic applies no body classes (existing CSS untouched)", () => {
    expect(themeBodyClasses("classic")).toEqual([]);
  });

  it("the modern themes apply the shared marker, their own class, and their polarity", () => {
    expect(themeBodyClasses("dataslate")).toEqual(["bdh-themed", "bdh-theme-dataslate", "bdh-polarity-dark"]);
    expect(themeBodyClasses("dossier")).toEqual(["bdh-themed", "bdh-theme-dossier", "bdh-polarity-light"]);
    expect(themeBodyClasses("heretic")).toEqual(["bdh-themed", "bdh-theme-heretic", "bdh-polarity-dark"]);
  });

  it("every modern theme declares a polarity; classic declares none", () => {
    expect(THEMES.classic.polarity).toBe(null);
    expect(THEMES.dataslate.polarity).toBe("dark");
    expect(THEMES.dossier.polarity).toBe("light");
    expect(THEMES.heretic.polarity).toBe("dark");
  });

  it("unknown / missing values fall back to classic (no classes)", () => {
    expect(themeBodyClasses("neon")).toEqual([]);
    expect(themeBodyClasses(undefined)).toEqual([]);
  });

  it("themeChoices maps id → label for the settings dropdown", () => {
    expect(themeChoices()).toEqual({
      classic: "Parchment",
      dataslate: "For The Machine God",
      dossier: "Agents Of The Throne",
      heretic: "Your Emperor Is False"
    });
  });

  it("exports the chrome class as a named constant", () => {
    expect(CHROME_CLASS).toBe("bdh-chrome");
  });

  it("ALL_THEME_CLASSES lists every class any theme can apply, chrome included", () => {
    expect(ALL_THEME_CLASSES.slice().sort()).toEqual([
      "bdh-chrome",
      "bdh-polarity-dark",
      "bdh-polarity-light",
      "bdh-theme-dataslate",
      "bdh-theme-dossier",
      "bdh-theme-heretic",
      "bdh-themed"
    ]);
  });
});

describe("bodyClassesFor", () => {
  it("adds the chrome class to a modern theme when chrome is enabled", () => {
    expect(bodyClassesFor("heretic", true))
      .toEqual(["bdh-themed", "bdh-theme-heretic", "bdh-polarity-dark", "bdh-chrome"]);
  });

  it("omits the chrome class when chrome is disabled", () => {
    expect(bodyClassesFor("heretic", false))
      .toEqual(["bdh-themed", "bdh-theme-heretic", "bdh-polarity-dark"]);
  });

  it("keeps classic inert even with chrome enabled (core must stay untouched)", () => {
    expect(bodyClassesFor("classic", true)).toEqual([]);
  });

  it("keeps unknown themes inert even with chrome enabled", () => {
    expect(bodyClassesFor("neon", true)).toEqual([]);
    expect(bodyClassesFor(undefined, true)).toEqual([]);
  });

  it("treats a missing chrome argument as disabled", () => {
    expect(bodyClassesFor("dossier"))
      .toEqual(["bdh-themed", "bdh-theme-dossier", "bdh-polarity-light"]);
  });
});
