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

/** Build a granted item's full data from its source (flags + purchased/equipped stamping). */
function grantedData(src, hostId, uuid) {
  const data = src.toObject();
  delete data._id;
  data.flags = { ...(data.flags ?? {}), [NS]: { ...(data.flags?.[NS] ?? {}), grantedBy: hostId, grantedUuid: uuid } };
  if (data.type === "talent" || data.type === "psychicPower") data.system = { ...data.system, purchased: true };
  if (data.type === "armour" || data.type === "weapon" || data.type === "forceField") data.system = { ...data.system, equipped: true };
  return data;
}

/** Reconcile an actor's items granted by `host` to match the host's active/grants state — the source
 *  item is the master: create missing, REFRESH existing from the current source, remove extra. */
export async function reconcileGrants(host) {
  const actor = host?.parent;
  if (!actor || !(actor instanceof Actor)) return;
  if (!grantHostType(host) || host.getFlag(NS, "grantedBy")) return;   // a granted item is never a host
  const desired = isGrantHostActive(host) ? (host.system.grants ?? []).map((g) => g.uuid) : [];
  const existing = actor.items
    .filter((i) => i.getFlag(NS, "grantedBy") === host.id)
    .map((i) => ({ id: i.id, uuid: i.getFlag(NS, "grantedUuid") }));
  const { toUpdateUuidToId, toRemoveIds } = grantPlan(desired, existing);
  if (toRemoveIds.length) await actor.deleteEmbeddedDocuments("Item", toRemoveIds);
  const toCreate = [];
  const updates = [];
  for (const uuid of desired) {
    const src = await fromUuid(uuid);
    if (!src) { console.warn(`better-dh2e | grant source missing: ${uuid}`); continue; }
    const data = grantedData(src, host.id, uuid);
    const id = toUpdateUuidToId[uuid];
    if (id !== undefined) updates.push({ _id: id, name: data.name, img: data.img, system: data.system });
    else toCreate.push(data);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
}

/** A world grant-source item was edited → re-sync granted copies on every host (across actors) that references it. */
export async function reconcileHostsReferencing(uuid) {
  for (const actor of game.actors) {
    for (const it of actor.items) {
      if (grantHostType(it) && !it.getFlag(NS, "grantedBy") && (it.system.grants ?? []).some((g) => g.uuid === uuid)) {
        await reconcileGrants(it);
      }
    }
  }
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
