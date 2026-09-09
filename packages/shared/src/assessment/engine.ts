import type { Evidence, SkillState, SkillStatus, TaskOutcome } from '../domain/types.js';
import type { ContentId, MechanicId, SkillId } from '../domain/ids.js';
import type { AssessmentPolicy } from './policy.js';

/**
 * The assessment engine.
 *
 * Turns an append-only stream of resolved tasks into a per-skill status and a
 * per-letter "needs reinforcement" flag.
 *
 * SkillState is a DERIVED CACHE, never a source of truth. Everything here is
 * recomputable from the evidence log, which is what lets thresholds be tuned
 * after the first playtest and back-applied to sessions already recorded.
 */

// ── Evidence weighting ────────────────────────────────────────────────────

/**
 * Every resolved task counts as an exposure. What varies is whether it is
 * evidence of mastery, evidence of difficulty, or neither.
 *
 * Two entries deserve their reasoning stated, because getting them wrong is
 * how a system starts punishing children:
 *
 *  - `abandoned` is exposure only. A child leaving the room is not evidence of
 *    difficulty. The previous build's streak counter would have scored it as a
 *    failure.
 *  - anything scaffolded is exposure only, in BOTH directions. A 2-option task
 *    the ladder handed the child cannot show mastery (a coin flip clears 3 in a
 *    row 12.5% of the time) and must not show struggle either — or the system
 *    would penalise its own help.
 */
interface OutcomeWeight {
  readonly mastery: boolean;
  readonly difficulty: number;
}

const OUTCOME_WEIGHTS: Readonly<Record<TaskOutcome, OutcomeWeight>> = {
  first_try_correct: { mastery: true, difficulty: 0 },
  correct_after_retry: { mastery: false, difficulty: 1 },
  correct_after_hint: { mastery: false, difficulty: 1 },
  correct_after_demo: { mastery: false, difficulty: 1.5 },
  abandoned: { mastery: false, difficulty: 0 },
};

function countsForMastery(e: Evidence): boolean {
  return !e.isScaffolded && OUTCOME_WEIGHTS[e.outcome].mastery;
}

function difficultyWeight(e: Evidence): number {
  return e.isScaffolded ? 0 : OUTCOME_WEIGHTS[e.outcome].difficulty;
}

// ── Strategy seam ─────────────────────────────────────────────────────────

export interface ScoringInput {
  readonly childId: string;
  readonly skillId: SkillId;
  readonly contentScopeId: ContentId | null;
  readonly evidence: readonly Evidence[];
  readonly policy: AssessmentPolicy;
  /** Sessions elapsed since an adventure last ran for this content scope. */
  readonly sessionsSinceLastAdventure: number;
  readonly adventuresThisSession: number;
  readonly now: string;
}

/**
 * Pure: same inputs, same output. No clock, no storage, no randomness.
 *
 * Downstream code reads only status / exposures / hintAssisted /
 * needsReinforcement, so a BKT or Elo strategy can be dropped in later without
 * a schema migration or a dashboard change.
 */
export interface ScoringStrategy {
  readonly strategyId: string;
  score(input: ScoringInput): SkillState;
}

// ── The default strategy ──────────────────────────────────────────────────

export const windowedEvidenceStrategy: ScoringStrategy = {
  strategyId: 'windowed_evidence',

  score(input: ScoringInput): SkillState {
    const { evidence, policy } = input;

    // Chronological, so "recent" means what it says.
    const ordered = [...evidence].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

    const exposures = ordered.length;
    const firstTryCorrect = ordered.filter((e) => countsForMastery(e)).length;
    const hintAssisted = ordered.filter(
      (e) => e.outcome === 'correct_after_hint' || e.outcome === 'correct_after_demo',
    ).length;

    const distinctMechanics = [...new Set(ordered.map((e) => e.mechanicId))];

    return {
      childId: input.childId,
      skillId: input.skillId,
      contentScopeId: input.contentScopeId,
      status: deriveStatus(ordered, policy),
      exposures,
      firstTryCorrect,
      hintAssisted,
      distinctMechanics,
      lastOutcomes: ordered.slice(-policy.mastery.window).map((e) => e.outcome),
      needsReinforcement: deriveNeedsReinforcement(ordered, input),
      reinforcedAtSessionId: null,
      policyVersion: policy.version,
      updatedAt: input.now,
    };
  },
};

/**
 * חדש / בתרגול / הצלחה עקבית — spec 1.4 #9, shown verbatim on the parent
 * screen (spec 14.3). Note there is no status meaning "struggling": spec 14.4
 * forbids that vocabulary, and a child who is finding something hard is simply
 * still בתרגול.
 */
function deriveStatus(ordered: readonly Evidence[], policy: AssessmentPolicy): SkillStatus {
  const m = policy.mastery;

  if (ordered.length < m.minExposures) return 'חדש';

  const window = ordered.slice(-m.window);
  const firstTryInWindow = window.filter(countsForMastery).length;

  const mechanicsInWindow = new Set(window.map((e) => e.mechanicId));

  const recent = ordered.slice(-m.noAssistInLastN);
  const recentlyAssisted = recent.some(
    (e) => e.outcome === 'correct_after_hint' || e.outcome === 'correct_after_demo',
  );

  const mastered =
    firstTryInWindow >= m.minFirstTryInWindow &&
    mechanicsInWindow.size >= m.minDistinctMechanics &&
    !recentlyAssisted;

  return mastered ? 'הצלחה עקבית' : 'בתרגול';
}

/**
 * The remedial trigger — spec 1.6 / 10.1.
 *
 * Each clause is load-bearing; the first is the one to point at when asked to
 * prove criterion 3.8 ("no single error may trigger anything").
 */
function deriveNeedsReinforcement(
  ordered: readonly Evidence[],
  input: ScoringInput,
): boolean {
  const d = input.policy.difficulty;

  // 1. Absolute floor. Deliberately redundant with clause 3 so that the
  //    single-error guarantee is a single, testable line rather than an
  //    emergent property of arithmetic.
  if (ordered.length < d.minExposuresBeforeAnyTrigger) return false;

  // 2. Enough recent observations to say anything at all.
  const window = ordered.slice(-d.window);
  if (window.length < d.minExposuresInWindow) return false;

  // 3. Enough of them showed difficulty.
  const struggles = window.filter((e) => difficultyWeight(e) > 0);
  if (struggles.length < d.minNonFirstTryInWindow) return false;

  // 4. Spec 10.1's disjunction: either across mechanics (stronger evidence
  //    that it is the LETTER, not the game), or simply repeatedly.
  const strugglingMechanics = new Set<MechanicId>(struggles.map((e) => e.mechanicId));
  const crossMechanic = strugglingMechanics.size >= d.preferDistinctMechanics;
  const persistent = struggles.length >= d.singleMechanicNonFirstTryThreshold;
  if (!crossMechanic && !persistent) return false;

  // 5. Don't loop an adventure on the same letter — that reads as punishment.
  if (input.sessionsSinceLastAdventure <= d.cooldownSessions) return false;

  // 6. Spec 19 branches into the adventure once per session.
  if (input.adventuresThisSession >= d.maxAdventuresPerSession) return false;

  return true;
}

// ── Convenience: score every scope from one evidence log ───────────────────

export interface ScoreAllOptions {
  readonly childId: string;
  readonly evidence: readonly Evidence[];
  readonly policy: AssessmentPolicy;
  readonly strategy?: ScoringStrategy;
  readonly sessionsSinceLastAdventure?: (scope: ContentId) => number;
  readonly adventuresThisSession?: number;
  readonly now?: string;
}

/**
 * Produces both rollups the product needs from one pass:
 *   - skill scope (contentScopeId null) → the parent screen's status column
 *   - skill x letter scope              → the remedial trigger
 *
 * Keeping these as two scopes of one table, rather than two mechanisms, is what
 * makes "the adventure fired for ר because of visual recognition" a single
 * queryable row.
 */
export function scoreAll(opts: ScoreAllOptions): SkillState[] {
  const strategy = opts.strategy ?? windowedEvidenceStrategy;
  const now = opts.now ?? new Date().toISOString();
  const out: SkillState[] = [];

  const bySkill = new Map<SkillId, Evidence[]>();
  const bySkillAndLetter = new Map<string, Evidence[]>();

  for (const e of opts.evidence) {
    const skillBucket = bySkill.get(e.skillId);
    if (skillBucket) skillBucket.push(e);
    else bySkill.set(e.skillId, [e]);

    if (e.rootLetterId) {
      const key = `${e.skillId} ${e.rootLetterId}`;
      const letterBucket = bySkillAndLetter.get(key);
      if (letterBucket) letterBucket.push(e);
      else bySkillAndLetter.set(key, [e]);
    }
  }

  for (const [skillId, ev] of bySkill) {
    out.push(
      strategy.score({
        childId: opts.childId,
        skillId,
        contentScopeId: null,
        evidence: ev,
        policy: opts.policy,
        // The skill-level rollup never drives the adventure, so these are
        // pinned to values that keep needsReinforcement false at this scope.
        sessionsSinceLastAdventure: 0,
        adventuresThisSession: Number.MAX_SAFE_INTEGER,
        now,
      }),
    );
  }

  for (const [key, ev] of bySkillAndLetter) {
    const [skillId, letterId] = key.split(' ') as [SkillId, ContentId];
    out.push(
      strategy.score({
        childId: opts.childId,
        skillId,
        contentScopeId: letterId,
        evidence: ev,
        policy: opts.policy,
        sessionsSinceLastAdventure: opts.sessionsSinceLastAdventure?.(letterId) ?? 99,
        adventuresThisSession: opts.adventuresThisSession ?? 0,
        now,
      }),
    );
  }

  return out;
}
