// scripts/documents/actor.mjs
// The system DataModel does the derived work; this subclass exists so we can add
// document-level helpers in later plans (rolls, applyDamage, etc.).
import { gatherStatMods, sumStatMods } from "../helpers/cyber-stats.mjs";

export class DarkHeresyActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    // this.system.prepareDerivedData() is invoked automatically by the TypeDataModel.
  }

  /** Expose the initiative characteristic's bonus so the combat tracker's
   *  "1d10 + @initiativeBonus" formula resolves (DH2e: Agility bonus by default; changeable in Custom advancement). */
  getRollData() {
    const data = super.getRollData();
    const initKey = this.system.initiative?.characteristic ?? "agility";
    // Base = init characteristic's bonus, plus any flat Initiative stat-mods (cybernetics / traits).
    const initMod = sumStatMods(gatherStatMods(this.items)).initiative ?? 0;
    data.initiativeBonus = (this.system.characteristics?.[initKey]?.bonus ?? 0) + initMod;
    return data;
  }
}
