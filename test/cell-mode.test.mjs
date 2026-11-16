// test/cell-mode.test.mjs
//
// Cell mode takes over canvas input for the cover tools (paint, erase, degrade). It had no tests.
// Two defects from the 2026-11 audit:
//   - Door icons stayed live. They sit in canvas.controls.doors and handle their own clicks, so a
//     left-click on one while painting opened or closed the door for every player (and painted
//     nothing); a right-click erased the cell AND toggled the door's lock. Map notes are the same.
//   - "Esc to stop" also ran Foundry's own Escape handling: the bubble-phase listener ended the
//     tool but did not stop the event, so the same keypress closed every open window, or released
//     the selection, or opened the main menu.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { beginCellMode, endCellMode } from "../scripts/canvas/cell-mode.mjs";

/** A canvas with the pieces cell mode touches, and a `window` that records key listeners. */
function installCanvas() {
  const keyListeners = [];
  globalThis.window = {
    addEventListener: (type, cb, capture) => { if (type === "keydown") keyListeners.push({ cb, capture }); },
    removeEventListener: (type, cb) => {
      const i = keyListeners.findIndex((l) => l.cb === cb);
      if (type === "keydown" && i >= 0) keyListeners.splice(i, 1);
    },
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.canvas = {
    ready: true,
    grid: { getOffset: (p) => ({ i: Math.floor(p.y / 100), j: Math.floor(p.x / 100) }) },
    stage: { eventMode: "passive", on() {}, off() {} },
    app: { view: { addEventListener() {}, removeEventListener() {} } },
    mouseInteractionManager: { permissions: {} },
    tokens: { interactiveChildren: true },
    regions: { interactiveChildren: true },
    controls: { doors: { interactiveChildren: true } },
    notes: { interactiveChildren: true },
  };
  return { keyListeners };
}

/** A keydown as the browser delivers it, recording what the handler did to it. */
const keydown = (key) => ({
  key, defaultPrevented: false, stopped: false,
  preventDefault() { this.defaultPrevented = true; },
  stopPropagation() { this.stopped = true; },
  stopImmediatePropagation() { this.stopped = true; },
});

let env;
beforeEach(() => { env = installCanvas(); });
afterEach(() => { endCellMode(); });

const begin = () => beginCellMode({ notice: "Painting", onCell: () => {}, owner: "test" });

describe("what cell mode silences on the canvas", () => {
  it("door controls and map notes, as well as tokens and regions", () => {
    begin();
    expect(canvas.controls.doors.interactiveChildren).toBe(false);
    expect(canvas.notes.interactiveChildren).toBe(false);
    expect(canvas.tokens.interactiveChildren).toBe(false);
    expect(canvas.regions.interactiveChildren).toBe(false);
  });

  it("gives each one back exactly as it found it", () => {
    canvas.notes.interactiveChildren = false;          // the GM had map notes switched off
    begin();
    endCellMode();
    expect(canvas.controls.doors.interactiveChildren).toBe(true);
    expect(canvas.tokens.interactiveChildren).toBe(true);
    expect(canvas.regions.interactiveChildren).toBe(true);
    expect(canvas.notes.interactiveChildren).toBe(false);
  });

  // The GM can switch scene-control layer while the mode is on; Foundry then turns that layer's
  // interactivity ON. Writing the old "off" snapshot back over it would leave the layer the GM is
  // now working on dead to clicks until they left it and came back.
  it("does not switch off a layer that became the active one while the mode was running", () => {
    canvas.notes.interactiveChildren = false;          // map notes hidden when the mode began
    begin();
    canvas.notes.active = true;                        // the GM clicks the Journal Notes control …
    canvas.notes.interactiveChildren = true;           // … and core makes the layer interactive
    endCellMode();
    expect(canvas.notes.interactiveChildren).toBe(true);
  });

  it("copes with a canvas that has no door or note layer", () => {
    delete canvas.controls;
    delete canvas.notes;
    expect(() => { begin(); endCellMode(); }).not.toThrow();
  });
});

describe("Escape while a cell mode is active", () => {
  it("ends the mode and keeps the keypress from Foundry's own Escape handling", () => {
    begin();
    const { cb, capture } = env.keyListeners[0];
    const event = keydown("Escape");

    cb(event);

    // Capture phase + stopped: Foundry's keyboard manager listens on `window` in the bubble phase,
    // so it never sees this keypress.
    expect(capture).toBe(true);
    expect(event.stopped).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(canvas.tokens.interactiveChildren).toBe(true);   // the mode really ended
    expect(env.keyListeners).toEqual([]);
  });

  it("leaves every other key alone", () => {
    begin();
    const event = keydown("a");

    env.keyListeners[0].cb(event);

    expect(event.stopped).toBe(false);
    expect(canvas.tokens.interactiveChildren).toBe(false);  // still painting
  });
});
