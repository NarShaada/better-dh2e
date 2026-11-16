// test/cover-controls-setting.test.mjs
//
// Toggling the "Cover mechanics" setting is meant to show or hide the cover scene-control buttons.
// It called `ui.controls.render()`, which re-renders the control set Foundry has CACHED: the
// `getSceneControlButtons` hook — where those buttons are added — only runs again when the render
// is asked to `reset`. So the buttons did not appear until a scene change or a reload, and stayed
// clickable after the setting was switched off.
//
// better-dh2e.mjs registers hooks at import time and cannot be loaded here, so this pins the call
// in its source text. Crude, but the alternative is no guard at all on a one-token regression.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("../scripts/better-dh2e.mjs", import.meta.url)), "utf8");

describe("the Cover mechanics setting", () => {
  it("rebuilds the scene controls, not just re-renders the cached set", () => {
    const start = source.indexOf('game.settings.register("better-dh2e", "coverMechanics"');
    const block = source.slice(start, source.indexOf("game.settings.register(", start + 10));

    expect(start).toBeGreaterThan(-1);
    expect(block).toMatch(/ui\.controls\?\.render\?\.\(\{\s*reset:\s*true\s*\}\)/);
  });
});
