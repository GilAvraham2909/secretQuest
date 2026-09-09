import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '../db/testDb.js';
import type { Db } from '../db/client.js';
import { parents } from '../db/schema.js';
import { createChild } from '../repo/children.js';
import { handleRequest, CHILD_SCOPED_ROUTES, type RequestContext } from './router.js';
import type { Principal } from '../auth/principal.js';
import type { AppEnv } from './http.js';

/**
 * The API, from outside.
 *
 * The test that matters is the last one: it walks EVERY child-scoped route and
 * asserts a second parent gets 404. It reads the route table rather than a
 * hand-written list, so adding a route without isolation makes the test fail
 * rather than quietly leaving a gap — "fifteen endpoints check and the
 * sixteenth forgets" is the exact shape of this class of flaw.
 */

const env: AppEnv = { nodeEnv: 'test', allowedOrigin: 'https://app.example.com' };

let db: Db;
let close: () => Promise<void>;
let alice: Principal;
let mallory: Principal;
let aliceChildId: string;

/** Whichever principal the test currently wants the request to be. */
let actor: Principal | null;

const ctx = (): RequestContext => ({
  db,
  env,
  authenticate: async () => actor,
});

async function makeParent(): Promise<Principal> {
  const [row] = await db
    .insert(parents)
    .values({ authUserId: `auth|${randomUUID()}` })
    .returning({ id: parents.id, authUserId: parents.authUserId });
  return { parentId: row!.id, authUserId: row!.authUserId };
}

const url = (path: string) => `https://api.example.com${path}`;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  alice = await makeParent();
  mallory = await makeParent();
  actor = alice;

  aliceChildId = randomUUID();
  await createChild(db, alice, {
    childId: aliceChildId,
    displayName: 'רוני',
    avatarId: 'avatar-01',
  });
});

afterEach(async () => {
  await close();
});

describe('authentication', () => {
  it('refuses every route without a session', async () => {
    actor = null;
    const res = await handleRequest(
      new Request(url(`/v1/children/${aliceChildId}/bootstrap`)),
      ctx(),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/children', () => {
  it('creates, then is idempotent on retry', async () => {
    const childId = randomUUID();
    const body = JSON.stringify({ childId, displayName: 'דנה', avatarId: 'avatar-03' });

    const first = await handleRequest(
      new Request(url('/v1/children'), { method: 'POST', body }),
      ctx(),
    );
    const second = await handleRequest(
      new Request(url('/v1/children'), { method: 'POST', body }),
      ctx(),
    );

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
  });

  it("returns 409 for another parent's child id, with no detail", async () => {
    actor = mallory;
    const res = await handleRequest(
      new Request(url('/v1/children'), {
        method: 'POST',
        body: JSON.stringify({ childId: aliceChildId, displayName: 'X', avatarId: 'avatar-06' }),
      }),
      ctx(),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    // Nothing about whose it is, when it was made, or what it is called.
    expect(JSON.stringify(body)).not.toContain('רוני');
    expect(JSON.stringify(body)).not.toContain(alice.parentId);
  });

  it('rejects an unknown field rather than ignoring it', async () => {
    // The envelope is strict on purpose: this is a research instrument, and a
    // field the server silently drops is data the study thinks it has.
    const res = await handleRequest(
      new Request(url('/v1/children'), {
        method: 'POST',
        body: JSON.stringify({
          childId: randomUUID(),
          displayName: 'דנה',
          avatarId: 'avatar-03',
          parentId: mallory.parentId, // an attempt to choose one's own parent
        }),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /v1/children/:childId/events', () => {
  it('accepts a batch and reports duplicates on retry', async () => {
    const sessionId = randomUUID();
    const events = [
      {
        eventId: randomUUID(),
        clientSeq: 1,
        childId: aliceChildId,
        sessionId,
        type: 'screen.viewed',
        occurredAt: new Date().toISOString(),
        schemaVersion: 1,
        payload: { kind: 'welcome' },
      },
    ];
    const body = JSON.stringify({ events });

    const first = await handleRequest(
      new Request(url(`/v1/children/${aliceChildId}/events`), { method: 'POST', body }),
      ctx(),
    );
    const second = await handleRequest(
      new Request(url(`/v1/children/${aliceChildId}/events`), { method: 'POST', body }),
      ctx(),
    );

    const firstBody = (await first.json()) as { accepted: string[]; duplicates: string[] };
    const secondBody = (await second.json()) as { accepted: string[]; duplicates: string[] };
    expect(firstBody.accepted).toHaveLength(1);
    expect(secondBody.accepted).toHaveLength(0);
    expect(secondBody.duplicates).toHaveLength(1);
  });

  it('rejects a batch over the size limit', async () => {
    const sessionId = randomUUID();
    const events = Array.from({ length: 51 }, (_, i) => ({
      eventId: randomUUID(),
      clientSeq: i,
      childId: aliceChildId,
      sessionId,
      type: 'screen.viewed',
      occurredAt: new Date().toISOString(),
      schemaVersion: 1,
      payload: {},
    }));

    const res = await handleRequest(
      new Request(url(`/v1/children/${aliceChildId}/events`), {
        method: 'POST',
        body: JSON.stringify({ events }),
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });
});

describe('error responses', () => {
  it('never returns a stack trace or a driver message', async () => {
    const res = await handleRequest(
      new Request(url(`/v1/children/${randomUUID()}/bootstrap`)),
      ctx(),
    );
    const text = await res.text();
    expect(res.status).toBe(404);
    expect(text).not.toMatch(/at \w+ \(/); // no stack frames
    expect(text.toLowerCase()).not.toContain('select');
    expect(text.toLowerCase()).not.toContain('children'); // no table names
  });
});

describe('cross-tenant isolation, across the whole route table', () => {
  it('gives a second parent 404 on every child-scoped route', async () => {
    // Alice's child exists and has data. Mallory is a real, signed-in user who
    // simply asks for an id that is not hers.
    actor = mallory;

    const failures: string[] = [];

    for (const route of CHILD_SCOPED_ROUTES) {
      const path = route.pattern.replace(':childId', aliceChildId);
      const request = new Request(url(path), {
        method: route.method,
        ...(route.method === 'POST'
          ? {
              // A body good enough to pass validation, so the request fails on
              // authorization rather than on shape — otherwise a 400 would
              // masquerade as isolation.
              body: JSON.stringify(bodyFor(route.pattern, aliceChildId)),
            }
          : {}),
      });

      const res = await handleRequest(request, ctx());
      if (res.status !== 404) {
        failures.push(`${route.method} ${route.pattern} → ${res.status}`);
      }
    }

    expect(failures).toEqual([]);
    expect(CHILD_SCOPED_ROUTES.length).toBeGreaterThan(3);
  });

  it('lets the owning parent through the same routes', async () => {
    // The mirror of the test above: isolation that also blocks the owner is
    // not isolation, it is an outage.
    actor = alice;
    for (const route of CHILD_SCOPED_ROUTES) {
      const path = route.pattern.replace(':childId', aliceChildId);
      const res = await handleRequest(
        new Request(url(path), {
          method: route.method,
          ...(route.method === 'POST'
            ? { body: JSON.stringify(bodyFor(route.pattern, aliceChildId)) }
            : {}),
        }),
        ctx(),
      );
      expect([200, 201]).toContain(res.status);
    }
  });
});

function bodyFor(pattern: string, childId: string): unknown {
  if (pattern.endsWith('/sessions')) {
    return {
      sessionId: randomUUID(),
      startedAt: new Date().toISOString(),
      clientAppVersion: '0.1.0',
      contentPackVersion: '1',
    };
  }
  if (pattern.endsWith('/events')) {
    return {
      events: [
        {
          eventId: randomUUID(),
          clientSeq: 1,
          childId,
          sessionId: randomUUID(),
          type: 'screen.viewed',
          occurredAt: new Date().toISOString(),
          schemaVersion: 1,
          payload: {},
        },
      ],
    };
  }
  return {};
}
