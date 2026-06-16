// scripts/helpers/token-prefix.mjs
// NPC token-name prefixes. The PREFIXES list + the pure helpers below are import-safe (no Foundry,
// no DOM), so they are unit-tested. The runtime hook handler is appended in a later task.

export const PREFIXES = [
  "Filthy", "Lowly", "Blasphemous", "Cowardly", "Wretched", "Vile", "Craven", "Treacherous",
  "Accursed", "Sniveling", "Squalid", "Faithless", "Godless", "Damned", "Forsaken", "Corrupt",
  "Degenerate", "Despicable", "Loathsome", "Putrid", "Wicked", "Unclean", "Profane", "Doomed",
  "Miserable", "Pitiful", "Sickly", "Twisted", "Deranged", "Rabid", "Feral", "Savage", "Brutish",
  "Slovenly", "Grotesque", "Hideous", "Repugnant", "Foul", "Rancid", "Festering", "Diseased",
  "Tainted", "Defiled", "Debased", "Ignoble", "Gutless", "Spineless", "Sneaking", "Skulking",
  "Scheming", "Conniving", "Duplicitous", "Perfidious", "Mutinous", "Seditious", "Rebellious",
  "Insubordinate", "Renegade", "Outcast", "Condemned", "Hunted", "Desperate", "Frenzied", "Crazed",
  "Howling", "Gibbering", "Drooling", "Trembling", "Quivering", "Whimpering", "Groveling", "Cringing",
  "Fawning", "Servile", "Slavish", "Abject", "Pathetic", "Hapless", "Witless", "Brainless", "Mindless",
  "Soulless", "Heartless", "Ruthless", "Merciless", "Pitiless", "Murderous", "Ravenous", "Greedy",
  "Grasping", "Gluttonous", "Slothful", "Indolent", "Useless", "Worthless", "Insolent", "Impudent",
  "Recreant", "Verminous", "Maggoty", "Scabrous", "Slithering", "Cackling", "Shrieking", "Wailing",
  "Mewling", "Snarling",
];

// If `name` is "<prefix> <base>" (ends with " " + base, with a non-empty leading remainder),
// return the trimmed <prefix>; otherwise "".
export function extractPrefix(name, base) {
  if (!name || !base) return "";
  if (name === base) return "";
  if (name.endsWith(" " + base)) return name.slice(0, name.length - base.length - 1).trim();
  return "";
}

// A random entry of `list` not in the `used` Set; if every entry is used, any random entry.
// `rng` is injectable for deterministic tests.
export function pickPrefix(list, used, rng = Math.random) {
  const avail = list.filter((p) => !used.has(p));
  const pool = avail.length ? avail : list;
  return pool[Math.floor(rng() * pool.length)];
}

// Drop a leading word from `name` if it is a known prefix, so re-dropped tokens don't stack prefixes
// (e.g. a copy-pasted "Filthy Heretic" → base "Heretic", not "Filthy Heretic").
export function stripKnownPrefix(name, list) {
  const sp = name.indexOf(" ");
  if (sp > 0 && list.includes(name.slice(0, sp))) return name.slice(sp + 1);
  return name;
}
