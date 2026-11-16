// scripts/canvas/run-status.mjs — keep the Run condition in sync with per-turn movement.
import { battlemapEnabled, classifyMovement, movedThisTurn } from "../helpers/battlemap-data.mjs";

/** `moveToken` handler. Runs once, on the mover's client: only that user writes the condition, so a
 *  shared scene does not toggle it once per connected client.
 *
 *  Run goes on when the turn's total movement passes the Charge distance and comes off if a later
 *  total no longer does; Combat#_onStartTurn clears it when the actor's next turn begins. Movement
 *  outside a started combat, and an undo, leave the condition as it is — see movedThisTurn. */
export async function syncRunStatus(doc, movement, user) {
  if ((user?.id ?? user) !== game.user.id || !battlemapEnabled()) return;
  const total = movedThisTurn(movement ?? doc.movement, { inStartedCombat: !!doc.combatant?.parent?.started });
  if (total === null || total <= 0) return;
  const rates = doc.actor?.system?.movement;
  if (!rates) return;
  // "run" OR "tooFar" (over-running) both mean the token is running — keep Run on past the max.
  const running = ["run", "tooFar"].includes(classifyMovement(total, rates));
  const hasRun = doc.actor.statuses?.has?.("run") ?? false;
  if (running && !hasRun) await doc.actor.toggleStatusEffect("run", { active: true });
  else if (!running && hasRun) await doc.actor.toggleStatusEffect("run", { active: false });
}
