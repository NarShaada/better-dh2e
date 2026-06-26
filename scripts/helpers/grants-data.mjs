// scripts/helpers/grants-data.mjs — PURE. Grant-host rules + reconcile diff.

/** "cybernetic" | "armour" | null — which grant-host kind this item is. */
export function grantHostType(item) {
  return (item?.type === "cybernetic" || item?.type === "armour") ? item.type : null;
}

/** Is this grant host currently active? cybernetic → installed; armour → equipped. */
export function isGrantHostActive(item) {
  if (item?.type === "cybernetic") return !!item.system?.installed;
  if (item?.type === "armour") return !!item.system?.equipped;
  return false;
}

/** May a host of hostType grant an item of itemType?
 *  cybernetic → anything except cybernetic; armour → anything except armour and cybernetic. */
export function canGrant(hostType, itemType) {
  if (hostType === "cybernetic") return itemType !== "cybernetic";
  if (hostType === "armour") return itemType !== "armour" && itemType !== "cybernetic";
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
