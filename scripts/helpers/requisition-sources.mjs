// scripts/helpers/requisition-sources.mjs — PURE. Builds the Requisition item picker's index.
// The Foundry-side collector in rolls/requisition.mjs gathers raw entries from game.items and the
// enabled Item compendia; everything about WHICH entries are pickable and how they are labelled
// lives here so it can be tested without Foundry.

/** Item types you can requisition. Talents, traits and psychic powers are Items in Foundry's
 *  sense but are not acquired with Influence, and including them would bury the useful entries. */
export const ACQUIRABLE_TYPES = [
  "weapon", "weaponMod", "ammunition", "armour", "forceField", "gear", "cybernetic"
];

/**
 * @param {Array<{name:string, uuid:string, type:string, availability?:string, source?:string}>} entries
 * @returns {Array<{label:string, uuid:string, type:string, availability:string|null}>}
 */
export function buildSourceIndex(entries) {
  // A real Foundry Item always has a name, but pack index data can be malformed; a nameless
  // entry can't be labelled or sorted, so it's dropped here rather than left to crash `.sort`.
  const acquirable = (entries ?? []).filter((x) => ACQUIRABLE_TYPES.includes(x?.type) && !!x?.name);
  // A datalist shows one string per option, so a name in two packs needs its source to tell them
  // apart. Names that appear once stay bare — most of the list would otherwise be noise.
  const seen = new Map();
  for (const x of acquirable) seen.set(x.name, (seen.get(x.name) ?? 0) + 1);
  return acquirable
    .map((x) => ({
      label: seen.get(x.name) > 1 && x.source ? `${x.name} (${x.source})` : x.name,
      uuid: x.uuid,
      type: x.type,
      availability: x.availability ?? null
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
