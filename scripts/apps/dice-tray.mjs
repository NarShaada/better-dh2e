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

/** Wire a single die button. Task 3 extends this with the hold gesture. */
function bindDie(tray, button) {
  const faces = Number(button.dataset.faces);
  button.addEventListener("click", () => rollFromTray(tray, faces, 1));
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
