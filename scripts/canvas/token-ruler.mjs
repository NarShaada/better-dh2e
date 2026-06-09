// scripts/canvas/token-ruler.mjs — colour the token drag path + grid highlights by DH movement band.
// Overrides the @protected per-segment / per-grid-space style hooks on TokenRuler (v14): each gets the
// waypoint, whose measurement.distance is the cumulative distance there, so we classify + recolour.
import { classifyMovement, battlemapEnabled } from "../helpers/battlemap-data.mjs";

// half = green, full = blue, charge = orange, run = red, beyond max = black
const BAND_COLOR = { half: 0x4caf50, full: 0x2196f3, charge: 0xff9800, run: 0xe53935, tooFar: 0x000000 };

/** Build a TokenRuler subclass that chains the current configured ruler class (so other modules coexist). */
export function makeDHTokenRuler(Base) {
  return class DHTokenRuler extends Base {
    /** Band colour for the cumulative distance at a waypoint (null when no rates / not applicable). */
    _bdhBandColor(distance) {
      const rates = this.token?.actor?.system?.movement;
      if (!rates || typeof distance !== "number") return null;
      return BAND_COLOR[classifyMovement(distance, rates)];
    }

    _getSegmentStyle(waypoint) {
      const style = super._getSegmentStyle(waypoint);
      if (!battlemapEnabled() || !(style?.width > 0)) return style;   // respect native "don't draw"
      const c = this._bdhBandColor(waypoint?.measurement?.distance);
      if (c != null) style.color = c;
      return style;
    }

    _getGridHighlightStyle(waypoint, offset) {
      const style = super._getGridHighlightStyle(waypoint, offset);
      if (!battlemapEnabled() || !(style?.alpha > 0)) return style;
      const c = this._bdhBandColor(waypoint?.measurement?.distance);
      if (c != null) style.color = c;
      return style;
    }
  };
}
