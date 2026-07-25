// scripts/helpers/weapon-parts.mjs — PURE. No Foundry globals.
// A weapon's ammo[]/mods[] entries may reference a source item by uuid while ALSO caching its
// effects, so effectiveWeapon can stay synchronous. These helpers keep that cache honest.
// loadedAmmo is deliberately out of scope: it is a snapshot of the rounds already chambered and
// must not change when the catalogue entry behind it is edited.

/** Effect fields copied from an ammunition source onto an ammo[] entry (never `count`). */
function ammoFields(src) {
  const s = src.system ?? {};
  return {
    name: src.name ?? "",
    attackMod: Number(s.attackMod ?? 0) || 0,
    damageMod: String(s.damageMod ?? ""),
    penMod: Number(s.penMod ?? 0) || 0,
    special: String(s.special ?? ""),
    damageType: String(s.damageType ?? ""),
    qualities: (s.qualities ?? []).map((q) => ({ ...q }))
  };
}

/** Effect fields copied from a weaponMod source onto a mods[] entry. Mods carry no qualities. */
function modFields(src) {
  const s = src.system ?? {};
  return {
    name: src.name ?? "",
    attackMod: Number(s.attackMod ?? 0) || 0,
    damageMod: String(s.damageMod ?? ""),
    penMod: Number(s.penMod ?? 0) || 0,
    special: String(s.special ?? "")
  };
}

/**
 * Refresh every entry linked to `source` from that source's current values.
 * @param {object} system  a weapon's system data
 * @param {{uuid:string, name:string, type:string, system:object}} source
 * @returns {{ammo:Array, mods:Array, changed:boolean}} — new arrays; `changed` false if nothing linked.
 */
export function refreshPartsFromSource(system, source) {
  const ammo = (system?.ammo ?? []).map((e) => ({ ...e }));
  const mods = (system?.mods ?? []).map((e) => ({ ...e }));
  const uuid = source?.uuid;
  let changed = false;
  if (!uuid) return { ammo, mods, changed };

  if (source.type === "ammunition") {
    for (let i = 0; i < ammo.length; i++) {
      if (ammo[i].uuid !== uuid) continue;
      ammo[i] = { ...ammo[i], ...ammoFields(source) };   // count survives — stock is not the source's
      changed = true;
    }
  } else if (source.type === "weaponMod") {
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].uuid !== uuid) continue;
      mods[i] = { ...mods[i], ...modFields(source) };
      changed = true;
    }
  }
  return { ammo, mods, changed };
}

/**
 * Drop the link to a deleted source, keeping the entry, its cached effects and its count —
 * you still physically own those magazines and installed mods.
 * @returns {{ammo:Array, mods:Array, changed:boolean}}
 */
export function clearPartLinks(system, uuid) {
  const ammo = (system?.ammo ?? []).map((e) => ({ ...e }));
  const mods = (system?.mods ?? []).map((e) => ({ ...e }));
  let changed = false;
  if (!uuid) return { ammo, mods, changed };
  for (const list of [ammo, mods]) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].uuid !== uuid) continue;
      list[i] = { ...list[i], uuid: "" };
      changed = true;
    }
  }
  return { ammo, mods, changed };
}
