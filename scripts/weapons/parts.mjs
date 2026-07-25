// scripts/weapons/parts.mjs — world-item plumbing for source-linked weapon parts.
// Mirrors scripts/cybernetics/grants.mjs: the source item is the editable master.
import { refreshPartsFromSource, clearPartLinks } from "../helpers/weapon-parts.mjs";

const PARTS_FOLDER = "Weapon Parts";

/** Ensure (and return) the world Items folder used for create-in-place ammunition/mod sources. */
export async function weaponPartsFolder() {
  let f = game.folders.find((x) => x.type === "Item" && x.name === PARTS_FOLDER);
  if (!f) f = await Folder.create({ name: PARTS_FOLDER, type: "Item" });
  return f;
}

/** Every weapon in the world and on every actor. Weapon parts can live on either. */
function allWeapons() {
  const out = [...game.items].filter((i) => i.type === "weapon");
  for (const actor of game.actors) out.push(...actor.items.filter((i) => i.type === "weapon"));
  return out;
}

/** A referenced ammunition/weaponMod source changed → refresh the cached effects on every weapon
 *  holding a link to it. loadedAmmo is untouched by design: it snapshots the chambered rounds. */
export async function refreshWeaponsReferencing(source) {
  for (const w of allWeapons()) {
    const { ammo, mods, changed } = refreshPartsFromSource(w.system, source);
    if (changed) await w.update({ "system.ammo": ammo, "system.mods": mods });
  }
}

/** A referenced source was deleted → drop the link but KEEP the entry, its effects and its count.
 *  You still own the magazines; tidying the Items directory must not strip a character's stock. */
export async function purgeDeletedPartSource(uuid) {
  for (const w of allWeapons()) {
    const { ammo, mods, changed } = clearPartLinks(w.system, uuid);
    if (changed) await w.update({ "system.ammo": ammo, "system.mods": mods });
  }
}

/** Register the part-sync hooks. Call once at ready. Only the acting user writes (avoids races). */
export function registerWeaponPartHooks() {
  const isPart = (item) => item?.type === "ammunition" || item?.type === "weaponMod";
  Hooks.on("updateItem", (item, change, options, userId) => {
    if (userId !== game.user.id || !isPart(item)) return;
    refreshWeaponsReferencing(item);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId !== game.user.id || !isPart(item)) return;
    purgeDeletedPartSource(item.uuid);
  });
}
