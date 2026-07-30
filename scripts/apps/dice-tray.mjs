// scripts/apps/dice-tray.mjs
// A compact d100/d10/d5 tray injected under core's chat form, for quick rolls the system does
// not automate (a disposition roll, an improvised d5). Rolls post as ordinary Foundry roll
// messages so Dice So Nice still animates them and core's roll-mode selector still governs them.
import { trayFormula, parseModifier } from "../rolls/dice-tray-logic.mjs";
import { safeRoll } from "../rolls/dice.mjs";

const TEMPLATE = "systems/better-dh2e/templates/apps/dice-tray.hbs";
const TRAY_SELECTOR = "[data-bdh-dice-tray]";

/** The dice the system actually uses. d5 is a native Foundry formula and already the convention here. */
export const DICE = [100, 10, 5];

/** Counts offered by the hold gesture. Anything larger is better typed as /r. */
export const COUNTS = [2, 3, 4, 5];

/** How long a press must last to count as a hold rather than a click. */
const HOLD_MS = 350;

/** Whether this client wants the tray. */
function enabled() {
  return game.settings.get("better-dh2e", "diceTray") === true;
}

/**
 * Roll `count` dice of `faces`, applying the tray's current modifier.
 * @param {HTMLElement} tray
 * @param {number} faces
 * @param {number} count
 */
export async function rollFromTray(tray, faces, count) {
  const raw = tray.querySelector('[data-bdh="mod"]')?.value ?? "";
  const formula = trayFormula(faces, count, parseModifier(raw));
  const roll = await safeRoll(formula, "dice tray");
  if (!roll) return;                       // safeRoll already notified the user
  await roll.toMessage(
    { speaker: ChatMessage.getSpeaker() },
    { rollMode: game.settings.get("core", "rollMode") }
  );
}

/** Remove any open count picker, and the document listeners that dismiss it. */
function closeCountPicker(tray) {
  tray.querySelectorAll("[data-bdh-count-picker]").forEach((el) => el.remove());
  if (tray._bdhDismiss) document.removeEventListener("pointerdown", tray._bdhDismiss, true);
  if (tray._bdhKeydown) document.removeEventListener("keydown", tray._bdhKeydown, true);
  tray._bdhDismiss = null;
  tray._bdhKeydown = null;
}

/** Open the count picker above a die button. Choosing a count rolls that many immediately. */
function openCountPicker(tray, button, faces) {
  closeCountPicker(tray);
  const picker = document.createElement("div");
  picker.className = "bdh-count-picker";
  picker.setAttribute("data-bdh-count-picker", "");
  picker.style.left = `${button.offsetLeft}px`;
  picker.innerHTML = COUNTS
    .map((n) => `<button type="button" class="bdh-count" data-count="${n}" aria-label="Roll ${n}d${faces}">${n}</button>`)
    .join("");
  tray.appendChild(picker);

  picker.querySelectorAll(".bdh-count").forEach((choice) => {
    choice.addEventListener("click", (event) => {
      event.stopPropagation();
      const count = Number(choice.dataset.count);
      closeCountPicker(tray);
      rollFromTray(tray, faces, count);
    });
  });

  // Dismiss on any pointer press outside the picker, or on Escape. Captured, so a press on
  // another die closes this picker before that die's own handler runs.
  tray._bdhDismiss = (event) => { if (!picker.contains(event.target)) closeCountPicker(tray); };
  tray._bdhKeydown = (event) => { if (event.key === "Escape") closeCountPicker(tray); };
  document.addEventListener("pointerdown", tray._bdhDismiss, true);
  document.addEventListener("keydown", tray._bdhKeydown, true);
}

/**
 * Wire a die button: a click rolls one, a press held for HOLD_MS opens the count picker.
 * Right-click is deliberately not used — core has context menus in this sidebar.
 */
function bindDie(tray, button) {
  const faces = Number(button.dataset.faces);
  let timer = null;
  let held = false;

  const cancel = () => { if (timer) clearTimeout(timer); timer = null; };

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    held = false;
    cancel();
    timer = setTimeout(() => { held = true; openCountPicker(tray, button, faces); }, HOLD_MS);
  });
  button.addEventListener("pointerup", cancel);
  button.addEventListener("pointerleave", () => { cancel(); });
  button.addEventListener("click", () => {
    if (held) { held = false; return; }   // the hold already opened the picker
    rollFromTray(tray, faces, 1);
  });
  // A long press on touch and some desktop setups raises the OS context menu mid-hold.
  button.addEventListener("contextmenu", (event) => event.preventDefault());
}

/**
 * Insert the tray under the chat form. Idempotent: renderChatLog fires on part re-renders too,
 * so any existing tray is removed first rather than accumulating duplicates.
 * @param {HTMLElement} element  the ChatLog application's root node
 */
export async function injectDiceTray(element) {
  if (!element) return;
  element.querySelectorAll(TRAY_SELECTOR).forEach((el) => el.remove());
  if (!enabled()) return;
  const form = element.querySelector("form.chat-form");
  if (!form) return;                       // chat not rendered in the shape we expect; leave it alone
  const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, { dice: DICE });
  form.insertAdjacentHTML("afterend", html);
  const tray = element.querySelector(TRAY_SELECTOR);
  if (!tray) return;
  tray.querySelectorAll(".bdh-die").forEach((button) => bindDie(tray, button));
}

/** Install the chat hook. Also injects into an already-rendered chat log, since we register at ready. */
export function registerDiceTray() {
  Hooks.on("renderChatLog", (app, element) => injectDiceTray(element));
  if (ui.chat?.element) injectDiceTray(ui.chat.element);
}
