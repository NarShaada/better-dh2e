# Better DH2e — Plan 13: Full Skill List + Aptitudes + Specialist Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand to the full 28-skill DH2e list, attach the **two governing aptitudes** to every characteristic and skill (hidden config, for Simple-mode math), and implement **specialist skills** — a specialist skill holds a player-authored list of **specialties**, each its own rollable, favouritable sub-skill with its own rank.

**Architecture:** Config gains aptitudes on characteristics/skills + the specialist flag. The skill schema branches: standard skills keep `{rank,favourite}`; specialist skills get `{specialties:[{name,rank,favourite}]}`. Derived data computes a total per specialty. The Investigation tab renders standard rows and specialist groups (rollable specialty rows in play; name/rank-editable + add/remove in advancement mode). Specialties roll against the parent characteristic and count toward the 3-favourite cap.

**Tech Stack:** Foundry v13 (DataModel `ArrayField`/`SchemaField`, ApplicationV2 actions, named + no-name form inputs), Vitest, Handlebars.

**Scope of THIS plan:** the full skill list, char/skill aptitudes in config, the specialist-skill model + display + roll + favourite + add/edit/remove specialties.

**Out of scope (Plan 14 — Simple mode):** XP cost tables, the buy buttons, charging Free XP. The aptitudes added here are *data only* this plan.

**Reference:** spec §6 (specialist skills: per-specialization advance; "+ add specialization" only in advancement mode; new starts at Known). Aptitude 1 of each skill = its governing characteristic for rolls. **Critical template rule:** top-level flags referenced inside `{{#each}}` MUST use `@root.` (e.g. `{{#if @root.isCustom}}`) — see the `handlebars-root-in-each-loops` memory. Specialty editing uses the established no-name-input + `_onRender` + whole-array-`update` pattern.

---

## Skill data (authoritative)

28 skills; **specialist** = Common Lore, Forbidden Lore, Linguistics, Navigate, Operate, Scholastic Lore, Trade. For each: `characteristic` (= Aptitude 1's characteristic, used for rolls), `aptitudes: [A1, A2]`, `specialist`.

| key | label | characteristic | aptitudes | specialist |
|---|---|---|---|---|
| acrobatics | Acrobatics | agility | Agility, General | – |
| athletics | Athletics | strength | Strength, General | – |
| awareness | Awareness | perception | Perception, Fieldcraft | – |
| charm | Charm | fellowship | Fellowship, Social | – |
| command | Command | fellowship | Fellowship, Leadership | – |
| commerce | Commerce | intelligence | Intelligence, Knowledge | – |
| commonLore | Common Lore | intelligence | Intelligence, Knowledge | ✓ |
| deceive | Deceive | fellowship | Fellowship, Social | – |
| dodge | Dodge | agility | Agility, Defence | – |
| forbiddenLore | Forbidden Lore | intelligence | Intelligence, Knowledge | ✓ |
| inquiry | Inquiry | fellowship | Fellowship, Social | – |
| interrogation | Interrogation | willpower | Willpower, Social | – |
| intimidate | Intimidate | strength | Strength, Social | – |
| linguistics | Linguistics | intelligence | Intelligence, General | ✓ |
| logic | Logic | intelligence | Intelligence, Knowledge | – |
| medicae | Medicae | intelligence | Intelligence, Fieldcraft | – |
| navigate | Navigate | intelligence | Intelligence, Fieldcraft | ✓ |
| operate | Operate | agility | Agility, Fieldcraft | ✓ |
| parry | Parry | weaponSkill | Weapon Skill, Defence | – |
| psyniscience | Psyniscience | perception | Perception, Psyker | – |
| scholasticLore | Scholastic Lore | intelligence | Intelligence, Knowledge | ✓ |
| scrutiny | Scrutiny | perception | Perception, General | – |
| security | Security | intelligence | Intelligence, Tech | – |
| sleightOfHand | Sleight of Hand | agility | Agility, Knowledge | – |
| stealth | Stealth | agility | Agility, Fieldcraft | – |
| survival | Survival | perception | Perception, Fieldcraft | – |
| techUse | Tech-Use | intelligence | Intelligence, Tech | – |
| trade | Trade | intelligence | Intelligence, General | ✓ |

Characteristic aptitudes: weaponSkill `[Weapon Skill, Offence]`, ballisticSkill `[Ballistic Skill, Finesse]`, strength `[Strength, Offence]`, toughness `[Toughness, Defence]`, agility `[Agility, Finesse]`, intelligence `[Intelligence, Knowledge]`, perception `[Perception, Fieldcraft]`, willpower `[Willpower, Psyker]`, fellowship `[Fellowship, Social]`, influence `[]`.

---

## File Structure

```
scripts/config.mjs                       MODIFY  characteristic aptitudes; full 28-skill list (+ aptitudes + specialist)
lang/en.json                             MODIFY  BDH.Skill.* labels for the 14 new skills
scripts/data/actor/base-actor-model.mjs  MODIFY  skillsSchema branches specialist/standard; derived per-specialty total
scripts/helpers/sheet-data.mjs           MODIFY  buildSkills emits standard rows + specialist groups
test/sheet-data.test.mjs                 MODIFY  assert specialist group shape
scripts/rolls/roll-test.mjs              MODIFY  rollSkill(actor, key, specialtyIndex)
scripts/sheets/actor-sheet.mjs           MODIFY  specialty roll/favourite/add/remove + input wiring; favSkills incl. specialties; specialtyRankChoices
templates/actor/actor-sheet.hbs          MODIFY  Investigation: standard rows + specialist groups
styles/better-dh2e.css                   MODIFY  specialist-group styles
```

---

### Task 1: Config — characteristic aptitudes + full skill list + lang

**Files:**
- Modify: `scripts/config.mjs`, `lang/en.json`

- [ ] **Step 1: Characteristic aptitudes.** In `scripts/config.mjs`, replace `BDH.characteristics` with (adds `aptitudes`):

```javascript
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
```

- [ ] **Step 2: Full skill list.** Replace `BDH.skills` with the 28 entries (each `{ label, characteristic, aptitudes, specialist }`):

```javascript
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
```

- [ ] **Step 2b:** Add a specialty-rank ladder constant near `BDH.skillRanks` (used by the specialty schema + the Custom dropdown):
```javascript
/** Specialist-skill specialty ranks (a specialty exists only once owned — no "untrained"). */
BDH.specialtyRanks = ["known", "trained", "experienced", "veteran"];
```

- [ ] **Step 3: Lang.** In `lang/en.json`, under the `BDH.Skill` group (which already has Acrobatics, Athletics, Awareness, Charm, Command, Deceive, Dodge, Inquiry, Logic, Medicae, Parry, Scrutiny, Stealth, Survival), ADD the 14 new labels (keep existing ones):
```json
      "Commerce": "Commerce",
      "CommonLore": "Common Lore",
      "ForbiddenLore": "Forbidden Lore",
      "Interrogation": "Interrogation",
      "Intimidate": "Intimidate",
      "Linguistics": "Linguistics",
      "Navigate": "Navigate",
      "Operate": "Operate",
      "Psyniscience": "Psyniscience",
      "ScholasticLore": "Scholastic Lore",
      "Security": "Security",
      "SleightOfHand": "Sleight of Hand",
      "TechUse": "Tech-Use",
      "Trade": "Trade"
```
(Match the file's existing JSON nesting/key style for `BDH.Skill.*` — whether it's a nested object or flat `"BDH.Skill.X"` keys. Read the file first.)

- [ ] **Step 4: Verify and commit.** Run: `node --check scripts/config.mjs && node -e "JSON.parse(require('fs').readFileSync('lang/en.json'))" && npm test` — Expected: valid; tests PASS (buildSkills/derived tests now iterate 28 skills — they should still pass since stubs default-fill).

```bash
git add scripts/config.mjs lang/en.json
git commit -m "feat: characteristic aptitudes + full 28-skill list (aptitudes + specialist flags) + lang"
```

---

### Task 2: Skill model — specialist branch + per-specialty derived total

**Files:**
- Modify: `scripts/data/actor/base-actor-model.mjs`

- [ ] **Step 1: Branch `skillsSchema()`.** Replace the function body's loop so specialist skills get a `specialties` array instead of a `rank`:

```javascript
function skillsSchema() {
  const schema = {};
  for (const key of Object.keys(BDH.skills)) {
    if (BDH.skills[key].specialist) {
      schema[key] = new fields.SchemaField({
        specialties: new fields.ArrayField(new fields.SchemaField({
          name:      new fields.StringField({ required: true, initial: "" }),
          rank:      new fields.StringField({ required: true, choices: BDH.specialtyRanks, initial: "known" }),
          favourite: new fields.BooleanField({ required: true, initial: false })
        }))
      });
    } else {
      schema[key] = new fields.SchemaField({
        rank:      new fields.StringField({ required: true, choices: Object.keys(BDH.skillRanks), initial: "untrained" }),
        favourite: new fields.BooleanField({ required: true, initial: false })
      });
    }
  }
  return new fields.SchemaField(schema);
}
```

- [ ] **Step 2: Per-specialty derived total.** In `prepareDerivedData`, replace the skills loop:

```javascript
    for (const [key, skill] of Object.entries(this.skills)) {
      const charTotal = this.characteristics[BDH.skills[key].characteristic].total;
      if (BDH.skills[key].specialist) {
        for (const sp of skill.specialties) sp.total = skillTotal(charTotal, sp.rank);
      } else {
        skill.total = skillTotal(charTotal, skill.rank);
      }
    }
```

- [ ] **Step 3: Verify and commit.** Run: `node --check scripts/data/actor/base-actor-model.mjs && npm test`. Expected: no syntax errors; tests PASS.

```bash
git add scripts/data/actor/base-actor-model.mjs
git commit -m "feat: specialist-skill schema (specialties array) + per-specialty derived total"
```

---

### Task 3: buildSkills — standard rows + specialist groups (TDD)

**Files:**
- Modify: `test/sheet-data.test.mjs`, `scripts/helpers/sheet-data.mjs`

- [ ] **Step 1: Update the test.** In `test/sheet-data.test.mjs`, the `skillStub()` provides per-skill data. Add a specialist entry, e.g. inside `skillStub()` set:
```javascript
  o.commonLore = { specialties: [{ name: "Imperium", rank: "trained", total: 55, favourite: true }] };
```
And add tests inside `describe("buildSkills", ...)`:
```javascript
  it("emits a specialist group with specialty rows", () => {
    const list = buildSkills(skillStub());
    const cl = list.find((s) => s.key === "commonLore");
    expect(cl.specialist).toBe(true);
    expect(cl.specialties[0]).toMatchObject({ index: 0, name: "Imperium", rank: "trained", total: 55, favourite: true });
  });
  it("keeps standard skills flat with specialist=false", () => {
    const list = buildSkills(skillStub());
    expect(list.find((s) => s.key === "dodge").specialist).toBe(false);
  });
```

- [ ] **Step 2: Run — verify the new tests FAIL.** `npx vitest run test/sheet-data.test.mjs`.

- [ ] **Step 3: Implement.** Replace `buildSkills` in `scripts/helpers/sheet-data.mjs`:

```javascript
export function buildSkills(skills) {
  return Object.keys(BDH.skills)
    .map((key) => {
      const cfg = BDH.skills[key];
      const s = skills[key] ?? {};
      if (cfg.specialist) {
        return {
          key,
          label: cfg.label,
          specialist: true,
          specialties: (s.specialties ?? []).map((sp, index) => {
            const rank = sp.rank ?? "known";
            const tier = TIER_BY_RANK[rank] ?? 0;
            return { index, name: sp.name ?? "", rank, tier, dots: [0, 1, 2, 3].map((i) => i < tier), total: sp.total ?? 0, favourite: sp.favourite ?? false };
          })
        };
      }
      const rank = s.rank ?? "untrained";
      const tier = TIER_BY_RANK[rank] ?? 0;
      return {
        key,
        label: cfg.label,
        specialist: false,
        rank,
        tier,
        dots: [0, 1, 2, 3].map((i) => i < tier),
        trained: rank !== "untrained",
        total: s.total ?? 0,
        favourite: s.favourite ?? false
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
```

- [ ] **Step 4: Run — verify PASS.** `npx vitest run test/sheet-data.test.mjs` (the prior "carries the favourite flag" test still passes for standard skills).

- [ ] **Step 5: Commit**

```bash
git add test/sheet-data.test.mjs scripts/helpers/sheet-data.mjs
git commit -m "feat: buildSkills emits specialist groups + specialty rows (TDD)"
```

---

### Task 4: Roll — specialty support

**Files:**
- Modify: `scripts/rolls/roll-test.mjs`

- [ ] **Step 1:** Replace `rollSkill` to accept an optional `specialtyIndex` (specialist skills roll the chosen specialty's rank; label includes the specialty name):

```javascript
export async function rollSkill(actor, key, specialtyIndex = null) {
  const skillCfg = CONFIG.BDH.skills[key];
  const skill = actor.system.skills[key];
  let rank;
  let suffix = "";
  if (skillCfg.specialist) {
    const sp = skill.specialties?.[specialtyIndex];
    if (!sp) return null;
    rank = sp.rank;
    suffix = ` (${sp.name})`;
  } else {
    rank = skill.rank;
  }
  const characteristics = Object.keys(CONFIG.BDH.characteristics).map((ck) => ({
    key: ck,
    label: CONFIG.BDH.characteristics[ck].label,
    value: actor.system.characteristics[ck].total,
    selected: ck === skillCfg.characteristic
  }));
  const label = `${game.i18n.localize(skillCfg.label)}${suffix}`;
  const choice = await promptTest({ title: label, characteristics });
  if (!choice) return null;
  const chosen = choice.characteristicKey ?? skillCfg.characteristic;
  const base = skillTotal(actor.system.characteristics[chosen].total, rank);
  const short = CONFIG.BDH.characteristics[chosen].short;
  return performTest(actor, { label: `${label} (${short})`, base, modifier: choice.modifier });
}
```

- [ ] **Step 2: Verify and commit.** Run: `node --check scripts/rolls/roll-test.mjs && npm test`.

```bash
git add scripts/rolls/roll-test.mjs
git commit -m "feat: rollSkill supports specialist specialties (parent characteristic, named label)"
```

---

### Task 5: Sheet — specialty actions, favourites, input wiring, favSkills

**Files:**
- Modify: `scripts/sheets/actor-sheet.mjs`

- [ ] **Step 1: `#onRollSkill`** — read an optional specialty index from the row:

```javascript
  static async #onRollSkill(event, target) {
    const row = target.closest("[data-skill]");
    const key = row?.dataset.skill;
    const sp = row?.dataset.specialty;
    await rollSkill(this.document, key, sp != null ? Number(sp) : null);
  }
```

- [ ] **Step 2: `#onToggleSkillFavourite`** — handle specialties + count all favourites (standard + specialty) for the 3-cap:

```javascript
  static async #onToggleSkillFavourite(event, target) {
    const row = target.closest("[data-skill]");
    const key = row?.dataset.skill;
    if (!key) return;
    const sp = row?.dataset.specialty;
    const skills = this.actor.system.skills;
    const favCount = Object.entries(skills).reduce((n, [k, s]) =>
      CONFIG.BDH.skills[k].specialist
        ? n + (s.specialties?.filter((x) => x.favourite).length ?? 0)
        : n + (s.favourite ? 1 : 0), 0);
    if (sp != null) {
      const list = foundry.utils.deepClone(skills[key].specialties);
      const next = !list[Number(sp)].favourite;
      if (next && favCount >= 3) { ui.notifications.warn("You can favourite at most 3 skills."); return; }
      list[Number(sp)].favourite = next;
      await this.actor.update({ [`system.skills.${key}.specialties`]: list });
    } else {
      const next = !skills[key].favourite;
      if (next && favCount >= 3) { ui.notifications.warn("You can favourite at most 3 skills."); return; }
      await this.actor.update({ [`system.skills.${key}.favourite`]: next });
    }
  }
```

- [ ] **Step 3: Add specialty add/remove handlers** (after `#onToggleSkillFavourite`):

```javascript
  /** Action: add a blank specialty (starts at Known) to a specialist skill. */
  static async #onAddSpecialty(event, target) {
    const key = target.dataset.skill;
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    list.push({ name: "New Specialty", rank: "known", favourite: false });
    await this.actor.update({ [`system.skills.${key}.specialties`]: list });
  }

  /** Action: remove a specialty by index. */
  static async #onRemoveSpecialty(event, target) {
    const key = target.dataset.skill;
    const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
    list.splice(Number(target.dataset.specialty), 1);
    await this.actor.update({ [`system.skills.${key}.specialties`]: list });
  }
```

- [ ] **Step 4: Register actions.** In `DEFAULT_OPTIONS.actions`, add (comma the previous):
```javascript
      addSpecialty: DarkHeresyActorSheet.#onAddSpecialty,
      removeSpecialty: DarkHeresyActorSheet.#onRemoveSpecialty
```

- [ ] **Step 5: Wire specialty name/rank inputs** in `_onRender` (after the existing `.bdh-aff-input` loop):
```javascript
    for (const input of this.element.querySelectorAll(".bdh-spec-input")) {
      input.addEventListener("change", (event) => {
        const el = event.currentTarget;
        const key = el.dataset.skill;
        const idx = Number(el.dataset.specialty);
        const list = foundry.utils.deepClone(this.actor.system.skills[key].specialties);
        if (list[idx]) {
          list[idx][el.dataset.field] = el.value;
          this.actor.update({ [`system.skills.${key}.specialties`]: list });
        }
      });
    }
```

- [ ] **Step 6: `favSkills` context + `specialtyRankChoices`.** Replace the existing `context.favSkills = ...` line (the Combat favourite-skills builder) with a version that includes specialty favourites and pre-localizes the label:
```javascript
    const favSkills = [];
    for (const [key, s] of Object.entries(sys.skills)) {
      if (BDH.skills[key].specialist) {
        (s.specialties ?? []).forEach((sp, i) => {
          if (sp.favourite) favSkills.push({ key, specialty: i, label: `${game.i18n.localize(BDH.skills[key].label)} (${sp.name})`, total: sp.total });
        });
      } else if (s.favourite) {
        favSkills.push({ key, specialty: null, label: game.i18n.localize(BDH.skills[key].label), total: s.total });
      }
    }
    context.favSkills = favSkills;
    context.specialtyRankChoices = { known: "Known +0", trained: "Trained +10", experienced: "Experienced +20", veteran: "Veteran +30" };
```
(`game.i18n` is a Foundry runtime global, available in `_prepareContext`.)

- [ ] **Step 7: Verify and commit.** Run: `node --check scripts/sheets/actor-sheet.mjs && npm test`.

```bash
git add scripts/sheets/actor-sheet.mjs
git commit -m "feat: specialty roll/favourite/add/remove + input wiring; favSkills incl. specialties; specialtyRankChoices"
```

---

### Task 6: Investigation template — standard rows + specialist groups

**Files:**
- Modify: `templates/actor/actor-sheet.hbs`

- [ ] **Step 1: Wrap the skills loop body in a specialist/standard branch.** The current loop is:

```handlebars
        {{#each skills as |s|}}
          <div class="skill {{#unless s.trained}}untrained{{/unless}}" {{#unless @root.isCustom}}data-action="rollSkill"{{/unless}} data-skill="{{s.key}}">
            <a class="bdh-fav {{#if s.favourite}}on{{/if}}" data-action="toggleSkillFavourite" title="Favourite">★</a>
            <span class="snm">{{localize s.label}}</span>
            <span class="tier">{{#each s.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
            {{#if @root.isCustom}}
              <select class="sval bdh-edit" name="system.skills.{{s.key}}.rank">{{selectOptions @root.rankChoices selected=s.rank}}</select>
            {{else}}
              <span class="sval">{{s.total}}</span>
            {{/if}}
          </div>
        {{/each}}
```
Replace the whole `{{#each skills as |s|}}` … `{{/each}}` block with:

```handlebars
        {{#each skills as |s|}}
          {{#if s.specialist}}
            <div class="skill-group">
              <div class="skill-group-head"><span>{{localize s.label}}</span>{{#if @root.isCustom}}<button type="button" class="bdh-add" data-action="addSpecialty" data-skill="{{s.key}}" title="Add specialty">＋</button>{{/if}}</div>
              {{#each s.specialties as |sp|}}
                <div class="skill specialty" {{#unless @root.isCustom}}data-action="rollSkill"{{/unless}} data-skill="{{s.key}}" data-specialty="{{sp.index}}">
                  <a class="bdh-fav {{#if sp.favourite}}on{{/if}}" data-action="toggleSkillFavourite" data-skill="{{s.key}}" data-specialty="{{sp.index}}" title="Favourite">★</a>
                  {{#if @root.isCustom}}
                    <input class="snm bdh-edit bdh-spec-input" type="text" data-skill="{{s.key}}" data-specialty="{{sp.index}}" data-field="name" value="{{sp.name}}" placeholder="Specialty"/>
                    <select class="sval bdh-edit bdh-spec-input" data-skill="{{s.key}}" data-specialty="{{sp.index}}" data-field="rank">{{selectOptions @root.specialtyRankChoices selected=sp.rank}}</select>
                    <a class="bdh-del" data-action="removeSpecialty" data-skill="{{s.key}}" data-specialty="{{sp.index}}" title="Remove">✖</a>
                  {{else}}
                    <span class="snm">{{sp.name}}</span>
                    <span class="tier">{{#each sp.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
                    <span class="sval">{{sp.total}}</span>
                  {{/if}}
                </div>
              {{/each}}
              {{#unless s.specialties.length}}<div class="bdh-empty">{{#if @root.isCustom}}Press ＋ to add a specialty.{{else}}—{{/if}}</div>{{/unless}}
            </div>
          {{else}}
            <div class="skill {{#unless s.trained}}untrained{{/unless}}" {{#unless @root.isCustom}}data-action="rollSkill"{{/unless}} data-skill="{{s.key}}">
              <a class="bdh-fav {{#if s.favourite}}on{{/if}}" data-action="toggleSkillFavourite" title="Favourite">★</a>
              <span class="snm">{{localize s.label}}</span>
              <span class="tier">{{#each s.dots as |d|}}<i class="{{#if d}}on{{/if}}"></i>{{/each}}</span>
              {{#if @root.isCustom}}
                <select class="sval bdh-edit" name="system.skills.{{s.key}}.rank">{{selectOptions @root.rankChoices selected=s.rank}}</select>
              {{else}}
                <span class="sval">{{s.total}}</span>
              {{/if}}
            </div>
          {{/if}}
        {{/each}}
```

- [ ] **Step 2: Combat favourite-skills label** — the favSkills label is now pre-localized (Task 5). Change the favSkills name span from `{{localize s.label}}` to `{{s.label}}`, and add the specialty index to the row so the roll works. Find (in the Combat "Favourite Skills" section):
```handlebars
              <div class="bdh-item-row" data-skill="{{s.key}}">
                <span class="bdh-name" data-action="rollSkill">{{localize s.label}}</span>
```
and change to:
```handlebars
              <div class="bdh-item-row" data-skill="{{s.key}}" data-specialty="{{s.specialty}}">
                <span class="bdh-name" data-action="rollSkill">{{s.label}}</span>
```
(When `s.specialty` is null the attribute renders empty; `#onRollSkill` treats a missing/empty specialty as a standard roll. For a specialty favourite it carries the index.)

- [ ] **Step 3: Commit**

```bash
git add templates/actor/actor-sheet.hbs
git commit -m "feat: Investigation specialist groups (rollable specialties; add/edit/remove in Custom) + Combat favourite-specialty rolls"
```

---

### Task 7: Styles

**Files:**
- Modify: `styles/better-dh2e.css` (append)

- [ ] **Step 1: Append:**

```css

/* Specialist skill groups */
.better-dh2e .skill-group { break-inside:avoid; margin:2px 0 4px; }
.better-dh2e .skill-group-head { display:flex; align-items:center; gap:6px; font-weight:bold; color:var(--bdh-maroon); font-size:12px; border-bottom:1px solid #c9b896; }
.better-dh2e .skill-group-head .bdh-add { margin-left:auto; }
.better-dh2e .skill.specialty { padding-left:12px; }
.better-dh2e .skill.specialty .snm.bdh-edit { width:45%; }
.better-dh2e .skill.specialty input.snm { font-size:12px; }
```

- [ ] **Step 2: Commit**

```bash
git add styles/better-dh2e.css
git commit -m "feat: specialist skill-group styles"
```

---

### Task 8: Deploy & browser verification

**Files:** none.

- [ ] **Step 1: Deploy** — `npm run deploy`.
- [ ] **Step 2: Restart** — `sshpass -f /tmp/.dhpw ssh -o StrictHostKeyChecking=accept-new root@76.13.45.240 'pm2 restart foundryvtt'`.
- [ ] **Step 3: Manual browser checklist** (BDH Test World → "Daren Vholk (Test Acolyte)" → Stats → **Investigation**):
- [ ] The full **28-skill** list shows, alphabetical, with the **7 specialist** skills (Common Lore, Forbidden Lore, Linguistics, Navigate, Operate, Scholastic Lore, Trade) rendered as **groups** (empty, showing "—").
- [ ] Standard skills still roll on click and (in **Custom**) show rank dropdowns — unchanged.
- [ ] Turn **Custom** on → each specialist group shows a **＋**; press it on Common Lore → a specialty row appears with an editable **name** + **rank dropdown** (Known…Veteran) + ✖. Name it "Imperium", set Trained → switch tabs and back, it persists; ✖ removes it.
- [ ] Turn **Custom off** → the specialty shows as a **rollable row** "Imperium" with its total; clicking it opens the roll dialog labelled **"Common Lore (Imperium)"** defaulting to the Int characteristic.
- [ ] **Star** the specialty → it appears on **Combat → Favourite Skills** as "Common Lore (Imperium)"; clicking it there rolls. Confirm the **3-skill cap** counts specialties (a 4th favourite warns).
- [ ] **F12 console**: no errors.

- [ ] **Step 4:** Commit any fix needed.

---

## Self-Review

**Coverage:**
- Char + skill aptitudes in config (hidden data for Simple) → Task 1. ✓
- Full 28-skill list + lang → Task 1. ✓
- Specialist model (specialties array; no parent rank) → Task 2. ✓
- buildSkills standard + specialist groups → Task 3 (TDD). ✓
- Specialty roll (parent char, named) → Task 4. ✓
- Specialty favourite (3-cap incl. specialties), add/remove, name/rank edit → Task 5. ✓
- Investigation groups + Combat favourite-specialty rolls → Task 6. ✓

**Deferred (declared):** Simple-mode costs/buttons use these aptitudes in Plan 14.

**Placeholder scan:** complete; checklist concrete (Common Lore → Imperium → Trained; cap counts specialties).

**Type/name consistency:** `BDH.skills[key].{aptitudes,specialist}` + `BDH.specialtyRanks` added in Task 1, consumed by the schema (Task 2), buildSkills (Task 3), rollSkill (Task 4), and the sheet (Task 5). Specialist skills have NO `rank`/`total` on the parent — only `specialties[]`; nothing reads a parent rank (derived loop + buildSkills branch on `specialist`). Actions `addSpecialty`/`removeSpecialty` match `DEFAULT_OPTIONS.actions`, handlers, template `data-action`. `.bdh-spec-input` (no `name`) wired in `_onRender` (whole-array update). **All top-level flags inside `{{#each}}` use `@root.`** (isCustom, rankChoices, specialtyRankChoices) per the memory. favSkills labels pre-localized → template uses `{{s.label}}` (not `{{localize}}`). `data-specialty` distinguishes specialty rows; `#onRollSkill`/`#onToggleSkillFavourite` read it via `closest("[data-skill]")`.
