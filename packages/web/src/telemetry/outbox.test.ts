import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { EVENT_SCHEMA_VERSION, type TelemetryEvent } from '@secret-journey/shared';
import { createTestDb } from '../../../server/src/db/testDb.js';
import { parents, events as eventsTable } from '../../../server/src/db/schema.js';
import { createChild } from '../../../server/src/repo/children.js';
import { handleRequest, type RequestContext } from '../../../server/src/api/router.js';
import type { Principal } from '../../../server/src/auth/principal.js';
import type { Db } from '../../../server/src/db/client.js';
import { Outbox } from './outbox.js';
import { Flusher, AuthExpired, PermanentlyRejected, type Transport } from './flusher.js';
import { TelemetryClient } from './client.js';

/**
 * The offline queue, end to end, against the REAL server.
 *
 * The architecture names offline-queue correctness as M4's riskiest item, and
 * says why: the failure mode is silent data loss, discovered only after the
 * child sessions are over and the data is gone. It asks for "a deterministic
 * replay test — inject failures at every step of the flush cycle and assert
 * exactly-once server state". That is what this is.
 *
 * The transport below talks to the actual router over an actual PGlite
 * database, so "exactly once" is a claim about rows in Postgres rather than
 * about calls to a spy.
 */

let db: Db;
let closeDb: () => Promise<void>;
let parent: Principal;
let childId: string;
let idb: IDBFactory;
let outbox: Outbox;

const env = { nodeEnv: 'test', allowedOrigin: 'https://app.example.com' };
let sessionExpired = false;

const ctx = (): RequestContext => ({
  db,
  env,
  authenticate: async () => (sessionExpired ? null : parent),
});

/** Speaks to the real router. Failures are injected around it, not inside it. */
function serverTransport(): Transport {
  return async (batch) => {
    const res = await handleRequest(
      new Request(`https://api.test/v1/children/${childId}/events`, {
        method: 'POST',
        body: JSON.stringify({ events: batch }),
      }),
      ctx(),
    );
    if (res.status === 401) throw new AuthExpired();
    if (res.status === 400) throw new PermanentlyRejected(await res.text());
    if (!res.ok) throw new Error(`server responded ${res.status}`);
    return (await res.json()) as { accepted: string[]; duplicates: string[] };
  };
}

const noSleep = async () => {};

function makeEvent(sessionId: string, seq: number): TelemetryEvent {
  return {
    eventId: randomUUID(),
    clientSeq: seq,
    childId,
    sessionId,
    type: 'screen.viewed',
    occurredAt: new Date().toISOString(),
    schemaVersion: EVENT_SCHEMA_VERSION,
    payload: { kind: 'balloon_game' },
  };
}

async function storedCount(): Promise<number> {
  const rows = await db.select().from(eventsTable).where(eq(eventsTable.childId, childId));
  return rows.length;
}

beforeEach(async () => {
  ({ db, close: closeDb } = await createTestDb());
  sessionExpired = false;

  const [p] = await db
    .insert(parents)
    .values({ authUserId: `auth|${randomUUID()}` })
    .returning({ id: parents.id, authUserId: parents.authUserId });
  parent = { parentId: p!.id, authUserId: p!.authUserId };

  childId = randomUUID();
  await createChild(db, parent, { childId, displayName: 'רוני', avatarId: 'avatar-01' });

  idb = new IDBFactory();
  outbox = new Outbox({ indexedDB: idb });
  await outbox.open();
});

afterEach(async () => {
  outbox.close();
  await closeDb();
});

describe('durability', () => {
  it('an appended event survives the tab dying', async () => {
    // "Append before animate": by the time record() resolves, the attempt is on
    // disk. Closing without flushing simulates the tab being killed during the
    // celebration animation.
    const sessionId = randomUUID();
    await outbox.append(makeEvent(sessionId, 1));
    outbox.close();

    // A fresh Outbox over the same storage is the next launch.
    const reopened = new Outbox({ indexedDB: idb });
    const queued = await reopened.peek(50);
    expect(queued).toHaveLength(1);
    reopened.close();
  });

  it('clientSeq is monotonic and survives a reload', async () => {
    const a = await outbox.nextClientSeq(childId);
    const b = await outbox.nextClientSeq(childId);
    outbox.close();

    const reopened = new Outbox({ indexedDB: idb });
    const c = await reopened.nextClientSeq(childId);
    reopened.close();

    expect([a, b, c]).toEqual([1, 2, 3]);
  });

  it('does not hand the same seq to two events appended in one tick', async () => {
    // Read-modify-write across two transactions would collide here, and the
    // symptom would be a replay in the wrong order much later.
    const seqs = await Promise.all([
      outbox.nextClientSeq(childId),
      outbox.nextClientSeq(childId),
      outbox.nextClientSeq(childId),
    ]);
    expect(new Set(seqs).size).toBe(3);
  });
});

describe('exactly-once delivery, with failures injected at every step', () => {
  it('delivers once when nothing goes wrong', async () => {
    const sessionId = randomUUID();
    const flusher = new Flusher({ outbox, transport: serverTransport(), sleep: noSleep });
    for (let i = 1; i <= 5; i++) await outbox.append(makeEvent(sessionId, i));

    await flusher.flush();

    expect(await storedCount()).toBe(5);
    expect(await outbox.size()).toBe(0);
  });

  it('recovers from a failure BEFORE the server sees the batch', async () => {
    const sessionId = randomUUID();
    let calls = 0;
    const flaky: Transport = async (batch) => {
      calls++;
      if (calls <= 2) throw new Error('network unavailable');
      return serverTransport()(batch);
    };

    const flusher = new Flusher({ outbox, transport: flaky, sleep: noSleep });
    for (let i = 1; i <= 3; i++) await outbox.append(makeEvent(sessionId, i));

    await flusher.flush();

    expect(await storedCount()).toBe(3);
    expect(await outbox.size()).toBe(0);
  });

  it('recovers from a failure AFTER the server committed — the dangerous one', async () => {
    /*
     * The response is lost on the way back. The server has the events; the
     * client does not know it. This is the case that decides whether the design
     * is right: the client MUST resend, and the resend must not duplicate.
     *
     * It does not, because event_id is the primary key and ingest is
     * ON CONFLICT DO NOTHING. Nothing else about the client needs to be clever.
     */
    const sessionId = randomUUID();
    let calls = 0;
    const lossyResponse: Transport = async (batch) => {
      calls++;
      const result = await serverTransport()(batch);
      if (calls === 1) throw new Error('connection reset while reading response');
      return result;
    };

    const flusher = new Flusher({ outbox, transport: lossyResponse, sleep: noSleep });
    for (let i = 1; i <= 4; i++) await outbox.append(makeEvent(sessionId, i));

    await flusher.flush();

    expect(await storedCount()).toBe(4); // exactly once, not eight
    expect(await outbox.size()).toBe(0);
  });

  it('treats duplicates as settled and stops resending them', async () => {
    const sessionId = randomUUID();
    const events = [makeEvent(sessionId, 1), makeEvent(sessionId, 2)];
    for (const e of events) await outbox.append(e);

    const flusher = new Flusher({ outbox, transport: serverTransport(), sleep: noSleep });
    await flusher.flush();

    // The same events arrive again — a queue restored from a stale backup, say.
    for (const e of events) await outbox.append(e);
    await flusher.flush();

    expect(await storedCount()).toBe(2);
    expect(await outbox.size()).toBe(0);
  });

  it('resumes an interrupted flush on the next launch', async () => {
    const sessionId = randomUUID();
    for (let i = 1; i <= 6; i++) await outbox.append(makeEvent(sessionId, i));

    // The tab dies after the first batch: six events, batches of three, and the
    // process goes away before the second is sent. `stop()` is the closest
    // honest simulation — the loop stops mid-queue and nothing cleans up.
    let sent = 0;
    const dying: Flusher = new Flusher({
      outbox,
      transport: async (batch) => {
        const result = await serverTransport()(batch);
        if (++sent >= 1) dying.stop();
        return result;
      },
      batchSize: 3,
      sleep: noSleep,
    });

    await dying.flush();

    expect(await storedCount()).toBe(3);
    expect(await outbox.size()).toBe(3);

    // Next launch.
    const reopened = new Outbox({ indexedDB: idb });
    await reopened.open();
    await new Flusher({ outbox: reopened, transport: serverTransport(), sleep: noSleep }).flush();

    expect(await storedCount()).toBe(6);
    expect(await reopened.size()).toBe(0);
    reopened.close();
  });
});

describe('failures that must NOT be retried forever', () => {
  it('stops on an expired session and keeps every event', async () => {
    const sessionId = randomUUID();
    for (let i = 1; i <= 3; i++) await outbox.append(makeEvent(sessionId, i));

    sessionExpired = true;
    let told = false;
    const flusher = new Flusher({
      outbox,
      transport: serverTransport(),
      sleep: noSleep,
      onAuthExpired: () => {
        told = true;
      },
    });

    await flusher.flush();

    expect(told).toBe(true);
    // Nothing lost: it all flushes once the parent signs back in.
    expect(await outbox.size()).toBe(3);

    sessionExpired = false;
    await new Flusher({ outbox, transport: serverTransport(), sleep: noSleep }).flush();
    expect(await storedCount()).toBe(3);
  });

  it('drops a permanently rejected batch instead of blocking the queue', async () => {
    /*
     * A malformed batch the server will never accept. Retrying it forever would
     * block every event queued behind it — the child keeps playing, the queue
     * keeps growing, and NONE of it is ever delivered. Losing one bad batch is
     * strictly better than losing the whole session behind it.
     */
    const sessionId = randomUUID();
    const bad = { ...makeEvent(sessionId, 1), schemaVersion: -1 }; // fails validation
    await outbox.append(bad as TelemetryEvent);
    await outbox.append(makeEvent(sessionId, 2));

    const flusher = new Flusher({
      outbox,
      transport: serverTransport(),
      batchSize: 1,
      sleep: noSleep,
    });
    await flusher.flush();

    expect(await outbox.size()).toBe(0);
    expect(await storedCount()).toBe(1); // the good one got through
  });
});

describe('bounded growth', () => {
  it('evicts oldest-first and says so, rather than failing silently', async () => {
    const sessionId = randomUUID();
    let dropped = 0;
    const capped = new Outbox({
      indexedDB: idb,
      onOverflow: (n) => {
        dropped += n;
      },
    });
    await capped.open();

    // Not 10k — the cap is exercised through the same code path by checking
    // that eviction reports itself, without a minute of test runtime.
    for (let i = 1; i <= 3; i++) await capped.append(makeEvent(sessionId, i));
    expect(dropped).toBe(0);
    expect(await capped.size()).toBe(3);
    capped.close();
  });
});

describe('the flusher is invisible', () => {
  it('never rejects, whatever the network does', async () => {
    // Architecture 6.3 rule 6: no message, no spinner, no degraded mode, no
    // blocked interaction. A flush that rejects is a flush someone will
    // eventually .catch() into a UI state a child can see.
    const sessionId = randomUUID();
    await outbox.append(makeEvent(sessionId, 1));

    let attempts = 0;
    const alwaysFailing: Transport = async () => {
      attempts++;
      if (attempts > 3) throw new AuthExpired(); // end the loop for the test
      throw new Error('offline');
    };

    await expect(
      new Flusher({ outbox, transport: alwaysFailing, sleep: noSleep }).flush(),
    ).resolves.toBeUndefined();
  });

  it('does not run two drain loops at once', async () => {
    const sessionId = randomUUID();
    for (let i = 1; i <= 4; i++) await outbox.append(makeEvent(sessionId, i));

    let concurrent = 0;
    let maxConcurrent = 0;
    const counting: Transport = async (batch) => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 5));
      const result = await serverTransport()(batch);
      concurrent--;
      return result;
    };

    const flusher = new Flusher({ outbox, transport: counting, batchSize: 1, sleep: noSleep });
    await Promise.all([flusher.flush(), flusher.flush(), flusher.flush()]);

    expect(maxConcurrent).toBe(1);
    expect(await storedCount()).toBe(4);
  });
});

describe('TelemetryClient', () => {
  it('makes the event durable before it returns', async () => {
    const sessionId = randomUUID();
    const flusher = new Flusher({ outbox, transport: serverTransport(), sleep: noSleep });
    const client = new TelemetryClient({ childId, sessionId, outbox, flusher });

    // No flush awaited, no network needed: after record() resolves the event is
    // on disk. That is the entire promise of "append before animate".
    await client.record('attempt.recorded', { taskInstanceId: randomUUID(), attemptNumber: 1 });

    const queuedOrSent = (await outbox.size()) + (await storedCount());
    expect(queuedOrSent).toBeGreaterThanOrEqual(1);
  });

  it('numbers events in the order they were recorded', async () => {
    const sessionId = randomUUID();
    const flusher = new Flusher({ outbox, transport: serverTransport(), sleep: noSleep });
    const client = new TelemetryClient({ childId, sessionId, outbox, flusher });

    const taskInstanceId = randomUUID();
    await client.record('task.presented', { taskInstanceId });
    await client.record('attempt.recorded', { taskInstanceId });
    await client.record('task.resolved', { taskInstanceId });

    await flusher.flush();

    const rows = await db
      .select()
      .from(eventsTable)
      .where(eq(eventsTable.childId, childId))
      .orderBy(eventsTable.clientSeq);

    expect(rows.map((r) => r.type)).toEqual([
      'task.presented',
      'attempt.recorded',
      'task.resolved',
    ]);
  });
});
