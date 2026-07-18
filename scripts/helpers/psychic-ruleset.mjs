// scripts/helpers/psychic-ruleset.mjs — resolves the Psychic Rules setting.
// makePsychicRuleset is PURE (helper imports only) and unit-tested; the wrappers below read
// game.settings. This module is the ONLY place the dh2/bc psychic-manifestation branch lives —
// manifest.mjs consumes the returned ruleset object and stays ruleset-agnostic.
import {
  maxPush, manifestState, fetterPushModifier, phenomenaTriggers, phenomenaModifier,
  bcMaxPush, bcFetteredPR, bcPhenomenaTriggers, bcPhenomenaModifier,
} from "./psychic-manifest.mjs";

/** Build the psychic ruleset object for "dh2" or "bc". */
export function makePsychicRuleset(key) {
  if (key === "bc") {
    return {
      key: "bc",
      maxPush: bcMaxPush,
      // Fettered (half PR, not for daemonic) / Unfettered (default) / Push +1..+max.
      castOptions: (normalPR, psykerClass) => {
        const opts = [];
        if (psykerClass !== "daemonic") {
          const f = bcFetteredPR(normalPR);
          opts.push({ state: "fettered", statePR: f, label: `Fettered — PR ${f}` });
        }
        opts.push({ state: "normal", statePR: normalPR, label: `Unfettered — PR ${normalPR}`, selected: true });
        for (let i = 1; i <= bcMaxPush(psykerClass); i++) {
          opts.push({ state: "pushed", statePR: normalPR + i, label: `Push +${i} — PR ${normalPR + i}` });
        }
        return opts;
      },
      // BC: flat +5 per point of EFFECTIVE PR (includes the PR bonus); no fetter/push focus mods.
      focusModifier: (state, statePR, normalPR, effectivePR) => 5 * effectivePR,
      phenomenaTriggers: bcPhenomenaTriggers,
      phenomenaModifier: bcPhenomenaModifier,
    };
  }
  return {
    key: "dh2",
    maxPush,
    // The per-point ladder: every rung 1..PR+maxPush, labelled with its fetter/push focus mod.
    castOptions: (normalPR, psykerClass) => {
      const opts = [];
      for (let pr = 1; pr <= normalPR + maxPush(psykerClass); pr++) {
        const st = manifestState(pr, normalPR);
        const m = fetterPushModifier(pr, normalPR);
        const tag = st === "normal" ? "Normal" : st === "fettered" ? `Fettered +${m}` : `Push ${m}`;
        opts.push({ state: st, statePR: pr, label: `PR ${pr} — ${tag}`, selected: pr === normalPR });
      }
      return opts;
    },
    // DH2: +10/pt fettered, −10/pt pushed, measured against the chosen rung (bonus-independent).
    focusModifier: (state, statePR, normalPR, effectivePR) => fetterPushModifier(statePR, normalPR),
    phenomenaTriggers,
    phenomenaModifier,
  };
}

/** True when the world runs Black Crusade manifestation rules. */
export function bcPsychic() {
  return game.settings.get("better-dh2e", "psychicRules") === "bc";
}

/** The active psychic ruleset per the world setting. */
export function psychicRuleset() {
  return makePsychicRuleset(bcPsychic() ? "bc" : "dh2");
}
