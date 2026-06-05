// scripts/documents/actor.mjs
// The system DataModel does the derived work; this subclass exists so we can add
// document-level helpers in later plans (rolls, applyDamage, etc.).
export class DarkHeresyActor extends Actor {
  prepareDerivedData() {
    super.prepareDerivedData();
    // this.system.prepareDerivedData() is invoked automatically by the TypeDataModel.
  }
}
