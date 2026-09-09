import { BadRequest, Conflict, NotFound, Unauthenticated } from '../auth/principal.js';

/**
 * HTTP plumbing, written against the Web Fetch API (Request → Response).
 *
 * Not Express. The production brief targets serverless Node — Vercel, Render or
 * Cloudflare Workers — and Request/Response is the one handler signature all
 * three run natively. A framework here would either pin the deploy target or
 * need an adapter per target, and this layer is thin enough that neither is
 * worth paying for.
 */

export interface AppEnv {
  /** Anything but 'production' is treated as a development environment. */
  readonly nodeEnv: string;
  /** The single origin the browser app is served from. */
  readonly allowedOrigin: string;
}

/**
 * Headers on every response.
 *
 * A JSON API cannot be XSS'd the way a page can, but these cost nothing and the
 * failure mode of omitting them is a browser deciding for itself. `no-store` is
 * the important one: every route here returns one family's data, and a shared
 * cache holding a bootstrap response is a cross-tenant leak that no
 * authorization check can see.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

/**
 * CORS, deliberately narrow: one origin, credentials allowed.
 *
 * The session is a cookie, so `credentials: include` is required and therefore
 * `Access-Control-Allow-Origin: *` is forbidden by the browser anyway — but
 * echoing back whatever Origin arrived would be the same mistake with extra
 * steps, and it is a common one. One configured origin, compared exactly.
 */
export function corsHeaders(request: Request, env: AppEnv): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || origin !== env.allowedOrigin) return {};
  return {
    'access-control-allow-origin': env.allowedOrigin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

export function json(
  body: unknown,
  init: { status?: number; request: Request; env: AppEnv },
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { ...SECURITY_HEADERS, ...corsHeaders(init.request, init.env) },
  });
}

/**
 * Turns a thrown error into a response.
 *
 * Standing security rule: production errors return generic messages — no stack
 * traces, no schema leakage. So the split is explicit rather than incidental:
 *
 *   - Errors this code threw on purpose carry a status and a message that was
 *     written to be seen. `NotFound` says "not found" and nothing else, which
 *     is the whole point of using it for "not yours" as well.
 *   - Anything else is a bug, and a bug's message is for the operator. The
 *     client gets a flat 500.
 *
 * Validation detail (which field, which rule) is genuinely useful when building
 * a client and is a description of the schema when read by anyone else, so it
 * appears outside production only.
 */
export function errorResponse(
  error: unknown,
  ctx: { request: Request; env: AppEnv },
): Response {
  const isProd = ctx.env.nodeEnv === 'production';

  if (
    error instanceof NotFound ||
    error instanceof Unauthenticated ||
    error instanceof Conflict ||
    error instanceof BadRequest
  ) {
    const body: Record<string, unknown> = { error: error.message };
    if (!isProd && error instanceof BadRequest && error.detail !== undefined) {
      body.detail = error.detail;
    }
    return json(body, { status: error.status, ...ctx });
  }

  // Deliberately not `error.message`: an unexpected error's message is whatever
  // the driver or the runtime chose to say, which has included table names,
  // column names and connection strings.
  console.error('unhandled error', error);
  return json({ error: 'internal error' }, { status: 500, ...ctx });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new BadRequest('body must be valid JSON');
  }
}
