// scripts/helpers/condition-data.mjs — PURE. DH2e condition → roll effects (grows as conditions are added).

export const CONDITION_ATTACK_MODS = {
  run:     { label: "Run",     melee: 20, ranged: -20 },
  stunned: { label: "Stunned", melee: 20, ranged: 20 },
  prone:   { label: "Prone",   melee: 10, ranged: -10, rangedNoPenaltyAtPointBlank: true },
};
export const CONDITION_SELF_ATTACK_MODS = {
  prone: { label: "Prone", melee: -10, ranged: 0 },
};
export const CONDITION_EVADE_MODS = {
  prone: { label: "Prone", mod: -20 },
};

function asIds(statuses) { return statuses instanceof Set ? [...statuses] : (statuses ?? []); }

/** To-hit modifiers from a TARGET's conditions, for the weapon class + (ranged) the chosen range band. */
export function targetAttackModifiers(statuses, isMelee, range) {
  const out = [];
  for (const id of asIds(statuses)) {
    const cfg = CONDITION_ATTACK_MODS[id];
    if (!cfg) continue;
    let mod = isMelee ? cfg.melee : cfg.ranged;
    if (!isMelee && cfg.rangedNoPenaltyAtPointBlank && range === "pointBlank") mod = 0;
    if (mod) out.push({ id, label: cfg.label, mod });
  }
  return out;
}

/** To-hit modifiers from the ATTACKER's own conditions. */
export function selfAttackModifiers(statuses, isMelee) {
  const out = [];
  for (const id of asIds(statuses)) {
    const cfg = CONDITION_SELF_ATTACK_MODS[id];
    if (!cfg) continue;
    const mod = isMelee ? cfg.melee : cfg.ranged;
    if (mod) out.push({ id, label: cfg.label, mod });
  }
  return out;
}

/** Total modifier to an evader's Parry/Dodge from their own conditions. */
export function evadeConditionModifier(statuses) {
  let total = 0;
  for (const id of asIds(statuses)) { const cfg = CONDITION_EVADE_MODS[id]; if (cfg) total += cfg.mod; }
  return total;
}

/** Double every dice term in a damage formula (Helpless): NdX -> (2N)dX; flats unchanged. */
export function doubleDamageDice(formula) {
  return String(formula).replace(/(\d+)d(\d+)/g, (_, n, d) => `${parseInt(n, 10) * 2}d${d}`);
}

/** Most-potent Toxic wins: higher potency carries its own damage type; ties keep the current. */
export function pickToxic(current, incoming) {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.potency > current.potency ? incoming : current;
}
