import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { children } from '../db/schema.js';
import { NotFound, type Principal } from '../auth/principal.js';

/**
 * The ownership guard.
 *
 * WHY THIS IS A MODULE AND NOT A LINE IN EACH HANDLER
 * ===================================================
 * Broken object-level authorization is the most common serious API flaw there
 * is, and its shape is always the same: fifteen endpoints do the check and the
 * sixteenth forgets. Here that failure would mean one family reading another
 * family's child — their name, what they find hard, when they play.
 *
 * So the check is not a line handlers are supposed to remember. It is the only
 * way to turn a `childId` from the request into anything usable: no handler
 * receives a child id it can query with, it receives an OwnedChild it can only
 * obtain by passing through here.
 *
 * The failure is NotFound, never Forbidden — see the note on NotFound.
 */

/**
 * A child id that has been proven to belong to the calling parent.
 *
 * The brand is the point. A plain `string` from `req.params` is assignable to
 * anything expecting a child id; an `OwnedChildId` can only be produced by
 * `requireOwnedChild`, so "did anyone authorize this?" becomes a question the
 * compiler answers rather than a question review has to.
 */
export type OwnedChildId = string & { readonly __ownedBy: unique symbol };

export interface OwnedChild {
  readonly id: OwnedChildId;
  readonly parentId: string;
  readonly displayName: string | null;
  readonly avatarId: string;
}

/**
 * Resolves a client-supplied child id to a child the caller owns.
 *
 * Every read and every write that touches child data starts here. It is one
 * indexed lookup on the primary key with a parent_id equality — the cost of
 * being safe on every request is a single index hit, which is not a trade-off
 * worth thinking about again.
 */
export async function requireOwnedChild(
  db: Db,
  principal: Principal,
  childId: string,
): Promise<OwnedChild> {
  // A malformed id must not reach the driver as a uuid cast error — that would
  // return 500 where the honest answer is "no such child of yours".
  if (!isUuid(childId)) throw new NotFound('child not found');

  const [row] = await db
    .select({
      id: children.id,
      parentId: children.parentId,
      displayName: children.displayName,
      avatarId: children.avatarId,
    })
    .from(children)
    .where(and(eq(children.id, childId), eq(children.parentId, principal.parentId)))
    .limit(1);

  // Note the WHERE: the parent match is part of the query, not an if-statement
  // after it. A check performed after fetching is a check someone can later
  // "optimise" past, and it means the row was in memory either way.
  if (!row) throw new NotFound('child not found');

  return row as OwnedChild;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
