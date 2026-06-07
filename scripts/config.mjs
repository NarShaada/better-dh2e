/** Static configuration for the Better DH2e system. Plain data only — no Foundry calls. */
export const BDH = {};

/** The ten characteristics, in sheet order. `short` is the FFG abbreviation. */
BDH.characteristics = {
  weaponSkill:    { label: "BDH.Char.WeaponSkill",    short: "WS",  aptitudes: ["Weapon Skill", "Offence"] },
  ballisticSkill: { label: "BDH.Char.BallisticSkill", short: "BS",  aptitudes: ["Ballistic Skill", "Finesse"] },
  strength:       { label: "BDH.Char.Strength",       short: "S",   aptitudes: ["Strength", "Offence"] },
  toughness:      { label: "BDH.Char.Toughness",      short: "T",   aptitudes: ["Toughness", "Defence"] },
  agility:        { label: "BDH.Char.Agility",        short: "Ag",  aptitudes: ["Agility", "Finesse"] },
  intelligence:   { label: "BDH.Char.Intelligence",   short: "Int", aptitudes: ["Intelligence", "Knowledge"] },
  perception:     { label: "BDH.Char.Perception",     short: "Per", aptitudes: ["Perception", "Fieldcraft"] },
  willpower:      { label: "BDH.Char.Willpower",       short: "WP",  aptitudes: ["Willpower", "Psyker"] },
  fellowship:     { label: "BDH.Char.Fellowship",     short: "Fel", aptitudes: ["Fellowship", "Social"] },
  influence:      { label: "BDH.Char.Influence",      short: "Inf", aptitudes: [] }
};

/** Skill rank -> flat bonus added to the governing characteristic. */
BDH.skillRanks = {
  untrained:   -20,
  known:         0,
  trained:      10,
  experienced:  20,
  veteran:      30
};

/** Specialist-skill specialty ranks (a specialty exists only once owned — no "untrained"). */
BDH.specialtyRanks = ["known", "trained", "experienced", "veteran"];

/** XP cost tables, keyed by aptitude-match count (0/1/2), arrays indexed by advance level. */
BDH.xpCosts = {
  characteristic: { 2: [100, 250, 500, 750, 1250], 1: [250, 500, 750, 1000, 1500], 0: [500, 750, 1000, 1500, 2500] },
  skill:          { 2: [100, 200, 300, 400],        1: [200, 400, 600, 800],         0: [300, 600, 900, 1200] },
  talent:         { 2: [200, 300, 400],             1: [300, 450, 600],              0: [600, 900, 1200] }
};

/** Full 28-skill list with governing characteristic, aptitudes, and specialist flag. */
BDH.skills = {
  acrobatics:     { label: "BDH.Skill.Acrobatics",     characteristic: "agility",      aptitudes: ["Agility", "General"],        specialist: false },
  athletics:      { label: "BDH.Skill.Athletics",      characteristic: "strength",     aptitudes: ["Strength", "General"],       specialist: false },
  awareness:      { label: "BDH.Skill.Awareness",      characteristic: "perception",   aptitudes: ["Perception", "Fieldcraft"],  specialist: false },
  charm:          { label: "BDH.Skill.Charm",          characteristic: "fellowship",   aptitudes: ["Fellowship", "Social"],      specialist: false },
  command:        { label: "BDH.Skill.Command",        characteristic: "fellowship",   aptitudes: ["Fellowship", "Leadership"],  specialist: false },
  commerce:       { label: "BDH.Skill.Commerce",       characteristic: "intelligence", aptitudes: ["Intelligence", "Knowledge"], specialist: false },
  commonLore:     { label: "BDH.Skill.CommonLore",     characteristic: "intelligence", aptitudes: ["Intelligence", "Knowledge"], specialist: true },
  deceive:        { label: "BDH.Skill.Deceive",        characteristic: "fellowship",   aptitudes: ["Fellowship", "Social"],      specialist: false },
  dodge:          { label: "BDH.Skill.Dodge",          characteristic: "agility",      aptitudes: ["Agility", "Defence"],        specialist: false },
  forbiddenLore:  { label: "BDH.Skill.ForbiddenLore",  characteristic: "intelligence", aptitudes: ["Intelligence", "Knowledge"], specialist: true },
  inquiry:        { label: "BDH.Skill.Inquiry",        characteristic: "fellowship",   aptitudes: ["Fellowship", "Social"],      specialist: false },
  interrogation:  { label: "BDH.Skill.Interrogation",  characteristic: "willpower",    aptitudes: ["Willpower", "Social"],       specialist: false },
  intimidate:     { label: "BDH.Skill.Intimidate",     characteristic: "strength",     aptitudes: ["Strength", "Social"],        specialist: false },
  linguistics:    { label: "BDH.Skill.Linguistics",    characteristic: "intelligence", aptitudes: ["Intelligence", "General"],   specialist: true },
  logic:          { label: "BDH.Skill.Logic",          characteristic: "intelligence", aptitudes: ["Intelligence", "Knowledge"], specialist: false },
  medicae:        { label: "BDH.Skill.Medicae",        characteristic: "intelligence", aptitudes: ["Intelligence", "Fieldcraft"], specialist: false },
  navigate:       { label: "BDH.Skill.Navigate",       characteristic: "intelligence", aptitudes: ["Intelligence", "Fieldcraft"], specialist: true },
  operate:        { label: "BDH.Skill.Operate",        characteristic: "agility",      aptitudes: ["Agility", "Fieldcraft"],     specialist: true },
  parry:          { label: "BDH.Skill.Parry",          characteristic: "weaponSkill",  aptitudes: ["Weapon Skill", "Defence"],   specialist: false },
  psyniscience:   { label: "BDH.Skill.Psyniscience",   characteristic: "perception",   aptitudes: ["Perception", "Psyker"],      specialist: false },
  scholasticLore: { label: "BDH.Skill.ScholasticLore", characteristic: "intelligence", aptitudes: ["Intelligence", "Knowledge"], specialist: true },
  scrutiny:       { label: "BDH.Skill.Scrutiny",       characteristic: "perception",   aptitudes: ["Perception", "General"],     specialist: false },
  security:       { label: "BDH.Skill.Security",       characteristic: "intelligence", aptitudes: ["Intelligence", "Tech"],      specialist: false },
  sleightOfHand:  { label: "BDH.Skill.SleightOfHand",  characteristic: "agility",      aptitudes: ["Agility", "Knowledge"],      specialist: false },
  stealth:        { label: "BDH.Skill.Stealth",        characteristic: "agility",      aptitudes: ["Agility", "Fieldcraft"],     specialist: false },
  survival:       { label: "BDH.Skill.Survival",       characteristic: "perception",   aptitudes: ["Perception", "Fieldcraft"],  specialist: false },
  techUse:        { label: "BDH.Skill.TechUse",        characteristic: "intelligence", aptitudes: ["Intelligence", "Tech"],      specialist: false },
  trade:          { label: "BDH.Skill.Trade",          characteristic: "intelligence", aptitudes: ["Intelligence", "General"],   specialist: true }
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

/** Weapon qualities (key -> {label, takesValue, automation}). `automation`: "full" = black gear (fully automated),
 *  "partial" = red gear (mostly automated, minor manual input e.g. consult a table), absent = no gear (display-only, just flagged). */
BDH.qualities = {
  tearing:    { label: "Tearing", takesValue: false, automation: "full" },
  proven:     { label: "Proven", takesValue: true, automation: "full" },
  primitive:  { label: "Primitive", takesValue: true, automation: "full" },
  razorSharp: { label: "Razor Sharp", takesValue: false, automation: "full" },
  powerField: { label: "Power Field", takesValue: false },
  felling:    { label: "Felling", takesValue: true, automation: "full" },
  accurate:   { label: "Accurate", takesValue: false, automation: "full" },
  storm:      { label: "Storm", takesValue: false, automation: "full" },
  twinLinked: { label: "Twin-Linked", takesValue: false, noteOn: "attack" },
  reliable:   { label: "Reliable", takesValue: false, automation: "full" },
  unreliable: { label: "Unreliable", takesValue: false, automation: "full" },
  unwieldy:   { label: "Unwieldy", takesValue: false, automation: "full" },
  flexible:   { label: "Flexible", takesValue: false, automation: "full" },
  balanced:   { label: "Balanced", takesValue: false, automation: "full" },
  unbalanced: { label: "Unbalanced", takesValue: false, automation: "full" },
  shocking:   { label: "Shocking", takesValue: false, automation: "full" },
  blast:      { label: "Blast", takesValue: true, noteOn: "attack" },
  concussive: { label: "Concussive", takesValue: true, automation: "full" },
  corrosive:  { label: "Corrosive", takesValue: false, noteOn: "damage" },
  crippling:  { label: "Crippling", takesValue: true, noteOn: "damage" },
  defensive:  { label: "Defensive", takesValue: false, automation: "full" },
  flame:         { label: "Flame", takesValue: false, automation: "full" },
  force:         { label: "Force", takesValue: false },
  graviton:      { label: "Graviton", takesValue: false, automation: "full" },
  hallucinogenic:{ label: "Hallucinogenic", takesValue: true, automation: "partial" },
  haywire:    { label: "Haywire", takesValue: true, noteOn: "attack" },
  inaccurate: { label: "Inaccurate", takesValue: false, automation: "full" },
  indirect:   { label: "Indirect", takesValue: true, noteOn: "attack" },
  lance:      { label: "Lance", takesValue: false, automation: "full" },
  melta:      { label: "Melta", takesValue: false, automation: "full" },
  overheats:  { label: "Overheats", takesValue: false, automation: "full" },
  maximal:    { label: "Maximal", takesValue: false, automation: "full" },
  recharge:   { label: "Recharge", takesValue: false, noteOn: "attack" },
  sanctified: { label: "Sanctified", takesValue: false },
  scatter:    { label: "Scatter", takesValue: false, automation: "full" },
  smoke:      { label: "Smoke", takesValue: true, noteOn: "attack" },
  snare:      { label: "Snare", takesValue: true, automation: "full" },
  spray:      { label: "Spray", takesValue: false, noteOn: "attack" },
  toxic:      { label: "Toxic", takesValue: true, automation: "partial" },
  vengeful:   { label: "Vengeful", takesValue: true, automation: "full" },
};

/** Aim bonuses. */
BDH.aimOptions = { none: { label: "None", mod: 0 }, half: { label: "Half Aim +10", mod: 10 }, full: { label: "Full Aim +20", mod: 20 } };

/** Range bands (ranged only). */
BDH.rangeOptions = {
  pointBlank: { label: "Point-Blank +30", mod: 30 }, short: { label: "Short +10", mod: 10 },
  normal: { label: "Normal", mod: 0 }, long: { label: "Long −10", mod: -10 }, extreme: { label: "Extreme −30", mod: -30 }
};

/** Attack types. `scope`: any|melee|ranged. `hits`: single, or multi with `dosPer`. `rof`: which weapon RoF caps multi-hits (null = uncapped, melee). */
BDH.attackTypes = {
  standard:   { label: "Standard",        mod: 10,  scope: "any",    hits: { mode: "single" } },
  calledShot: { label: "Called Shot",     mod: -20, scope: "any",    hits: { mode: "single" }, calledShot: true },
  allOut:     { label: "All-Out Attack",  mod: 30,  scope: "melee",  hits: { mode: "single" } },
  charge:     { label: "Charge",          mod: 20,  scope: "melee",  hits: { mode: "single" } },
  semiAuto:   { label: "Semi-Auto Burst", mod: 0,   scope: "ranged", hits: { mode: "multi", dosPer: 2 }, rof: "short" },
  fullAuto:   { label: "Full-Auto Burst", mod: -10, scope: "ranged", hits: { mode: "multi", dosPer: 1 }, rof: "long" },
  swift:      { label: "Swift Attack",    mod: 0,   scope: "melee",  hits: { mode: "multi", dosPer: 2 }, rof: null },
  lightning:  { label: "Lightning Attack",mod: -10, scope: "melee",  hits: { mode: "multi", dosPer: 1 }, rof: null }
};

/** Hit-location display labels. */
BDH.hitLocationLabels = { head: "Head", rightArm: "Right Arm", leftArm: "Left Arm", body: "Body", rightLeg: "Right Leg", leftLeg: "Left Leg" };
