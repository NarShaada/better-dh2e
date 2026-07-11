// scripts/helpers/grants-data.mjs — PURE. Grant-host rules + reconcile diff.

/** "cybernetic" | "armour" | "trait" | null — which grant-host kind this item is. */
export function grantHostType(item) {
  return (item?.type === "cybernetic" || item?.type === "armour" || item?.type === "trait") ? item.type : null;
}

/** Is this grant host currently active? cybernetic → installed; armour → equipped; trait → always (inherent). */
export function isGrantHostActive(item) {
  if (item?.type === "cybernetic") return !!item.system?.installed;
  if (item?.type === "armour") return !!item.system?.equipped;
  if (item?.type === "trait") return true;
  return false;
}

/** May a host of hostType grant an item of itemType?
 *  cybernetic → anything except cybernetic; armour → anything except armour and cybernetic; trait → anything except trait. */
export function canGrant(hostType, itemType) {
  if (hostType === "cybernetic") return itemType !== "cybernetic";
  if (hostType === "armour") return itemType !== "armour" && itemType !== "cybernetic";
  if (hostType === "trait") return itemType !== "trait";
  return false;
}

/** Diff desired grant-source uuids against existing granted items [{id, uuid}].
 *  Returns uuids to create (desired, not present) and item ids to remove (present, no longer desired). */
export function grantDiff(desiredUuids, existing) {
  const desired = new Set(desiredUuids ?? []);
  const have = new Set((existing ?? []).map((e) => e.uuid));
  const toCreateUuids = [...desired].filter((u) => !have.has(u));
  const toRemoveIds = (existing ?? []).filter((e) => !desired.has(e.uuid)).map((e) => e.id);
  return { toCreateUuids, toRemoveIds };
}

/** Plan the cleanup when a grant SOURCE (`uuid`) is deleted, for one actor's items.
 *  `items`: [{ id, grantedUuid, isHost, grants }] where `grantedUuid` is set only on granted copies,
 *  `isHost` is true for a grant-host item that is not itself a granted copy, and `grants` is its grant list.
 *  Returns orphan copy ids (their source is gone → delete) and per-host filtered grant lists (drop the dead uuid). */
export function purgeSourcePlan(items, uuid) {
  const list = items ?? [];
  const orphanIds = list.filter((i) => i.grantedUuid === uuid).map((i) => i.id);
  const hostGrantUpdates = list
    .filter((i) => i.isHost && (i.grants ?? []).some((g) => g.uuid === uuid))
    .map((i) => ({ id: i.id, grants: i.grants.filter((g) => g.uuid !== uuid) }));
  return { orphanIds, hostGrantUpdates };
}

/** 3-way reconcile plan: desired uuids vs existing granted items [{id, uuid}].
 *  - toCreateUuids: desired with no existing copy (create from source)
 *  - toUpdateUuidToId: { uuid: existingId } for desired that already have a copy (refresh from source)
 *  - toRemoveIds: existing copies no longer desired (delete) */
export function grantPlan(desiredUuids, existing) {
  const desired = desiredUuids ?? [];
  const desiredSet = new Set(desired);
  const byUuid = new Map((existing ?? []).map((e) => [e.uuid, e.id]));
  const toCreateUuids = desired.filter((u) => !byUuid.has(u));
  const toUpdateUuidToId = Object.fromEntries(desired.filter((u) => byUuid.has(u)).map((u) => [u, byUuid.get(u)]));
  const toRemoveIds = (existing ?? []).filter((e) => !desiredSet.has(e.uuid)).map((e) => e.id);
  return { toCreateUuids, toUpdateUuidToId, toRemoveIds };
}
