// scripts/documents/actor.mjs
// The system DataModel does the derived work; this subclass exists so we can add
// document-level helpers in later plans (rolls, applyDamage, etc.).
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
    data.initiativeBonus = this.system.characteristics?.[initKey]?.bonus ?? 0;
    return data;
  }
}
