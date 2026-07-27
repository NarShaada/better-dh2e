// scripts/documents/actor.mjs
// The system DataModel does the derived work; this subclass exists so we can add
// document-level helpers in later plans (rolls, applyDamage, etc.).
import { gatherStatMods, sumStatMods } from "../helpers/cyber-stats.mjs";
import { initiativeBase } from "../helpers/derived.mjs";

export class DarkHeresyActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    // this.system.prepareDerivedData() is invoked automatically by the TypeDataModel.
  }

  /** Expose the initiative bonus so the tracker's "<dice> + @initiativeBonus" formula resolves.
   *  Base (characteristic bonus or flat) + the sheet's modifier, then flat Initiative stat-mods. */
  getRollData() {
    const data = super.getRollData();
    const cfg = this.system.initiative;
    const charBonus = this.system.characteristics?.[cfg?.characteristic ?? "agility"]?.bonus ?? 0;
    const initMod = sumStatMods(gatherStatMods(this.items)).initiative ?? 0;
    data.initiativeBonus = initiativeBase(cfg, charBonus) + initMod;
    return data;
  }
}
