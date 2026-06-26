// scripts/cybernetics/grants.mjs — transfer granted items onto the actor when a host (cybernetic/armour) is active.
import { grantHostType, isGrantHostActive, grantDiff } from "../helpers/grants-data.mjs";

const NS = "better-dh2e";
const GRANT_FOLDER = "Granted Items";

/** Ensure (and return) the world Items folder used for create-in-place grant sources. */
export async function grantsFolder() {
  let f = game.folders.find((x) => x.type === "Item" && x.name === GRANT_FOLDER);
  if (!f) f = await Folder.create({ name: GRANT_FOLDER, type: "Item" });
  return f;
}

/** Reconcile an actor's items granted by `host` to match the host's active/grants state. */
export async function reconcileGrants(host) {
  const actor = host?.parent;
  if (!actor || !(actor instanceof Actor)) return;
  if (!grantHostType(host) || host.getFlag(NS, "grantedBy")) return;   // a granted item is never a host
  const desired = isGrantHostActive(host) ? (host.system.grants ?? []).map((g) => g.uuid) : [];
  const existing = actor.items
    .filter((i) => i.getFlag(NS, "grantedBy") === host.id)
    .map((i) => ({ id: i.id, uuid: i.getFlag(NS, "grantedUuid") }));
  const { toCreateUuids, toRemoveIds } = grantDiff(desired, existing);
  if (toRemoveIds.length) await actor.deleteEmbeddedDocuments("Item", toRemoveIds);
  const toCreate = [];
  for (const uuid of toCreateUuids) {
    const src = await fromUuid(uuid);
    if (!src) { console.warn(`better-dh2e | grant source missing: ${uuid}`); continue; }
    const data = src.toObject();
    delete data._id;
    data.flags = { ...(data.flags ?? {}), [NS]: { ...(data.flags?.[NS] ?? {}), grantedBy: host.id, grantedUuid: uuid } };
    if (data.type === "talent" || data.type === "psychicPower") data.system = { ...data.system, purchased: true };
    if (data.type === "armour" || data.type === "weapon" || data.type === "forceField") data.system = { ...data.system, equipped: true };
    toCreate.push(data);
  }
  if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
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
    if (userId !== game.user.id || !grantHostType(item) || item.getFlag(NS, "grantedBy")) return;
    const sys = change.system ?? {};
    if ("installed" in sys || "equipped" in sys || "grants" in sys) reconcileGrants(item);
  });
  Hooks.on("deleteItem", (item, options, userId) => {
    if (userId !== game.user.id || !grantHostType(item)) return;
    if (item.parent instanceof Actor) removeHostGrants(item, item.parent);
  });
}
