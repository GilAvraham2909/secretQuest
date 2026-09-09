import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../db/testDb.js';
import type { Db } from '../db/client.js';
import { parents, attempts, skillStates, taskInstances } from '../db/schema.js';
import { createChild } from './children.js';
import { ingestEvents } from './events.js';
import { projectEvents, recomputeSkillStates, rebuildProjection } from './project.js';
import type { OwnedChild } from './guard.js';
import type { Principal } from '../auth/principal.js';
import type { TelemetryEvent } from '@secret-journey/shared';

/**
 * The projection, and the one property it exists to guarantee: a client cannot
 * write the study's conclusions.
 */

let db: Db;
let close: () => Promise<void>;
let parent: Principal;
let child: OwnedChild;

const SESSION = randomUUID();
let seq = 0;

function ev(type: TelemetryEvent['type'], payload: Record<string, unknown>): TelemetryEvent {
  return {
    eventId: randomUUID(),
    clientSeq: ++seq,
    childId: child.id,
    sessionId: SESSION,
    type,
    occurredAt: new Date(Date.now() + seq * 1000).toISOString(),
    schemaVersion: 1,
    payload,
  };
}

/** One round: presented, one attempt, resolved. */
function round(opts: {
  taskId: string;
  skillId: string;
  mechanicId: string;
  target: string;
  distractor: string;
  /** What the child actually tapped. */
  selected: string;
  /** What the client CLAIMS about that tap. */
  claimsCorrect: boolean;
  outcome: string;
}): { events: TelemetryEvent[]; taskInstanceId: string; attemptId: string } {
  const taskInstanceId = randomUUID();
  const attemptId = randomUUID();
  const targetOptionId = `opt-${randomUUID()}`;
  const distractorOptionId = `opt-${randomUUID()}`;

  return {
    taskInstanceId,
    attemptId,
    events: [
      ev('task.presented', {
        taskInstanceId,
        taskId: opts.taskId,
        skillId: opts.skillId,
        mechanicId: opts.mechanicId,
        targetContentId: opts.target,
        optionCount: 2,
        optionsPresented: [
          { optionId: targetOptionId, contentId: opts.target, isTarget: true, position: 0 },
          { optionId: distractorOptionId, contentId: opts.distractor, isTarget: false, position: 1 },
        ],
        isScaffolded: false,
        derivedFromTaskInstanceId: null,
        adventureRunId: null,
      }),
      ev('attempt.recorded', {
        taskInstanceId,
        attemptId,
        attemptNumber: 1,
        selectedOptionId: opts.selected === opts.target ? targetOptionId : distractorOptionId,
        selectedContentId: opts.selected,
        isCorrect: opts.claimsCorrect,
        responseTimeMs: 1200,
        ladderStepAtAttempt: 0,
      }),
      ev('task.resolved', {
        taskInstanceId,
        outcome: opts.outcome,
        resolvedAt: new Date().toISOString(),
      }),
    ],
  };
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  seq = 0;
  const [p] = await db
    .insert(parents)
    .values({ authUserId: `auth|${randomUUID()}` })
    .returning({ id: parents.id, authUserId: parents.authUserId });
  parent = { parentId: p!.id, authUserId: p!.authUserId };
  child = (
    await createChild(db, parent, {
      childId: randomUUID(),
      displayName: 'רוני',
      avatarId: 'avatar-01',
    })
  ).child;
});

afterEach(async () => {
  await close();
});

describe('server-derived correctness', () => {
  it("ignores the client's isCorrect and re-derives it from what was shown", async () => {
    // Architecture §6.2: the answer key ships to the client because a
    // round-trip per tap would put network latency inside a five-year-old's
    // feedback loop. This is the compensating control, and it is the only
    // reason that trade-off is acceptable.
    const wrongButClaimsRight = round({
      taskId: 'BAL-001',
      skillId: 'visual_letter_recognition',
      mechanicId: 'balloon_game',
      target: 'letter:mem',
      distractor: 'letter:shin',
      selected: 'letter:shin', // tapped the distractor
      claimsCorrect: true, // …and says it got it right
      outcome: 'first_try_correct',
    });

    await ingestEvents(db, child, wrongButClaimsRight.events as never);
    await projectEvents(db, child, wrongButClaimsRight.events);

    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, wrongButClaimsRight.attemptId));

    expect(row!.isCorrect).toBe(false);
  });

  it('accepts a correct tap that the client happens to under-claim', async () => {
    const rightButClaimsWrong = round({
      taskId: 'BAL-001',
      skillId: 'visual_letter_recognition',
      mechanicId: 'balloon_game',
      target: 'letter:mem',
      distractor: 'letter:shin',
      selected: 'letter:mem',
      claimsCorrect: false,
      outcome: 'first_try_correct',
    });

    await projectEvents(db, child, rightButClaimsWrong.events);

    const [row] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, rightButClaimsWrong.attemptId));

    expect(row!.isCorrect).toBe(true);
  });
});

describe('skill state recomputation', () => {
  it('produces both rollups the product needs, from the same pass', async () => {
    const r = round({
      taskId: 'BAL-001',
      skillId: 'visual_letter_recognition',
      mechanicId: 'balloon_game',
      target: 'letter:mem',
      distractor: 'letter:shin',
      selected: 'letter:mem',
      claimsCorrect: true,
      outcome: 'first_try_correct',
    });
    await projectEvents(db, child, r.events);
    await recomputeSkillStates(db, child);

    const rows = await db.select().from(skillStates).where(eq(skillStates.childId, child.id));

    // The skill-level rollup drives the parent screen's status column…
    const skillLevel = rows.filter((s) => s.contentScopeId === '');
    // …and the skill x letter rollup drives the remedial trigger, because spec
    // 10.1 targets a LETTER rather than a skill in the abstract.
    const letterLevel = rows.filter((s) => s.contentScopeId !== '');

    expect(skillLevel).toHaveLength(1);
    expect(letterLevel.length).toBeGreaterThan(0);
    expect(skillLevel[0]!.exposures).toBe(1);
    expect(skillLevel[0]!.firstTryCorrect).toBe(1);
  });

  it('never lists a skill twice', async () => {
    // The composite primary key uses '' rather than NULL for the skill-level
    // scope precisely so this cannot happen — NULLs in a key compare unequal to
    // themselves, and the parent screen would show a skill twice.
    for (const letter of ['letter:mem', 'letter:shin', 'letter:resh']) {
      const r = round({
        taskId: 'BAL-001',
        skillId: 'visual_letter_recognition',
        mechanicId: 'balloon_game',
        target: letter,
        distractor: 'letter:gimel',
        selected: letter,
        claimsCorrect: true,
        outcome: 'first_try_correct',
      });
      await projectEvents(db, child, r.events);
    }
    await recomputeSkillStates(db, child);
    await recomputeSkillStates(db, child); // idempotent

    const rows = await db.select().from(skillStates).where(eq(skillStates.childId, child.id));
    const skillLevel = rows.filter((s) => s.contentScopeId === '');
    expect(skillLevel).toHaveLength(1);
    expect(skillLevel[0]!.exposures).toBe(3);
  });
});

describe('the projection is disposable', () => {
  it('rebuilds identically from the event log alone', async () => {
    // This is what makes the log worth having: if the projection is ever wrong,
    // it can be thrown away and rebuilt, rather than repaired in place.
    const rounds = [
      round({
        taskId: 'BAL-001', skillId: 'visual_letter_recognition', mechanicId: 'balloon_game',
        target: 'letter:mem', distractor: 'letter:shin', selected: 'letter:mem',
        claimsCorrect: true, outcome: 'first_try_correct',
      }),
      round({
        taskId: 'FIS-001', skillId: 'visual_letter_recognition', mechanicId: 'fishing_game',
        target: 'letter:resh', distractor: 'letter:dalet', selected: 'letter:dalet',
        claimsCorrect: false, outcome: 'correct_after_hint',
      }),
    ];
    const all = rounds.flatMap((r) => r.events);

    await ingestEvents(db, child, all as never);
    await projectEvents(db, child, all);
    await recomputeSkillStates(db, child);

    const before = {
      tasks: await db.select().from(taskInstances).where(eq(taskInstances.childId, child.id)),
      skills: await db.select().from(skillStates).where(eq(skillStates.childId, child.id)),
    };

    await rebuildProjection(db, child);

    const after = {
      tasks: await db.select().from(taskInstances).where(eq(taskInstances.childId, child.id)),
      skills: await db.select().from(skillStates).where(eq(skillStates.childId, child.id)),
    };

    expect(after.tasks).toHaveLength(before.tasks.length);
    expect(after.skills).toHaveLength(before.skills.length);
    expect(after.tasks.map((t) => t.outcome).sort()).toEqual(
      before.tasks.map((t) => t.outcome).sort(),
    );
  });

  it('replaying the same events twice changes nothing', async () => {
    const r = round({
      taskId: 'BAL-001', skillId: 'visual_letter_recognition', mechanicId: 'balloon_game',
      target: 'letter:mem', distractor: 'letter:shin', selected: 'letter:mem',
      claimsCorrect: true, outcome: 'first_try_correct',
    });

    await projectEvents(db, child, r.events);
    await projectEvents(db, child, r.events);
    await recomputeSkillStates(db, child);

    const tasks = await db.select().from(taskInstances).where(eq(taskInstances.childId, child.id));
    const atts = await db.select().from(attempts).where(eq(attempts.childId, child.id));
    expect(tasks).toHaveLength(1);
    expect(atts).toHaveLength(1);
  });
});
