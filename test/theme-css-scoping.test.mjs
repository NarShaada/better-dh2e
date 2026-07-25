// test/theme-css-scoping.test.mjs
// Guards the Plan 49 invariant: nothing in bdh-themes.css may apply without a
// theme body class, or it would repaint Classic (which has no body class at all).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../styles/bdh-themes.css", import.meta.url)), "utf8");

/** Every individual selector in a stylesheet, comments and at-rule blocks stripped. */
function selectors(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("}")
    .map((block) => block.split("{")[0].trim())
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
});
