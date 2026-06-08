// scripts/helpers/force-field-data.mjs — PURE. Force-field test resolution.

/** Resolve a force-field 1d100: success if roll <= protection; overload if roll <= overload value. */
export function forceFieldResult(roll, protection, overload) {
  return { success: roll <= protection, overload: roll <= overload };
}
