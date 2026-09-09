import { eq, and } from 'drizzle-orm';
import {
  scoreAll,
  DEFAULT_POLICY,
  type Evidence,
  type SkillId,
  type MechanicId,
  type TaskOutcome,
  type TelemetryEvent,
  type TaskPresentedPayload,
  type TaskResolvedPayload,
  type AttemptRecordedPayload,
  type HintEmittedPayload,
} from '@secret-journey/shared';
import type { Db } from '../db/client.js';
import { taskInstances, attempts, hintEvents, skillStates, events } from '../db/schema.js';
import type { OwnedChild } from './guard.js';

/**
 * Projecting the event log into the tables the parent dashboard queries.
 *
 * WHY PROJECT AT ALL, RATHER THAN QUERY THE LOG
 * =============================================
 * Criterion 3.11 asks "which skills are hard on which mechanic", which is a
 * GROUP BY over skill_id and mechanic_id. Against JSONB payloads that is a full
 * scan that gets slower every session a child plays; against the projected
 * columns it is an index scan (seam S3). The log stays the system of record and
 * the projection stays disposable — it can be dropped and rebuilt from events
 * at any time, which is the property that makes an event log worth having.
 *
 * WHY THE SERVER RE-DERIVES CORRECTNESS
 * ====================================
 * Architecture §6.2 accepts that the answer key ships to the client, because a
 * round-trip per tap would put network latency inside a five-year-old's
 * feedback loop. The cost is that `isCorrect` in an event payload is the
 * client's opinion. So the server recomputes it from the selected content id
 * against the option list it was actually shown — a tampered or simply buggy
 * client can corrupt its own child's experience, but not the research data.
 */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Applies a batch of already-ingested events to the projections.
 *
 * Ordered by clientSeq, never by occurredAt: a child's tablet clock may be
 * wrong by hours, and one that has never been online may be wrong by years.
 * Only the client's own counter reliably says what happened before what.
 */
export async function projectEvents(
  db: Db,
  child: OwnedChild,
  batch: readonly TelemetryEvent[],
): Promise<void> {
  const ordered = [...batch].sort((a, b) => a.clientSeq - b.clientSeq);

  for (const event of ordered) {
    switch (event.type) {
      case 'task.presented':
        await applyTaskPresented(db, child, event);
        break;
      case 'task.resolved':
        await applyTaskResolved(db, child, event);
        break;
      case 'attempt.recorded':
        await applyAttempt(db, child, event);
        break;
      case 'hint.emitted':
        await applyHint(db, child, event);
        break;
      default:
        // Everything else is either narrative (screen.viewed) or handled by a
        // later milestone (world.*, adventure.*). It stays in the log either
        // way — the log is the record, this is only the index over it.
        break;
    }
  }
}

async function applyTaskPresented(db: Db, child: OwnedChild, event: TelemetryEvent) {
  const p = event.payload as unknown as TaskPresentedPayload;
  if (!isRecord(p) || typeof p.taskInstanceId !== 'string') return;

  await db
    .insert(taskInstances)
    .values({
      id: p.taskInstanceId,
      childId: child.id,
      sessionId: event.sessionId,
      taskId: p.taskId,
      skillId: p.skillId,
      mechanicId: p.mechanicId,
      targetContentId: p.targetContentId,
      optionCount: p.optionCount,
      optionsPresented: p.optionsPresented,
      isScaffolded: p.isScaffolded ?? false,
      derivedFromTaskInstanceId: p.derivedFromTaskInstanceId ?? null,
      adventureRunId: p.adventureRunId ?? null,
      presentedAt: new Date(event.occurredAt),
    })
    // Replaying the log must be safe: rebuilding a projection is a routine
    // operation, not an incident.
    .onConflictDoNothing();
}

async function applyTaskResolved(db: Db, child: OwnedChild, event: TelemetryEvent) {
  const p = event.payload as unknown as TaskResolvedPayload;
  if (!isRecord(p) || typeof p.taskInstanceId !== 'string') return;

  await db
    .update(taskInstances)
    .set({
      outcome: p.outcome,
      resolvedAt: new Date(p.resolvedAt ?? event.occurredAt),
    })
    .where(and(eq(taskInstances.id, p.taskInstanceId), eq(taskInstances.childId, child.id)));
}

async function applyAttempt(db: Db, child: OwnedChild, event: TelemetryEvent) {
  const p = event.payload as unknown as AttemptRecordedPayload;
  if (!isRecord(p) || typeof p.attemptId !== 'string') return;

  // Re-derive correctness from what the child was actually shown. An attempt
  // whose task instance has not arrived yet is skipped rather than trusted —
  // the projection is rebuildable, so it will be picked up on the next replay.
  const [ti] = await db
    .select({
      target: taskInstances.targetContentId,
      options: taskInstances.optionsPresented,
    })
    .from(taskInstances)
    .where(and(eq(taskInstances.id, p.taskInstanceId), eq(taskInstances.childId, child.id)))
    .limit(1);

  if (!ti) return;

  const serverIsCorrect = p.selectedContentId === ti.target;

  await db
    .insert(attempts)
    .values({
      id: p.attemptId,
      childId: child.id,
      taskInstanceId: p.taskInstanceId,
      attemptNumber: p.attemptNumber,
      selectedOptionId: p.selectedOptionId,
      selectedContentId: p.selectedContentId,
      isCorrect: serverIsCorrect,
      responseTimeMs: p.responseTimeMs,
      ladderStepAtAttempt: p.ladderStepAtAttempt,
      occurredAt: new Date(event.occurredAt),
    })
    .onConflictDoNothing();
}

async function applyHint(db: Db, child: OwnedChild, event: TelemetryEvent) {
  const p = event.payload as unknown as HintEmittedPayload;
  if (!isRecord(p) || typeof p.hintEventId !== 'string') return;

  await db
    .insert(hintEvents)
    .values({
      id: p.hintEventId,
      childId: child.id,
      taskInstanceId: p.taskInstanceId,
      ladderStep: p.ladderStep,
      hintType: p.hintType,
      trigger: p.trigger,
      acceptedByChild: p.acceptedByChild ?? null,
      occurredAt: new Date(event.occurredAt),
    })
    .onConflictDoNothing();
}

/**
 * Recomputes the child's skill model from the projection.
 *
 * SEAM S5, and the reason it is worth the trouble: this calls the SAME
 * `scoreAll` the client runs in-session. Two implementations of a learner model
 * disagree eventually, and when they do the parent screen says one thing while
 * the game behaves like another — with no way to tell which is right. One
 * module, running in both places, cannot drift.
 *
 * Full recompute rather than incremental. The whole point of an event log is
 * that derived state is a function of it; an incremental update that is subtly
 * wrong is undetectable, whereas a recompute that is wrong is wrong everywhere
 * at once and shows up immediately.
 */
export async function recomputeSkillStates(db: Db, child: OwnedChild): Promise<void> {
  const rows = await db
    .select({
      id: taskInstances.id,
      skillId: taskInstances.skillId,
      mechanicId: taskInstances.mechanicId,
      targetContentId: taskInstances.targetContentId,
      outcome: taskInstances.outcome,
      isScaffolded: taskInstances.isScaffolded,
      sessionId: taskInstances.sessionId,
      resolvedAt: taskInstances.resolvedAt,
      presentedAt: taskInstances.presentedAt,
    })
    .from(taskInstances)
    .where(eq(taskInstances.childId, child.id));

  const evidence: Evidence[] = rows
    .filter((r) => r.outcome !== null)
    .map((r) => ({
      taskInstanceId: r.id,
      skillId: r.skillId as SkillId,
      contentId: r.targetContentId,
      rootLetterId: rootLetterOf(r.targetContentId),
      mechanicId: r.mechanicId as MechanicId,
      outcome: r.outcome as TaskOutcome,
      isScaffolded: r.isScaffolded,
      sessionId: r.sessionId,
      occurredAt: (r.resolvedAt ?? r.presentedAt).toISOString(),
    }));

  const states = scoreAll({ childId: child.id, evidence, policy: DEFAULT_POLICY });

  await db.delete(skillStates).where(eq(skillStates.childId, child.id));
  if (states.length === 0) return;

  await db.insert(skillStates).values(
    states.map((s) => ({
      childId: child.id,
      skillId: s.skillId,
      // '' rather than NULL for the skill-level rollup: it is part of the
      // primary key, and NULLs in keys are how a skill ends up listed twice.
      contentScopeId: s.contentScopeId ?? '',
      status: s.status,
      exposures: s.exposures,
      firstTryCorrect: s.firstTryCorrect,
      hintAssisted: s.hintAssisted,
      distinctMechanics: s.distinctMechanics,
      needsReinforcement: s.needsReinforcement,
      reinforcedAtSessionId: s.reinforcedAtSessionId,
      policyVersion: s.policyVersion,
      updatedAt: new Date(),
    })),
  );
}

/**
 * Which letter a content id belongs to.
 *
 * Spec 10.1 targets a LETTER, not a skill in the abstract, so evidence from a
 * word, a stretched sound and a pointed combination all have to land in the
 * same bucket as the bare letter. Deriving it from the id's own namespace keeps
 * that true for content kinds that do not exist yet.
 */
function rootLetterOf(contentId: string): string | null {
  if (contentId.startsWith('letter:')) return contentId;
  if (contentId.startsWith('niqqud_combo:')) {
    const [, rest] = contentId.split(':');
    const letter = rest?.split('_')[0];
    return letter ? `letter:${letter}` : null;
  }
  // letter_sound: and word: ids do not encode their letter, so they are
  // resolved from the content pack rather than parsed. Until the server loads
  // the pack (M5 of the server plan) they contribute skill-level evidence only,
  // which is correct-but-partial rather than wrong.
  return null;
}

/** Replays every stored event for a child. The projection is disposable. */
export async function rebuildProjection(db: Db, child: OwnedChild): Promise<void> {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.childId, child.id))
    .orderBy(events.clientSeq);

  await db.delete(attempts).where(eq(attempts.childId, child.id));
  await db.delete(hintEvents).where(eq(hintEvents.childId, child.id));
  await db.delete(taskInstances).where(eq(taskInstances.childId, child.id));

  await projectEvents(
    db,
    child,
    rows.map((r) => ({
      eventId: r.eventId,
      clientSeq: r.clientSeq,
      childId: r.childId,
      sessionId: r.sessionId,
      type: r.type as TelemetryEvent['type'],
      occurredAt: r.occurredAt.toISOString(),
      schemaVersion: r.schemaVersion,
      payload: r.payload as Record<string, unknown>,
    })),
  );

  await recomputeSkillStates(db, child);
}
