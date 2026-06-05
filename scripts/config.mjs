/** Static configuration for the Better DH2e system. Plain data only — no Foundry calls. */
export const BDH = {};

/** The ten characteristics, in sheet order. `short` is the FFG abbreviation. */
BDH.characteristics = {
  weaponSkill:    { label: "BDH.Char.WeaponSkill",    short: "WS"  },
  ballisticSkill: { label: "BDH.Char.BallisticSkill", short: "BS"  },
  strength:       { label: "BDH.Char.Strength",       short: "S"   },
  toughness:      { label: "BDH.Char.Toughness",      short: "T"   },
  agility:        { label: "BDH.Char.Agility",        short: "Ag"  },
  intelligence:   { label: "BDH.Char.Intelligence",   short: "Int" },
  perception:     { label: "BDH.Char.Perception",     short: "Per" },
  willpower:      { label: "BDH.Char.Willpower",       short: "WP"  },
  fellowship:     { label: "BDH.Char.Fellowship",     short: "Fel" },
  influence:      { label: "BDH.Char.Influence",      short: "Inf" }
};

/** Skill rank -> flat bonus added to the governing characteristic. */
BDH.skillRanks = {
  untrained:   -20,
  known:         0,
  trained:      10,
  experienced:  20,
  veteran:      30
};

/**
 * Core (non-specialist) skills with their governing characteristic key.
 * Specialist skills are added in a later plan; the data-model pattern is the same.
 */
BDH.skills = {
  acrobatics:  { label: "BDH.Skill.Acrobatics",  characteristic: "agility"      },
  athletics:   { label: "BDH.Skill.Athletics",   characteristic: "strength"     },
  awareness:   { label: "BDH.Skill.Awareness",   characteristic: "perception"   },
  charm:       { label: "BDH.Skill.Charm",       characteristic: "fellowship"   },
  command:     { label: "BDH.Skill.Command",     characteristic: "fellowship"   },
  deceive:     { label: "BDH.Skill.Deceive",     characteristic: "fellowship"   },
  dodge:       { label: "BDH.Skill.Dodge",       characteristic: "agility"      },
  inquiry:     { label: "BDH.Skill.Inquiry",     characteristic: "fellowship"   },
  logic:       { label: "BDH.Skill.Logic",       characteristic: "intelligence" },
  medicae:     { label: "BDH.Skill.Medicae",     characteristic: "intelligence" },
  parry:       { label: "BDH.Skill.Parry",       characteristic: "weaponSkill"  },
  scrutiny:    { label: "BDH.Skill.Scrutiny",    characteristic: "perception"   },
  stealth:     { label: "BDH.Skill.Stealth",     characteristic: "agility"      },
  survival:    { label: "BDH.Skill.Survival",    characteristic: "perception"   }
};

/** Item craftsmanship tiers (key -> label). */
BDH.craftsmanship = { poor: "Poor", normal: "Normal", good: "Good", best: "Best" };

/** Availability ladder (key -> label). */
BDH.availability = {
  ubiquitous: "Ubiquitous", abundant: "Abundant", plentiful: "Plentiful", common: "Common",
  average: "Average", scarce: "Scarce", rare: "Rare", veryRare: "Very Rare",
  extremelyRare: "Extremely Rare", nearUnique: "Near Unique", unique: "Unique"
};

/** Fixed aptitude list (values are also the labels). Used by talents and character advancement. */
BDH.aptitudes = [
  "Weapon Skill", "Ballistic Skill", "Strength", "Toughness", "Agility", "Intelligence",
  "Perception", "Willpower", "Fellowship", "Offence", "Finesse", "Defence",
  "Psyker", "Knowledge", "Leadership", "Social", "Tech", "Fieldcraft", "General"
];

BDH.actorTypes = ["acolyte", "npc"];
BDH.itemTypes  = ["weapon", "weaponMod", "gear", "talent", "trait", "forceField", "cybernetic", "psychicPower", "armour"];

/** Weapon class (key -> label). */
BDH.weaponClasses = { melee: "Melee", thrown: "Thrown", pistol: "Pistol", basic: "Basic", heavy: "Heavy" };

/** Weapon type / tech (key -> label). */
BDH.weaponTypes = {
  lowTech: "Low-Tech", chain: "Chain", shock: "Shock", power: "Power",
  solidProjectile: "Solid Projectile", bolt: "Bolt", las: "Las", plasma: "Plasma",
  melta: "Melta", flame: "Flame", exotic: "Exotic"
};

/** Damage types (key -> label). */
BDH.damageTypes = { energy: "Energy", explosive: "Explosive", rending: "Rending", impact: "Impact" };

/** Reload duration (key -> label). */
BDH.reload = { free: "Free", half: "Half", full: "Full", twoFull: "2 Full", threeFull: "3 Full" };

/** Weapon qualities (key -> {label, takesValue}). Behaviours are implemented in the attack pipeline later. */
BDH.qualities = {
  tearing:    { label: "Tearing", takesValue: false },
  proven:     { label: "Proven", takesValue: true },
  primitive:  { label: "Primitive", takesValue: true },
  razorSharp: { label: "Razor Sharp", takesValue: false },
  felling:    { label: "Felling", takesValue: true },
  accurate:   { label: "Accurate", takesValue: false },
  storm:      { label: "Storm", takesValue: false },
  twinLinked: { label: "Twin-Linked", takesValue: false },
  reliable:   { label: "Reliable", takesValue: false },
  unreliable: { label: "Unreliable", takesValue: false },
  unwieldy:   { label: "Unwieldy", takesValue: false },
  flexible:   { label: "Flexible", takesValue: false }
};
