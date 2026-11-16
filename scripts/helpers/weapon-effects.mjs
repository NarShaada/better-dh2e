// scripts/helpers/weapon-effects.mjs — PURE. No Foundry globals.
// Folds a weapon's own stats, its installed mods, and its loaded ammo into one
// effective set. Mods are permanent; ammo is the swappable layer on top.

/** Append a damage fragment ("+2", "+1d5"). Fragments are meant to carry their own sign, but the
 *  field is free text: one typed as a bare number or bare dice ("2", "1d5") gets a "+" — appended
 *  verbatim it glued its digits onto the weapon's own modifier ("1d10+3" + "2" → "1d10+32").
 *  Only when there IS something to add it to: a launcher has no damage of its own and the loaded
 *  round's fragment ("2d10+2") is the whole formula, which must not gain a leading "+".
 *  Anything else is left exactly as typed rather than guessed at. Empties are skipped. */
function appendDamage(formula, fragment) {
  const f = String(fragment ?? "").trim();
  if (!f) return formula;
  if (!formula.trim()) return f;
  return /^[\dd]/i.test(f) ? `${formula}+${f}` : `${formula}${f}`;
}

/** Merge ammo qualities over weapon qualities: same key → ammo's entry wins, others survive. */
function mergeQualities(weaponQualities, ammoQualities) {
  const out = (weaponQualities ?? []).map((q) => ({ ...q }));
  for (const aq of ammoQualities ?? []) {
    const i = out.findIndex((q) => q.key === aq.key);
    if (i >= 0) out[i] = { ...aq };
    else out.push({ ...aq });
  }
  return out;
}

/**
 * @param {object} system  a weapon's system data (may be partial)
 * @returns {{attackMod:number, damage:string, penetration:number|string, damageType:string,
 *            qualities:Array<{key:string,value:?number}>, sources:Array<{label:string,effects:string}>}}
 */
export function effectiveWeapon(system) {
  const s = system ?? {};
  let attackMod = 0;
  let damage = String(s.damage ?? "");
  let penetration = Number(s.penetration ?? 0) || 0;
  let damageType = String(s.damageType ?? "");
  let qualities = (s.qualities ?? []).map((q) => ({ ...q }));
  const sources = [];

  const layer = (entry) => {
    attackMod += Number(entry.attackMod ?? 0) || 0;
    penetration += Number(entry.penMod ?? 0) || 0;
    damage = appendDamage(damage, entry.damageMod);
    const bits = [];
    if (entry.attackMod) bits.push(`atk ${entry.attackMod > 0 ? "+" : ""}${entry.attackMod}`);
    if (entry.damageMod) bits.push(`dmg ${entry.damageMod}`);
    if (entry.penMod) bits.push(`pen ${entry.penMod > 0 ? "+" : ""}${entry.penMod}`);
    sources.push({ label: String(entry.name ?? ""), effects: bits.join(", ") });
  };

  for (const m of s.mods ?? []) layer(m);

  const ammo = s.loadedAmmo;
  if (ammo) {
    layer(ammo);
    if (String(ammo.damageType ?? "")) damageType = String(ammo.damageType);
    qualities = mergeQualities(qualities, ammo.qualities);
  }

  // Penetration cannot go below zero. A negative Pen Mod on a low-penetration weapon used to, and
  // the soak maths reads negative penetration as EXTRA armour — even on an unarmoured location.
  // Floored on the total, so a penalty from one part can still be offset by a bonus from another.
  return { attackMod, damage, penetration: Math.max(0, penetration), damageType, qualities, sources };
}

/** Total spare magazines across every stocked ammo type. */
export function totalMagazines(system) {
  return (system?.ammo ?? []).reduce((sum, a) => sum + (Number(a.count) || 0), 0);
}

/** Weight of spare magazines: each is 10% of the parent weapon; the loaded one is already in the gun. */
export function magazineWeight(system) {
  return 0.1 * (Number(system?.weight) || 0) * totalMagazines(system);
}
