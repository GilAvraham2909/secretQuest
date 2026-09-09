/**
 * Assessment thresholds.
 *
 * These are DATA, never constants scattered through the engine. After the first
 * child sessions the client will want to move one, and the answer has to be
 * "edit the policy file", not "cut a release". Every SkillState records the
 * policyVersion that produced it, so a status can be explained after the fact
 * and historical sessions can be re-scored when a threshold changes.
 */

export interface MasteryPolicy {
  /** Below this, a skill is always 'חדש' — too little evidence to say anything. */
  readonly minExposures: number;
  /** Rolling window of recent outcomes considered. */
  readonly window: number;
  readonly minFirstTryInWindow: number;
  /**
   * Spec 1.3 AC wants skills tested across more than one mechanic. Requiring
   * two before declaring mastery stops "good at balloons" reading as
   * "knows the letter".
   */
  readonly minDistinctMechanics: number;
  /** Recent assisted successes block mastery, however good the older run was. */
  readonly noAssistInLastN: number;
}

export interface DifficultyPolicy {
  /**
   * Absolute floor. Spec 1.4 #6 and criterion 3.8 forbid concluding anything
   * from a single error, and this is the clause a test points at to prove it.
   */
  readonly minExposuresBeforeAnyTrigger: number;
  readonly window: number;
  readonly minExposuresInWindow: number;
  readonly minNonFirstTryInWindow: number;
  /** Preferred evidence: the same difficulty showing up in two mechanics. */
  readonly preferDistinctMechanics: number;
  /**
   * Spec 10.1 says difficulty counts if it appeared "ביותר ממכניקה אחת, או
   * לאחר מספר ניסיונות" — the spec itself offers the disjunction. Without this
   * fallback, criterion 3.9 would be near-unreachable inside one session,
   * because a given letter appears in only two or three tasks.
   */
  readonly singleMechanicNonFirstTryThreshold: number;
  /** Stops an adventure looping on one letter, which would read as punishment. */
  readonly cooldownSessions: number;
  readonly maxAdventuresPerSession: number;
}

export interface AssessmentPolicy {
  readonly version: string;
  readonly strategyId: string;
  readonly mastery: MasteryPolicy;
  readonly difficulty: DifficultyPolicy;
}

/**
 * The MVP default.
 *
 * Deliberately a counting rule rather than BKT or Elo. BKT needs four
 * calibrated parameters per skill, calibrated from a population; this MVP has
 * five children. With 3 options p-guess is about 0.33, so across the four or
 * five exposures one session gives, the posterior barely leaves its prior — the
 * model would answer "unknown" for everything, which is exactly what criterion
 * 3.9 forbids. Elo needs a population to rank against, and there isn't one.
 *
 * There is also an evidence argument, not just a pragmatic one: the
 * N-consecutive-correct heuristic has been shown to be the optimal stopping
 * policy for BKT variants, so this is not a cheap substitute for the Bayesian
 * model — it is the same decision without the unfittable parameters.
 *
 * And it is explicable. Criterion 3.10 needs a parent to understand the status
 * in seconds: "הצליח 4 מתוך 5 פעמים אחרונות, בשני משחקים שונים" is explicable;
 * "p(mastery) = 0.68" is not.
 */
export const DEFAULT_POLICY: AssessmentPolicy = {
  version: '1.0.0',
  strategyId: 'windowed_evidence',
  mastery: {
    minExposures: 3,
    window: 5,
    minFirstTryInWindow: 4,
    minDistinctMechanics: 2,
    noAssistInLastN: 2,
  },
  difficulty: {
    minExposuresBeforeAnyTrigger: 2,
    window: 4,
    minExposuresInWindow: 3,
    minNonFirstTryInWindow: 2,
    preferDistinctMechanics: 2,
    singleMechanicNonFirstTryThreshold: 3,
    cooldownSessions: 1,
    maxAdventuresPerSession: 1,
  },
};
