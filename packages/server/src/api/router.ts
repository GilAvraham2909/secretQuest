import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { sessions, skillStates, worldStates, events } from '../db/schema.js';
import { BadRequest, NotFound, Unauthenticated, type Principal } from '../auth/principal.js';
import { requireOwnedChild } from '../repo/guard.js';
import { createChild } from '../repo/children.js';
import { ingestEvents } from '../repo/events.js';
import { projectEvents, recomputeSkillStates } from '../repo/project.js';
import { createChildBody, createSessionBody, eventBatch } from './eventSchemas.js';
import { json, errorResponse, corsHeaders, readJson, type AppEnv } from './http.js';
import type { TelemetryEvent } from '@secret-journey/shared';

/**
 * The API surface — architecture §6.4.
 *
 * EVERY child-scoped route starts with `requireOwnedChild`, and that is not a
 * convention: the repository functions take an `OwnedChild`, which only that
 * call can produce. A handler that forgot the check would not compile.
 */

export interface RequestContext {
  readonly db: Db;
  readonly env: AppEnv;
  /**
   * Resolves the session cookie to a parent. Injected rather than imported so
   * the auth provider's SDK stays at the edge of the system — and so tests can
   * exercise authorization without standing up an identity provider.
   */
  authenticate(request: Request): Promise<Principal | null>;
}

type Handler = (
  request: Request,
  ctx: RequestContext,
  params: Record<string, string>,
) => Promise<Response>;

interface Route {
  readonly method: string;
  /** Path pattern with :name segments. */
  readonly pattern: string;
  readonly handler: Handler;
}

export async function handleRequest(request: Request, ctx: RequestContext): Promise<Response> {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, ctx.env) });
    }

    const url = new URL(request.url);
    const segments = url.pathname.split('/').filter(Boolean);

    for (const route of ROUTES) {
      if (route.method !== request.method) continue;
      const params = matchPath(route.pattern, segments);
      if (!params) continue;
      return await route.handler(request, ctx, params);
    }

    return json({ error: 'not found' }, { status: 404, request, env: ctx.env });
  } catch (error) {
    return errorResponse(error, { request, env: ctx.env });
  }
}

function matchPath(pattern: string, segments: string[]): Record<string, string> | null {
  const parts = pattern.split('/').filter(Boolean);
  if (parts.length !== segments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part.startsWith(':')) params[part.slice(1)] = segments[i]!;
    else if (part !== segments[i]) return null;
  }
  return params;
}

async function principalOf(request: Request, ctx: RequestContext): Promise<Principal> {
  const principal = await ctx.authenticate(request);
  if (!principal) throw new Unauthenticated();
  return principal;
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequest('validation failed', result.error.issues);
  }
  return result.data;
}

// ── Handlers ──────────────────────────────────────────────────────────────

const postChildren: Handler = async (request, ctx) => {
  const principal = await principalOf(request, ctx);
  const body = parse(createChildBody, await readJson(request));

  const { child, created } = await createChild(ctx.db, principal, {
    childId: body.childId,
    displayName: body.displayName,
    avatarId: body.avatarId,
  });

  return json(
    { child: { id: child.id, displayName: child.displayName, avatarId: child.avatarId } },
    { status: created ? 201 : 200, request, env: ctx.env },
  );
};

/**
 * Boot in one round trip.
 *
 * One request rather than four because it runs while a child is waiting to
 * play, on whatever connection a family has. `resumeHint` is what drives spec
 * 16.4's "ברוך שובך! המשימה שלך מחכה לך." — the promise that quitting costs
 * nothing is only kept if the server can say where they were.
 */
const getBootstrap: Handler = async (request, ctx, params) => {
  const principal = await principalOf(request, ctx);
  const child = await requireOwnedChild(ctx.db, principal, params.childId!);

  const [world] = await ctx.db
    .select()
    .from(worldStates)
    .where(eq(worldStates.childId, child.id))
    .limit(1);

  const states = await ctx.db
    .select()
    .from(skillStates)
    .where(eq(skillStates.childId, child.id));

  const [lastSession] = await ctx.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.childId, child.id))
    .orderBy(desc(sessions.startedAt))
    .limit(1);

  return json(
    {
      child: { id: child.id, displayName: child.displayName, avatarId: child.avatarId },
      world: world ?? { childId: child.id, coins: 0, unlockedItems: [], placedItems: [] },
      skillStates: states,
      resumeHint: lastSession ? { lastSessionId: lastSession.id } : null,
    },
    { request, env: ctx.env },
  );
};

const postSession: Handler = async (request, ctx, params) => {
  const principal = await principalOf(request, ctx);
  const child = await requireOwnedChild(ctx.db, principal, params.childId!);
  const body = parse(createSessionBody, await readJson(request));

  // Idempotent on the client-generated sessionId: a retried POST after a
  // dropped response must not open a second session for the same play.
  const [created] = await ctx.db
    .insert(sessions)
    .values({
      id: body.sessionId,
      childId: child.id,
      startedAt: new Date(body.startedAt),
      clientAppVersion: body.clientAppVersion,
      contentPackVersion: body.contentPackVersion,
    })
    .onConflictDoNothing()
    .returning({ id: sessions.id });

  return json({ sessionId: body.sessionId }, {
    status: created ? 201 : 200,
    request,
    env: ctx.env,
  });
};

/**
 * The workhorse. Ingest, then project, then recompute.
 *
 * Ingest is what the client's queue depends on and is deliberately the only
 * part whose failure the client is told about. Projection and recompute are
 * derived state: if they fail, the log is still complete and a rebuild fixes
 * it, so they must never turn a successful upload into a retry the client
 * repeats forever.
 */
const postEvents: Handler = async (request, ctx, params) => {
  const principal = await principalOf(request, ctx);
  const child = await requireOwnedChild(ctx.db, principal, params.childId!);
  const body = parse(eventBatch, await readJson(request));

  const result = await ingestEvents(ctx.db, child, body.events);

  try {
    await projectEvents(ctx.db, child, body.events as unknown as TelemetryEvent[]);
    await recomputeSkillStates(ctx.db, child);
  } catch (error) {
    console.error('projection failed after successful ingest', error);
  }

  return json(result, { request, env: ctx.env });
};

const getSkillStates: Handler = async (request, ctx, params) => {
  const principal = await principalOf(request, ctx);
  const child = await requireOwnedChild(ctx.db, principal, params.childId!);
  const rows = await ctx.db
    .select()
    .from(skillStates)
    .where(eq(skillStates.childId, child.id));
  return json(rows, { request, env: ctx.env });
};

/**
 * Spec 1.4's acceptance criterion: "ניתן לשחזר את רצף הפעולות".
 *
 * Ordered by clientSeq, not by any timestamp — see the note on the field. A
 * replay ordered by a child's device clock is a replay in the wrong order on
 * any tablet whose clock has drifted, which is most of them.
 */
const getTimeline: Handler = async (request, ctx, params) => {
  const principal = await principalOf(request, ctx);
  const child = await requireOwnedChild(ctx.db, principal, params.childId!);

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  if (sessionId && !z.string().uuid().safeParse(sessionId).success) {
    throw new BadRequest('sessionId must be a uuid');
  }

  const where = sessionId
    ? and(eq(events.childId, child.id), eq(events.sessionId, sessionId))
    : eq(events.childId, child.id);

  const rows = await ctx.db
    .select()
    .from(events)
    .where(where)
    .orderBy(events.clientSeq)
    .limit(5000);

  return json({ events: rows }, { request, env: ctx.env });
};

const ROUTES: readonly Route[] = [
  { method: 'POST', pattern: '/v1/children', handler: postChildren },
  { method: 'GET', pattern: '/v1/children/:childId/bootstrap', handler: getBootstrap },
  { method: 'POST', pattern: '/v1/children/:childId/sessions', handler: postSession },
  { method: 'POST', pattern: '/v1/children/:childId/events', handler: postEvents },
  { method: 'GET', pattern: '/v1/children/:childId/skill-states', handler: getSkillStates },
  { method: 'GET', pattern: '/v1/parent/:childId/timeline', handler: getTimeline },
];

/**
 * Every route that takes a childId, for the test that walks all of them.
 *
 * Exported so the cross-tenant test cannot drift from the router: a new route
 * added below without being listed here is a route with no isolation test, and
 * "we forgot one" is the entire failure mode this is guarding against.
 */
export const CHILD_SCOPED_ROUTES = ROUTES.filter((r) => r.pattern.includes(':childId')).map(
  (r) => ({ method: r.method, pattern: r.pattern }),
);

export { NotFound };
