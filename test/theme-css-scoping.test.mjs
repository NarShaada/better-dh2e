// test/theme-css-scoping.test.mjs
// Guards the Plan 49 invariant: nothing in bdh-themes.css may apply without a
// theme body class, or it would repaint Classic (which has no body class at all).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../styles/bdh-themes.css", import.meta.url)), "utf8");

/** Every individual selector in a stylesheet, comments and at-rule preludes stripped. */
function selectors(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .flatMap((block) => block.split("{").slice(0, -1))
    .map((sel) => sel.trim())
    .filter((sel) => sel && !sel.startsWith("@"))
    .flatMap((sel) => sel.split(",").map((s) => s.trim()))
    .filter(Boolean);
}

const isScoped = (sel) => sel.includes("bdh-themed") || sel.includes("bdh-theme-");

describe("bdh-themes.css scoping", () => {
  it("actually finds selectors to check", () => {
    expect(selectors(css).length).toBeGreaterThan(100);
  });

  it("every selector is scoped to a theme body class (Classic must never be touched)", () => {
    expect(selectors(css).filter((sel) => !isScoped(sel))).toEqual([]);
  });

  it("catches an unscoped selector", () => {
    const leaked = css + "\n.better-dh2e .bdh-header { background:red; }\n";
    expect(selectors(leaked).filter((sel) => !isScoped(sel))).toEqual([".better-dh2e .bdh-header"]);
  });

  it("catches an unscoped selector nested in an at-rule", () => {
    const leaked = css + "\n@media (prefers-reduced-motion: reduce) { .better-dh2e .bdh-header { animation:none; } }\n";
    expect(selectors(leaked).filter((sel) => !isScoped(sel))).toEqual([".better-dh2e .bdh-header"]);
  });
});

const chromeCss = readFileSync(fileURLToPath(new URL("../styles/bdh-chrome.css", import.meta.url)), "utf8");

// Stricter than the bdh-themes.css guard on purpose: this file targets CORE's own
// selectors (.ui-control, #hotbar, .application), so a selector missing the chrome
// class would repaint Foundry for every user — including Parchment users who opted out.
const isChromeScoped = (sel) => sel.includes("bdh-chrome");

describe("bdh-chrome.css scoping", () => {
  it("actually finds selectors to check", () => {
    expect(selectors(chromeCss).length).toBeGreaterThan(0);
  });

  it("every selector is scoped to the chrome body class", () => {
    expect(selectors(chromeCss).filter((sel) => !isChromeScoped(sel))).toEqual([]);
  });

  it("catches a leaked bare core selector", () => {
    const leaked = chromeCss + "\n.ui-control { background:red; }\n";
    expect(selectors(leaked).filter((sel) => !isChromeScoped(sel))).toEqual([".ui-control"]);
  });

  it("catches a core selector scoped only to a theme class, without the chrome opt-in", () => {
    const leaked = chromeCss + "\nbody.bdh-themed .ui-control { background:red; }\n";
    expect(selectors(leaked).filter((sel) => !isChromeScoped(sel))).toEqual(["body.bdh-themed .ui-control"]);
  });
});
