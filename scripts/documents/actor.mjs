// scripts/documents/actor.mjs
// The system DataModel does the derived work; this subclass exists so we can add
// document-level helpers in later plans (rolls, applyDamage, etc.).
import { gatherStatMods, sumStatMods } from "../helpers/cyber-stats.mjs";
import { initiativeBase } from "../helpers/derived.mjs";

export class DarkHeresyActor extends Actor {
  /** Acolytes are player characters, so their prototype token is LINKED by default.
   *
   *  Foundry's own default for an undeclared prototype token is actorLink: false, and an unlinked
   *  token is a *synthetic* actor — the source document plus a per-token delta, where a field the
   *  delta does not carry falls through to the source. For a sheet the GM and the player both edit
   *  that produces a silent, directional split: the GM edits the token (writing the delta), the
   *  player has their source sheet open and sees nothing; the player edits the source and the GM
   *  DOES see it, because their delta has no entry for that field to shadow it. Characteristic
   *  damage set by the GM then modifies the GM's rolls and not the player's. That was reported as
   *  a bug on 2026-08-05 and cost a real debugging session.
   *
   *  prototypeToken is a document-level field, not part of `system`, so it cannot be defaulted in
   *  template.json — this is the place. Only affects newly created actors; existing ones keep what
   *  they have and must be relinked by hand.
   *
   *  npc/horde/vehicle are deliberately left unlinked: those are placed in quantity and each token
   *  wants its own wounds and conditions. */
  _preCreate(data, options, user) {
    if (this.type === "acolyte" && data.prototypeToken?.actorLink === undefined) {
      this.updateSource({ prototypeToken: { actorLink: true } });
    }
    return super._preCreate(data, options, user);
  }

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
