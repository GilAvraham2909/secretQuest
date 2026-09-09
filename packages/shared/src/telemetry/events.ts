import type { SkillId, MechanicId, ContentId } from '../domain/ids.js';
import type { TaskOutcome, HintType, HintTrigger } from '../domain/types.js';

/**
 * The telemetry event envelope — architecture §6.4.
 *
 * WHY EVENTS AND NOT "SYNC THE PROFILE"
 * =====================================
 * The previous app did read-modify-write of one JSON blob per change. Two
 * devices, or one device with a stale tab, produce last-write-wins data loss.
 * An append-only log has no merge conflict by construction: two devices produce
 * a union, and all derived state is recomputed from the union. For a project
 * whose entire purpose is collecting research data, losing data to a merge is
 * the worst failure available.
 *
 * WHY THIS LIVES IN `shared`
 * ==========================
 * The client writes these and the server reads them. A type that exists twice
 * is a type that drifts, and the failure mode is silent: an event that no
 * longer parses is a child's session quietly missing from the study. The server
 * layers Zod validation on top of these types at its boundary — the types are
 * the agreement, the schemas are the enforcement.
 */

export type EventType =
  | 'session.started'
  | 'session.ended'
  | 'profile.created'
  | 'avatar.chosen'
  | 'task.presented'
  | 'task.options_ready'
  | 'task.resolved'
  | 'task.abandoned'
  | 'attempt.recorded'
  | 'hint.emitted'
  | 'hint.offered'
  | 'hint.declined'
  | 'adventure.started'
  | 'adventure.step_completed'
  | 'adventure.completed'
  | 'reward.granted'
  | 'world.item_unlocked'
  | 'world.item_placed'
  | 'screen.viewed'
  | 'interaction.breadcrumb';

export const ALL_EVENT_TYPES: readonly EventType[] = [
  'session.started', 'session.ended',
  'profile.created', 'avatar.chosen',
  'task.presented', 'task.options_ready', 'task.resolved', 'task.abandoned',
  'attempt.recorded',
  'hint.emitted', 'hint.offered', 'hint.declined',
  'adventure.started', 'adventure.step_completed', 'adventure.completed',
  'reward.granted', 'world.item_unlocked', 'world.item_placed',
  'screen.viewed', 'interaction.breadcrumb',
] as const;

/**
 * Spec 1.4 #8 requires skill and mechanic to be separate recorded fields so
 * analysis can tell whether a difficulty belongs to the skill or to the way it
 * was presented — that is criterion 3.11, and it is why these are denormalised
 * onto the event rather than joined back through the task template.
 */
export interface TaskPresentedPayload {
  readonly taskInstanceId: string;
  readonly taskId: string;
  readonly skillId: SkillId;
  readonly mechanicId: MechanicId;
  readonly targetContentId: ContentId;
  readonly optionCount: number;
  readonly optionsPresented: readonly {
    readonly optionId: string;
    readonly contentId: ContentId;
    readonly isTarget: boolean;
    readonly position: number;
  }[];
  readonly isScaffolded: boolean;
  readonly derivedFromTaskInstanceId: string | null;
  readonly adventureRunId: string | null;
}

export interface TaskResolvedPayload {
  readonly taskInstanceId: string;
  readonly outcome: TaskOutcome;
  readonly resolvedAt: string;
}

export interface AttemptRecordedPayload {
  readonly taskInstanceId: string;
  readonly attemptId: string;
  readonly attemptNumber: number;
  readonly selectedOptionId: string;
  readonly selectedContentId: ContentId;
  /**
   * The client's opinion. The server re-derives it from selectedContentId
   * against the task's target and stores its own — architecture §6.2. A
   * tampered client can corrupt its own child's experience but not the
   * research data.
   */
  readonly isCorrect: boolean;
  readonly responseTimeMs: number;
  readonly ladderStepAtAttempt: number;
}

export interface HintEmittedPayload {
  readonly taskInstanceId: string;
  readonly hintEventId: string;
  readonly ladderStep: number;
  readonly hintType: HintType;
  readonly trigger: HintTrigger;
  readonly acceptedByChild: boolean | null;
}

export interface SessionStartedPayload {
  readonly clientAppVersion: string;
  readonly contentPackVersion: string;
}

/**
 * Deliberately loose, and deliberately last. Breadcrumbs are diagnostic — "the
 * child tapped empty sky" — and must never become a place where a required
 * field hides. Anything the assessment engine reads has a typed payload above.
 */
export interface BreadcrumbPayload {
  readonly kind: string;
  readonly detail?: Record<string, unknown>;
}

export type EventPayload =
  | TaskPresentedPayload
  | TaskResolvedPayload
  | AttemptRecordedPayload
  | HintEmittedPayload
  | SessionStartedPayload
  | BreadcrumbPayload
  | Record<string, unknown>;

export interface TelemetryEvent {
  /** uuid v4, client-generated. THE idempotency key — architecture §6.3 rule 5. */
  readonly eventId: string;
  /**
   * Monotonic per child, persisted client-side. It — not the wall clock —
   * defines replay order, because a child's device clock may be wrong by hours
   * and a tablet that has never been online may be wrong by years.
   */
  readonly clientSeq: number;
  readonly childId: string;
  readonly sessionId: string;
  readonly type: EventType;
  /** Client clock. Advisory only; never used for ordering. */
  readonly occurredAt: string;
  readonly schemaVersion: number;
  readonly payload: EventPayload;
}

export const EVENT_SCHEMA_VERSION = 1;

/** Architecture §6.3 rule 6: batches of at most this many. */
export const MAX_EVENT_BATCH = 50;
