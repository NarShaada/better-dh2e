// scripts/helpers/condition-data.mjs — PURE. DH2e condition → roll effects (grows as conditions are added).

/** Conditions that modify the to-hit roll against a target carrying them. melee/ranged = the to-hit modifier. */
export const CONDITION_ATTACK_MODS = {
  run: { label: "Run", melee: 20, ranged: -20 },
};

/** To-hit modifiers contributed by a target's conditions, for the attacker's weapon class.
 *  @param {Set<string>|string[]} statuses  the target actor's status ids
 *  @returns {{id:string,label:string,mod:number}[]}
 */
export function targetAttackModifiers(statuses, isMelee) {
  const ids = statuses instanceof Set ? [...statuses] : (statuses ?? []);
  const out = [];
  for (const id of ids) {
    const cfg = CONDITION_ATTACK_MODS[id];
    if (!cfg) continue;
    const mod = isMelee ? cfg.melee : cfg.ranged;
    if (mod) out.push({ id, label: cfg.label, mod });
  }
  return out;
}
