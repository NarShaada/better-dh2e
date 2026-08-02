// scripts/helpers/requisition-sources.mjs — PURE. Builds the Requisition item picker's index.
// The Foundry-side collector in rolls/requisition.mjs gathers raw entries from game.items and the
// enabled Item compendia; everything about WHICH entries are pickable and how they are labelled
// lives here so it can be tested without Foundry.

/** Item types you can requisition. Talents, traits and psychic powers are Items in Foundry's
 *  sense but are not acquired with Influence, and including them would bury the useful entries. */
export const ACQUIRABLE_TYPES = [
  "weapon", "weaponMod", "ammunition", "armour", "armourMod", "forceField", "gear", "cybernetic"
];

/** Acquirable types that have somewhere to live on the actor sheet.
 *
 *  weaponMod, ammunition and armourMod are pickable but the actor sheet renders none of them, and
 *  the encumbrance loop does not weigh them. Adding one would create an inert item the player
 *  cannot see, so the card offers no Add button. Installing a part references a SOURCE item by
 *  uuid, so an actor-owned copy achieves nothing.
 *
 *  Of the three, only armourMod carries an `availability` field to prefill the Requisition test —
 *  WeaponModModel and AmmunitionModel define none. The other two are pickable purely so the roll
 *  can be made against a named item; their Availability comes from whatever the GM sets in the
 *  dialog. */
export const ADDABLE_TYPES = ["weapon", "armour", "forceField", "gear", "cybernetic"];

/** May a requisitioned item of this type be added to the sheet? Unknown types are refused, so a
 *  future item type defaults to no Add button rather than to an orphan. */
export function isAddable(type) {
  return ADDABLE_TYPES.includes(type);
}

/** Is this a PART — a type that is installed into a host item rather than carried by an actor?
 *  weaponMod / ammunition / armourMod: acquirable, but nothing on the actor sheet renders them and
 *  no encumbrance loop weighs them, so an actor-owned copy is an invisible orphan.
 *
 *  Derived from the two lists above rather than named literally, so a future part-only type is
 *  covered by adding it to ACQUIRABLE_TYPES alone. Deliberately narrower than `!isAddable(type)`:
 *  talent, trait and psychicPower are not acquirable at all but DO render on the sheet, and must
 *  stay droppable and grantable. */
export function isPartOnly(type) {
  return ACQUIRABLE_TYPES.includes(type) && !ADDABLE_TYPES.includes(type);
}

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
