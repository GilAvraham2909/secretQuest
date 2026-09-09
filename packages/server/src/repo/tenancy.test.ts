import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '../db/testDb.js';
import type { Db } from '../db/client.js';
import { parents, events } from '../db/schema.js';
import { requireOwnedChild } from './guard.js';
import { createChild } from './children.js';
import { ingestEvents } from './events.js';
import { NotFound, Conflict, BadRequest, type Principal } from '../auth/principal.js';
import { eq } from 'drizzle-orm';

/**
 * Cross-tenant isolation.
 *
 * This is the test file that matters most in the server package. Silent
 * telemetry loss costs the study; a missing ownership check exposes one
 * family's child to another — their name, what they find hard, when they play.
 * The users are five to seven years old.
 *
 * So every case below is written from the attacker's side: a second, entirely
 * legitimate parent who simply asks for an id that is not theirs.
 */

let db: Db;
let close: () => Promise<void>;

/** Two real, unrelated families. */
let alice: Principal;
let mallory: Principal;

async function makeParent(): Promise<Principal> {
  const [row] = await db
    .insert(parents)
    .values({ authUserId: `auth|${randomUUID()}` })
    .returning({ id: parents.id, authUserId: parents.authUserId });
  return { parentId: row!.id, authUserId: row!.authUserId };
}

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  alice = await makeParent();
  mallory = await makeParent();
});

afterEach(async () => {
  await close();
});

describe('requireOwnedChild', () => {
  it("refuses another parent's child, and says only 'not found'", async () => {
    const childId = randomUUID();
    await createChild(db, alice, { childId, displayName: 'רוני', avatarId: 'avatar-01' });

    // The child exists. Mallory must not be able to learn even that.
    await expect(requireOwnedChild(db, mallory, childId)).rejects.toBeInstanceOf(NotFound);

    // Explicitly: NOT a 403. A 403 on someone else's child confirms the child
    // exists, which turns id-guessing into a membership oracle over other
    // families. The status for "not yours" and "does not exist" must be equal.
    const notYours = await requireOwnedChild(db, mallory, childId).catch((e) => e);
    const doesNotExist = await requireOwnedChild(db, mallory, randomUUID()).catch((e) => e);
    expect(notYours.status).toBe(doesNotExist.status);
    expect(notYours.message).toBe(doesNotExist.message);
  });

  it('returns the child to its own parent', async () => {
    const childId = randomUUID();
    await createChild(db, alice, { childId, displayName: 'רוני', avatarId: 'avatar-01' });

    const owned = await requireOwnedChild(db, alice, childId);
    expect(owned.id).toBe(childId);
    expect(owned.displayName).toBe('רוני');
  });

  it('answers "not found" for a malformed id rather than failing', async () => {
    // A non-uuid must not reach the driver and come back as a cast error: that
    // would be a 500 where the honest answer is "no such child of yours", and
    // a 500 is itself information.
    await expect(requireOwnedChild(db, alice, 'not-a-uuid')).rejects.toBeInstanceOf(NotFound);
    await expect(requireOwnedChild(db, alice, "'; drop table children; --")).rejects.toBeInstanceOf(
      NotFound,
    );
  });
});

describe('createChild', () => {
  it('is idempotent for the same parent — the flaky-connection case', async () => {
    const childId = randomUUID();
    const first = await createChild(db, alice, {
      childId,
      displayName: 'רוני',
      avatarId: 'avatar-01',
    });
    const second = await createChild(db, alice, {
      childId,
      displayName: 'רוני',
      avatarId: 'avatar-01',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.child.id).toBe(childId);
  });

  it("refuses to touch a child id owned by someone else", async () => {
    const childId = randomUUID();
    await createChild(db, alice, { childId, displayName: 'רוני', avatarId: 'avatar-01' });

    await expect(
      createChild(db, mallory, { childId, displayName: 'HACKED', avatarId: 'avatar-06' }),
    ).rejects.toBeInstanceOf(Conflict);
  });

  it('NEVER reparents or overwrites on conflict', async () => {
    // The regression this exists for: writing the insert as ON CONFLICT DO
    // UPDATE. That reads like ordinary idempotency in a diff and is an
    // account-takeover primitive — anyone who learns a child id owns the child.
    const childId = randomUUID();
    await createChild(db, alice, { childId, displayName: 'רוני', avatarId: 'avatar-01' });
    await createChild(db, mallory, { childId, displayName: 'HACKED', avatarId: 'avatar-06' }).catch(
      () => undefined,
    );

    const still = await requireOwnedChild(db, alice, childId);
    expect(still.parentId).toBe(alice.parentId);
    expect(still.displayName).toBe('רוני');
    expect(still.avatarId).toBe('avatar-01');
    await expect(requireOwnedChild(db, mallory, childId)).rejects.toBeInstanceOf(NotFound);
  });

  it('rejects a childId that is not a uuid', async () => {
    await expect(
      createChild(db, alice, { childId: 'child-1', displayName: null, avatarId: 'avatar-01' }),
    ).rejects.toBeInstanceOf(BadRequest);
  });
});

describe('ingestEvents', () => {
  const makeEvent = (childId: string, sessionId: string, seq: number) => ({
    eventId: randomUUID(),
    clientSeq: seq,
    childId,
    sessionId,
    type: 'attempt.recorded' as const,
    occurredAt: new Date().toISOString(),
    schemaVersion: 1,
    payload: { taskInstanceId: randomUUID(), attemptNumber: 1 },
  });

  it('is idempotent — the same batch twice lands once', async () => {
    // The offline flusher retries forever and cannot know what the server
    // already has. This property is what makes that safe.
    const childId = randomUUID();
    const child = (await createChild(db, alice, {
      childId,
      displayName: 'רוני',
      avatarId: 'avatar-01',
    })).child;
    const sessionId = randomUUID();
    const batch = [makeEvent(childId, sessionId, 1), makeEvent(childId, sessionId, 2)];

    const first = await ingestEvents(db, child, batch);
    const second = await ingestEvents(db, child, batch);

    expect(first.accepted).toHaveLength(2);
    expect(first.duplicates).toHaveLength(0);
    expect(second.accepted).toHaveLength(0);
    expect(second.duplicates).toHaveLength(2);

    const stored = await db.select().from(events).where(eq(events.childId, childId));
    expect(stored).toHaveLength(2);
  });

  it('survives a batch that repeats an id inside itself', async () => {
    // Postgres refuses to let ON CONFLICT affect a row twice in one statement,
    // so a client that duplicates within a batch would otherwise take the whole
    // upload down — and it would keep retrying the same poisoned batch forever.
    const childId = randomUUID();
    const child = (await createChild(db, alice, {
      childId,
      displayName: 'רוני',
      avatarId: 'avatar-01',
    })).child;
    const sessionId = randomUUID();
    const one = makeEvent(childId, sessionId, 1);

    const result = await ingestEvents(db, child, [one, one]);

    expect(result.accepted).toEqual([one.eventId]);
    expect(result.duplicates).toEqual([one.eventId]);
  });

  it("rejects the whole batch if any event names a different child", async () => {
    const aliceChildId = randomUUID();
    const aliceChild = (await createChild(db, alice, {
      childId: aliceChildId,
      displayName: 'רוני',
      avatarId: 'avatar-01',
    })).child;

    const malloryChildId = randomUUID();
    await createChild(db, mallory, {
      childId: malloryChildId,
      displayName: 'אחר',
      avatarId: 'avatar-02',
    });

    const sessionId = randomUUID();
    const smuggled = [
      makeEvent(aliceChildId, sessionId, 1),
      makeEvent(malloryChildId, sessionId, 2), // not the path's child
    ];

    await expect(ingestEvents(db, aliceChild, smuggled)).rejects.toBeInstanceOf(BadRequest);

    // All-or-nothing: the legitimate event must not have landed either, or the
    // client can no longer tell what it still owes.
    const stored = await db.select().from(events);
    expect(stored).toHaveLength(0);
  });

  it('writes the path child, not whatever the body claims', async () => {
    const childId = randomUUID();
    const child = (await createChild(db, alice, {
      childId,
      displayName: 'רוני',
      avatarId: 'avatar-01',
    })).child;
    const sessionId = randomUUID();

    await ingestEvents(db, child, [makeEvent(childId, sessionId, 1)]);

    const [row] = await db.select().from(events);
    expect(row!.childId).toBe(childId);
  });
});
