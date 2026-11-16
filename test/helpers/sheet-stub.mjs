// test/helpers/sheet-stub.mjs
// Just enough ApplicationV2 for a sheet class to be IMPORTED and its handlers DRIVEN under vitest's
// node environment (no jsdom, no Foundry). Builds on foundry-stub.mjs — install this instead of
// installFoundryStub() and then dynamically import the sheet module, for the same reason the roll
// tests do: the sheets destructure `foundry.applications.*` at module scope.
//
// What is modelled, and why each piece is faithful rather than convenient:
// - makeInput().fire() nulls `event.currentTarget` once dispatch finishes, as the DOM does. A handler
//   that reads it after an await gets null here too, instead of passing in tests and breaking live.
// - slowUpdate() applies a document update only AFTER a delay. Foundry changes local document data
//   when the server's response arrives, not when update() is called; the default fixtures apply the
//   change synchronously, which hides every stale-read bug.
// - DialogV2.prompt() (opt-in via { faithfulDialogs: true }) runs the caller's `ok.callback` and
//   turns a nullish result into the button's action string, exactly as DialogV2#_onSubmit does
//   (client/applications/api/dialog.mjs: `(await button.callback(...)) ?? button.action`).
import { installFoundryStub, applyDotUpdate } from "./foundry-stub.mjs";

let _submits = [];
let _warnings = [];

/** Queue what the user "typed" into the next DialogV2.prompt: a form-data object, or `null` for a
 *  dialog that is dismissed without pressing the button. Consumed FIFO. */
export function primeDialogSubmit(...forms) {
  _submits.push(...forms);
}

/** Every ui.notifications.warn message since the last resetSheetCaptures(). */
export function capturedWarnings() {
  return [..._warnings];
}

export function resetSheetCaptures() {
  _submits = [];
  _warnings = [];
}

class FaithfulDialogV2 {
  static async prompt(config) {
    if (!_submits.length) throw new Error("sheet-stub: DialogV2.prompt called with nothing primed — use primeDialogSubmit()");
    const form = _submits.shift();
    if (form === null) return null;                          // dismissed; rejectClose: false → null
    const result = await config.ok?.callback?.({}, { form }, {});
    return result ?? "ok";                                   // nullish callback result → the button's action
  }
  static async wait(config) { return FaithfulDialogV2.prompt(config); }
  static async confirm() { return true; }
}

/** The members of DocumentSheetV2 / ActorSheetV2 / ItemSheetV2 the system's sheets call or override. */
class FakeDocumentSheet {
  static DEFAULT_OPTIONS = {};
  constructor({ document } = {}) {
    this.document = document;
    this.element = makeSheetElement();
    /** Items that reached the BASE class's drop handling, i.e. would have been embedded by core. */
    this.baseItemDrops = [];
  }
  get actor() { return this.document; }
  get item() { return this.document; }
  get isEditable() { return true; }
  async _prepareContext() { return {}; }
  _prepareTabs() { return {}; }
  async _onRender() {}
  _onFirstRender() {}
  async _onDropItem(_event, item) { this.baseItemDrops.push(item); return item; }
  render() {}
}

export function installSheetStub(options = {}) {
  const env = installFoundryStub(options);
  resetSheetCaptures();
  ui.notifications.warn = (m) => { _warnings.push(String(m)); };
  foundry.applications.api.HandlebarsApplicationMixin = (Base) => Base;
  foundry.applications.sheets = { ActorSheetV2: FakeDocumentSheet, ItemSheetV2: FakeDocumentSheet };
  if (options.faithfulDialogs) foundry.applications.api.DialogV2 = FaithfulDialogV2;
  // Drag payloads ride on the fake event itself (see makeInput().fire's `extra`).
  foundry.applications.ux.TextEditor = { implementation: { getDragEventData: (event) => event.dragData ?? null } };
  return env;
}

/** A form control / row element stand-in. `closest` maps a selector to the ancestor it resolves to. */
export function makeInput({ value = "", dataset = {}, closest = {} } = {}) {
  return {
    value, dataset, _listeners: {},
    addEventListener(evt, cb) { (this._listeners[evt] ??= []).push(cb); },
    closest(sel) { return closest[sel] ?? null; },
    select() {},
    /** Dispatch `evt` the way the DOM does. Returns the event (inspect it synchronously for
     *  preventDefault/stopPropagation) and `done`, which settles when every listener has. */
    fire(evt, extra = {}) {
      const event = {
        currentTarget: this, target: this,
        defaultPrevented: false, propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...extra,
      };
      const pending = (this._listeners[evt] ?? []).map((cb) => cb(event));
      event.currentTarget = null;   // as in the DOM: only valid while the event is being dispatched
      return { event, done: Promise.allSettled(pending) };
    },
  };
}

/** The sheet's root element: `map` is { "<exact selector>": [elements] }; anything else is empty. */
export function makeSheetElement(map = {}) {
  return {
    querySelectorAll: (sel) => map[sel] ?? [],
    querySelector: (sel) => (map[sel] ?? [])[0] ?? null,
    addEventListener() {},
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An `update` that lands the change only after a round trip, and records every payload it was sent. */
export function slowUpdate(doc, { ms = 5, sent = [] } = {}) {
  const update = async (changes) => {
    sent.push(changes);
    await sleep(ms);
    applyDotUpdate(doc, changes);
    return doc;
  };
  update.sent = sent;
  return update;
}

export { sleep };
