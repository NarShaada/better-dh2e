// scripts/helpers/part-source.mjs
// PURE — do NOT import anything from Foundry here. Keeps this unit-testable.

/** Create a part/grant SOURCE where its host lives.
 *
 *  Foundry gates Item creation on the parent when there is one and on the ITEM_CREATE permission
 *  when there is not:
 *
 *    if ( doc.parent ) return doc.parent.testUserPermission(user, "OWNER");
 *    return user.hasPermission("ITEM_CREATE");
 *
 *  ITEM_CREATE carries requiredRoles [ASSISTANT, GAMEMASTER] in v14, so it cannot be granted to a
 *  player at all. Creating the source in the world therefore always fails for a player, even one
 *  who owns the weapon being modified — which is the bug this exists to fix. Creating it on the
 *  host's actor succeeds, because they own that actor.
 *
 *  `folder` and `createWorld` are injected rather than imported so this stays pure, and so the
 *  world branch can be skipped entirely on the embedded path: Folder.create is GM-gated too, and
 *  calling it first is what made the failure land before the Item create was ever attempted.
 *
 *  @param {object} host        the Item the part is installed into; `host.parent` is its Actor or null
 *  @param {object} data        creation data for the new source Item
 *  @param {{folder: () => Promise<{id: string}>, createWorld: (data: object) => Promise<object|null>}} io
 *  @returns {Promise<object|null>} the created source, or null if creation produced nothing
 */
export async function createPartSource(host, data, { folder, createWorld }) {
  const actor = host?.parent;
  if (actor) {
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    return created ?? null;
  }
  const f = await folder();
  return (await createWorld({ ...data, folder: f.id })) ?? null;
}
