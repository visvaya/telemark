import type { HillLook } from "../render/hill-look";
import type { HillProblem, HillRuleLevel, HillSpec } from "./hill-spec";

/**
 * The bounds of a hill's look. Admission bounds are what no hill of the original breaks (measured on its 37 hills,
 * 2026-10-17): its last support ends 0 to 3.5 m before the takeoff, its deck (the flat part and the platform behind
 * the gate) takes 0.022 to 0.141 of K. The style bounds are this project's: the end of the inrun on a support no
 * more than 1 m before the takeoff, as the original's usually is, and a deck of at most 0.10 of K (0.147 looked
 * too long). The generator keeps inside all of them.
 */
export const HILL_LOOK_RULES = {
  /** A hundredth of a metre: lengths of the look are kept to two decimals. */
  slackM: 0.005,
  lastSupportBeforeTakeoffMaxM: 3.5,
  lastSupportBeforeTakeoffStyleMaxM: 1,
  deckShareOfKMin: 0.022,
  deckShareOfKMax: 0.141,
  deckShareOfKStyleMax: 0.1,
} as const;

/** The level of each look rule, as the geometry rules have theirs. */
const LOOK_RULE_LEVELS = {
  /** A support behind the start platform or past the takeoff stands in the air beside the inrun. */
  "supports-under-inrun": "admission",
  /** Supports drawn over one another, or one ending before it starts, are a broken drawing. */
  "supports-in-order": "admission",
  /** An inrun whose end has no support nearby hangs in the air. */
  "inrun-end-supported": "admission",
  /** The original rests the end of its inrun on a support close to the takeoff. */
  "inrun-end-close": "style",
  /** A deck outside the original's range of shares of K looks out of scale. */
  "deck-share": "admission",
  /** A deck past a tenth of K looks too long. */
  "deck-share-short": "style",
} as const satisfies Record<string, HillRuleLevel>;

type LookRule = keyof typeof LOOK_RULE_LEVELS;

const problem = (rule: LookRule, path: string, message: string): HillProblem => ({
  rule: `look.${rule}`,
  path,
  message,
  level: LOOK_RULE_LEVELS[rule],
});

function supportProblems(spec: HillSpec): HillProblem[] {
  const R = HILL_LOOK_RULES;
  const fromXM = spec.look.inrun.platformStartXM;
  const toXM = spec.profile.inrun.takeoffXM;
  return spec.look.supports.flatMap((s, i) => {
    const path = `look.supports.${i}`;
    const previous = spec.look.supports[i - 1];
    return [
      ...(s.fromXM < fromXM - R.slackM || s.toXM > toXM + R.slackM
        ? [
            problem(
              "supports-under-inrun",
              path,
              `support ${s.fromXM}-${s.toXM} m out of the inrun ${fromXM}-${toXM} m`,
            ),
          ]
        : []),
      ...(s.toXM <= s.fromXM || (previous !== undefined && s.fromXM < previous.toXM)
        ? [problem("supports-in-order", path, `support ${s.fromXM}-${s.toXM} m out of order`)]
        : []),
    ];
  });
}

function endAndDeckProblems(spec: HillSpec): HillProblem[] {
  const R = HILL_LOOK_RULES;
  const { takeoffXM, startXM } = spec.profile.inrun;
  const lastToXM = Math.max(...spec.look.supports.map((s) => s.toXM));
  const gapM = takeoffXM - lastToXM;
  const deck = (startXM - spec.look.inrun.platformStartXM) / spec.kPointM;
  const checks: readonly [boolean, LookRule, string, string][] = [
    [
      !(gapM <= R.lastSupportBeforeTakeoffMaxM + R.slackM),
      "inrun-end-supported",
      "look.supports",
      `last support ends ${gapM} m before the takeoff`,
    ],
    [
      !(gapM <= R.lastSupportBeforeTakeoffStyleMaxM + R.slackM),
      "inrun-end-close",
      "look.supports",
      `last support ends ${gapM} m before the takeoff`,
    ],
    [
      !(deck >= R.deckShareOfKMin && deck <= R.deckShareOfKMax),
      "deck-share",
      "look.inrun.platformStartXM",
      `deck ${deck} of K`,
    ],
    [!(deck <= R.deckShareOfKStyleMax), "deck-share-short", "look.inrun.platformStartXM", `deck ${deck} of K`],
  ];
  return checks.filter(([failed]) => failed).map(([, rule, path, message]) => problem(rule, path, message));
}

/**
 * Problems of a hill's look that the scene would show as broken or out of scale, each with its level: supports
 * out of the inrun or out of order, the end of the inrun hanging in the air, a deck out of proportion to K. Empty
 * when the look passes. Own hills pass all of them; the generator refuses a hill that breaks an admission rule.
 */
export function lookProblems(spec: HillSpec): HillProblem[] {
  return [...supportProblems(spec), ...endAndDeckProblems(spec)];
}

/** The supports with any part behind the start platform cut away, so the first stands under the inrun. */
export function supportsUnderInrun(supports: HillLook["supports"], platformStartXM: number): HillLook["supports"] {
  return supports.map((s) => (s.fromXM < platformStartXM ? { ...s, fromXM: platformStartXM } : s));
}
