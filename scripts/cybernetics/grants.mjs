// scripts/cybernetics/grants.mjs — transfer granted items onto the actor when a host (cybernetic/armour) is active.
import { grantHostType, isGrantHostActive, grantPlan } from "../helpers/grants-data.mjs";

const NS = "better-dh2e";
const GRANT_FOLDER = "Granted Items";

/** Ensure (and return) the world Items folder used for create-in-place grant sources. */
export async function grantsFolder() {
  let f = game.folders.find((x) => x.type === "Item" && x.name === GRANT_FOLDER);
  if (!f) f = await Folder.create({ name: GRANT_FOLDER, type: "Item" });
  return f;
}

/** Build a granted item's full data from its source. `equipped` (for armour/weapon/forceField) is decided
 *  by the caller — non-additive armour must respect the single-worn rule rather than blindly equipping. */
function grantedData(src, hostId, uuid, equipped) {
  const data = src.toObject();
  delete data._id;
  data.flags = { ...(data.flags ?? {}), [NS]: { ...(data.flags?.[NS] ?? {}), grantedBy: hostId, grantedUuid: uuid } };
  data.system = { ...data.system };
  if (data.type === "talent" || data.type === "psychicPower") data.system.purchased = true;
  if (data.type === "armour" || data.type === "weapon" || data.type === "forceField") data.system.equipped = equipped;
  return data;
}

/** Reconcile an actor's items granted by `host` to match the host's active/grants state — the source
 *  item is the master: create missing, REFRESH existing from the current source, remove extra.
 *  Equip state: a new equippable grant equips by default; a new non-additive armour equips only if none is
 *  already worn (mirrors the toggle rule); refreshed copies keep the player's current equip state. */
export async function reconcileGrants(host) {
  const actor = host?.parent;
  if (!actor || !(actor instanceof Actor)) return;
  if (!grantHostType(host) || host.getFlag(NS, "grantedBy")) return;   // a granted item is never a host
  const desired = isGrantHostActive(host) ? (host.system.grants ?? []).map((g) => g.uuid) : [];
  const existingDocs = actor.items.filter((i) => i.getFlag(NS, "grantedBy") === host.id);
  const byUuid = new Map(existingDocs.map((i) => [i.getFlag(NS, "grantedUuid"), i]));
  const { toUpdateUuidToId, toRemoveIds } = grantPlan(desired, existingDocs.map((i) => ({ id: i.id, uuid: i.getFlag(NS, "grantedUuid") })));
  if (toRemoveIds.length) await actor.deleteEmbeddedDocuments("Item", toRemoveIds);
  // Is a non-additive armour already worn (excluding copies being removed)? New non-additive grants won't double up.
  const removeSet = new Set(toRemoveIds);
  let nonAdditiveWorn = actor.items.some((i) =>
    i.type === "armour" && i.system.equipped && !i.system.additive && !removeSet.has(i.id));
  const toCreate = [];
  const updates = [];
  for (const uuid of desired) {
    const src = await fromUuid(uuid);
    if (!src) { console.warn(`better-dh2e | grant source missing: ${uuid}`); continue; }
    const cur = byUuid.get(uuid);
    if (toUpdateUuidToId[uuid] !== undefined) {
      const data = grantedData(src, host.id, uuid, cur.system.equipped);   // refresh from source; keep current equip
      updates.push({ _id: cur.id, name: data.name, img: data.img, system: data.system });
    } else {
      let equipped = true;
      if (src.type === "armour" && !src.system.additive) { equipped = !nonAdditiveWorn; if (equipped) nonAdditiveWorn = true; }
      toCreate.push(grantedData(src, host.id, uuid, equipped));
    }
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
}

/** Every actor that could host grants: world actors + unlinked token actors on the canvas. */
function grantActors() {
  const set = new Set(game.actors);
  for (const t of (canvas?.tokens?.placeables ?? [])) if (t.actor) set.add(t.actor);
  return set;
}

/** A world grant-source item was edited → re-sync granted copies on every host (across actors) that
 *  references it, and refresh the host's cached grant name/type so its open sheet updates without reopening. */
export async function reconcileHostsReferencing(uuid) {
  const src = await fromUuid(uuid);
  let hosts = 0;
  for (const actor of grantActors()) {
    for (const it of actor.items) {
      if (!grantHostType(it) || it.getFlag(NS, "grantedBy")) continue;
      const grants = it.system.grants ?? [];
      if (!grants.some((g) => g.uuid === uuid)) continue;
      hosts++;
      await reconcileGrants(it);
      if (src) {
        const updated = grants.map((g) => g.uuid === uuid ? { ...g, name: src.name, type: src.type } : g);
        if (updated.some((g, i) => g.name !== grants[i].name || g.type !== grants[i].type)) {
          await it.update({ "system.grants": updated });   // refresh cached name → re-renders the host sheet
        }
      }
    }
  }
  console.debug(`better-dh2e | grant source ${uuid} edited → re-synced ${hosts} host(s)`);
}

/** Remove every item granted by `host` from the actor (host deleted/disabled). */
export async function removeHostGrants(host, actor) {
  const a = actor ?? host?.parent;
  if (!a) return;
  const ids = a.items.filter((i) => i.getFlag(NS, "grantedBy") === host.id).map((i) => i.id);
  if (ids.length) await a.deleteEmbeddedDocuments("Item", ids);
}

/** Register grant-reconcile hooks. Call once at ready. Only the triggering user reconciles (avoids races). */
export function registerGrantHooks() {
  Hooks.on("createItem", (item, options, userId) => {
    if (userId !== game.user.id || !grantHostType(item) || item.getFlag(NS, "grantedBy")) return;
    reconcileGrants(item);
  });
  Hooks.on("updateItem", (item, change, options, userId) => {
    if (userId !== game.user.id) return;
    // Host (cybernetic/armour on an actor) toggled or grants edited → reconcile its grants.
    if (grantHostType(item) && !item.getFlag(NS, "grantedBy") && item.parent instanceof Actor) {
      const sys = change.system ?? {};
      if ("installed" in sys || "equipped" in sys || "grants" in sys) reconcileGrants(item);
      return;
    }
    // A world grant-source item changed (name or stats) → refresh granted copies that reference it.
    if (!(item.parent instanceof Actor)) reconcileHostsReferencing(item.uuid);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId !== game.user.id || !grantHostType(item) || item.getFlag(NS, "grantedBy")) return;   // a granted item is never a host
    if (item.parent instanceof Actor) removeHostGrants(item, item.parent);
  });
}
