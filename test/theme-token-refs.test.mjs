// test/theme-token-refs.test.mjs
// bdh-chrome.css consumes the --t-* palette tokens defined in bdh-themes.css. A typo
// there resolves to nothing and silently paints an unstyled surface, so assert every
// referenced token is really defined — by the shared block or by all three palettes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (name) => readFileSync(fileURLToPath(new URL(`../styles/${name}`, import.meta.url)), "utf8");
const themesCss = read("bdh-themes.css");
const chromeCss = read("bdh-chrome.css");

/** The declaration block belonging to the first rule whose selector contains `needle`. */
function blockFor(css, needle) {
  const at = css.indexOf(needle);
  if (at === -1) return "";
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

const tokensIn = (block) => new Set([...block.matchAll(/(--t-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

const shared = tokensIn(blockFor(themesCss, "body.bdh-themed {"));
const palettes = {
  dataslate: tokensIn(blockFor(themesCss, "body.bdh-theme-dataslate")),
  dossier: tokensIn(blockFor(themesCss, "body.bdh-theme-dossier")),
  heretic: tokensIn(blockFor(themesCss, "body.bdh-theme-heretic"))
};

const referencedIn = (css) => [...new Set([...css.matchAll(/var\((--t-[a-z0-9-]+)/g)].map((m) => m[1]))];
const missingIn = (css) => referencedIn(css).filter((token) =>
  !shared.has(token) && !Object.values(palettes).every((set) => set.has(token)));

const referenced = referencedIn(chromeCss);

describe("bdh-chrome.css palette token references", () => {
  it("finds the palettes and the references", () => {
    expect(shared.size).toBeGreaterThan(0);
    for (const [name, set] of Object.entries(palettes)) expect(set.size, name).toBeGreaterThan(10);
    expect(referenced.length).toBeGreaterThan(10);
  });

  it("every referenced token is defined by the shared block or by all three palettes", () => {
    expect(missingIn(chromeCss)).toEqual([]);
  });

  it("catches a token no palette defines", () => {
    const leaked = chromeCss + "\nbody.bdh-chrome { color: var(--t-panel4); }\n";
    expect(missingIn(leaked)).toEqual(["--t-panel4"]);
  });
});
