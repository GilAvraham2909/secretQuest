import type { SkillId, MechanicId, ContentId, CopyId } from './ids.js';

/**
 * Runtime and telemetry entities.
 *
 * Design rule throughout: the child can never reach a state the type system
 * calls failure. Spec 21 forbids the vocabulary, and spec 1.5's acceptance
 * criterion ("אין מצב שבו הילד נתקע ללא אפשרות להמשיך") is enforced here by
 * simply not giving failure a representation.
 */

// ── Outcomes ──────────────────────────────────────────────────────────────

/**
 * How a task instance ended. Note there is no 'incorrect' — a round always
 * resolves positively; what varies is how much help it took to get there.
 */
export type TaskOutcome =
  | 'first_try_correct' // הצלחה עצמאית בניסיון ראשון
  | 'correct_after_retry' // succeeded later, no hint given
  | 'correct_after_hint' // spec 1.5 requires this be recorded separately
  | 'correct_after_demo' // ladder terminal — assisted to the end
  | 'abandoned'; // child navigated away mid-task

/** Which ladder rung produced a hint. Spec 11. */
export type HintType =
  | 'retry_invite'
  | 'repeat_prompt'
  | 'audio_hint'
  | 'visual_highlight'
  | 'reduce_options'
  | 'demonstrate'
  | 'simpler_task';

export type HintTrigger =
  | 'wrong_selection'
  | 'idle_timeout'
  | 'child_requested'
  | 'declined_then_auto';

// ── Content ───────────────────────────────────────────────────────────────

export interface PresentedOption {
  readonly optionId: string;
  readonly contentId: ContentId;
  readonly isTarget: boolean;
  /** Position as actually rendered, so a session can be replayed faithfully. */
  readonly position: number;
  /** Set when hint step 4 culled this distractor. */
  readonly removedAtLadderStep: number | null;
}

/**
 * The only place the three axes meet. Authored as a data row (CSV), never as
 * code — that is what makes "swap a mechanic without touching skills" a
 * spreadsheet edit rather than a refactor.
 */
export interface TaskTemplate {
  readonly taskId: string; // 'BAL-001' … spec 15
  readonly skillId: SkillId;
  /**
   * Spec 4.5 lists two skill_ids for the balloon game. All listed skills
   * receive evidence; only `skillId` drives adaptation.
   */
  readonly alsoEvidences: readonly SkillId[];
  readonly mechanicId: MechanicId;
  readonly targetContentId: ContentId;
  readonly distractorContentIds: readonly ContentId[];
  readonly defaultOptionCount: 2 | 3 | 4;
  readonly promptCopyId: CopyId;
  readonly feedbackCorrectCopyId: CopyId;
  readonly feedbackRetryCopyId: CopyId;
  readonly hintCopyIds: readonly [CopyId, CopyId];
  /** Spec 1.1(content): the simpler task the ladder falls back to at step 6. */
  readonly simplerTaskId: string | null;
}

// ── Telemetry ─────────────────────────────────────────────────────────────

export interface TaskInstance {
  readonly taskInstanceId: string;
  readonly taskId: string;
  readonly sessionId: string;
  readonly childId: string;
  /** Denormalised deliberately — spec 1.4 #8 requires separate fields so
   *  analysis can tell whether a difficulty belongs to the skill or the
   *  mechanic (criterion 3.11). */
  readonly skillId: SkillId;
  readonly mechanicId: MechanicId;
  readonly targetContentId: ContentId;
  readonly optionsPresented: readonly PresentedOption[];
  readonly optionCount: number;
  /** Set when this instance is a step-6 simplification of another. */
  readonly derivedFromTaskInstanceId: string | null;
  /**
   * Scaffolded instances count as EXPOSURE but never as mastery or difficulty
   * evidence — otherwise the system would punish its own help.
   */
  readonly isScaffolded: boolean;
  readonly adventureRunId: string | null;
  readonly presentedAt: string;
  readonly optionsReadyAt: string | null;
  readonly resolvedAt: string | null;
  readonly outcome: TaskOutcome | null;
}

export interface Attempt {
  readonly attemptId: string;
  readonly taskInstanceId: string;
  readonly attemptNumber: number; // 1-based
  readonly selectedOptionId: string;
  readonly selectedContentId: ContentId;
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
  readonly ladderStepAtAttempt: number;
  readonly occurredAt: string;
}

export interface HintEvent {
  readonly hintEventId: string;
  readonly taskInstanceId: string;
  readonly ladderStep: number;
  readonly hintType: HintType;
  readonly trigger: HintTrigger;
  /** Spec 11 step 3 offers כן / לא עכשיו. Null when never offered as a choice. */
  readonly acceptedByChild: boolean | null;
  readonly occurredAt: string;
}

// ── Derived learner state ─────────────────────────────────────────────────

/** Spec 1.4 #9 and 1.9. These exact three strings reach the parent screen. */
export type SkillStatus = 'חדש' | 'בתרגול' | 'הצלחה עקבית';

export interface SkillState {
  readonly childId: string;
  readonly skillId: SkillId;
  /**
   * null  = skill-level rollup, what the parent screen shows.
   * set   = skill x letter rollup, what the remedial trigger reads, because
   *         spec 10.1 targets a LETTER, not a skill in the abstract.
   */
  readonly contentScopeId: ContentId | null;
  readonly status: SkillStatus;
  readonly exposures: number;
  readonly firstTryCorrect: number;
  readonly hintAssisted: number;
  readonly distinctMechanics: readonly MechanicId[];
  readonly lastOutcomes: readonly TaskOutcome[];
  readonly needsReinforcement: boolean;
  readonly reinforcedAtSessionId: string | null;
  /** Which policy produced this row, so a status can be explained later. */
  readonly policyVersion: string;
  readonly updatedAt: string;
}

/**
 * One resolved task instance, flattened into what the assessment engine needs.
 * The engine reads only this — never the DOM, never a mechanic, never copy.
 */
export interface Evidence {
  readonly taskInstanceId: string;
  readonly skillId: SkillId;
  readonly contentId: ContentId;
  /** The letter this content belongs to; groups evidence across content kinds. */
  readonly rootLetterId: ContentId | null;
  readonly mechanicId: MechanicId;
  readonly outcome: TaskOutcome;
  readonly isScaffolded: boolean;
  readonly sessionId: string;
  readonly occurredAt: string;
}
