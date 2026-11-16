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

/** Every actor that could carry a weapon: world actors + the actors of tokens on the canvas. The
 *  second half is what reaches UNLINKED tokens — a synthetic actor is in neither `game.actors` nor
 *  `game.items`, so a weapon on an NPC token never had its cached parts refreshed. A Set, because
 *  a linked token's actor IS its world actor. Mirrors grantActors() in cybernetics/grants.mjs. */
function weaponActors() {
  const set = new Set(game.actors);
  for (const t of (canvas?.tokens?.placeables ?? [])) if (t.actor) set.add(t.actor);
  return set;
}

/** Every weapon in the world Items directory and on every actor that the acting user may update.
 *  Weapon parts can live on either. Weapons this user does not own are left out: the server would
 *  refuse the write, and one refusal used to abort the loop and leave every weapon after it stale
 *  (a player edits a part source while an NPC token linking to it is on the canvas). */
function allWeapons() {
  const out = [...game.items].filter((i) => i.type === "weapon");
  for (const actor of weaponActors()) out.push(...actor.items.filter((i) => i.type === "weapon"));
  return out.filter((w) => w.isOwner);
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
