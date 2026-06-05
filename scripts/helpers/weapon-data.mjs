// scripts/helpers/weapon-data.mjs
// PURE — no Foundry imports.

/** Which conditional weapon fields apply for a class. Melee: no range/ammo. Thrown: range but no ammo. */
export function weaponClassFlags(weaponClass) {
  const isMelee = weaponClass === "melee";
  const isThrown = weaponClass === "thrown";
  return {
    usesRange: !isMelee,
    usesAmmo: !isMelee && !isThrown
  };
}
