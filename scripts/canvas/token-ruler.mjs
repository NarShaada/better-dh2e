// scripts/canvas/token-ruler.mjs — extend the token drag ruler to show our movement mode on the label.
import { classifyMovement, battlemapEnabled } from "../helpers/battlemap-data.mjs";

const MODE_LABEL = { half: "Half", full: "Full", charge: "Charge", run: "Run", tooFar: "Too Far" };

/** Build a TokenRuler subclass that chains the current configured ruler class (so other modules coexist). */
export function makeDHTokenRuler(Base) {
  return class DHTokenRuler extends Base {
    static WAYPOINT_LABEL_TEMPLATE = "systems/better-dh2e/templates/hud/waypoint-label.hbs";

    _getWaypointLabelContext(waypoint, state) {
      const context = super._getWaypointLabelContext(waypoint, state);
      if (!context) return context;                  // super suppresses some labels (returns void)
      if (battlemapEnabled()) {
        const rates = this.token?.actor?.system?.movement;
        const dist = waypoint?.measurement?.distance;
        if (rates && typeof dist === "number") {
          context.movementMode = MODE_LABEL[classifyMovement(dist, rates)];
        }
      }
      return context;
    }
  };
}
