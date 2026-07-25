// scripts/weapons/parts.mjs — world-item plumbing for source-linked weapon parts.
// Mirrors scripts/cybernetics/grants.mjs: the source item is the editable master.
const PARTS_FOLDER = "Weapon Parts";

/** Ensure (and return) the world Items folder used for create-in-place ammunition/mod sources. */
export async function weaponPartsFolder() {
  let f = game.folders.find((x) => x.type === "Item" && x.name === PARTS_FOLDER);
  if (!f) f = await Folder.create({ name: PARTS_FOLDER, type: "Item" });
  return f;
}
