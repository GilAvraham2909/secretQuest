import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { children } from '../db/schema.js';
import { Conflict, type Principal } from '../auth/principal.js';
import { isUuid, type OwnedChild } from './guard.js';
import { BadRequest } from '../auth/principal.js';

/**
 * Creating a child profile.
 *
 * The id arrives from the client (architecture §6.3 rule 3) so that the very
 * first session can run before the network has ever succeeded. That is the
 * right call for the offline story and it creates one problem: an id chosen by
 * a client can be chosen to collide with someone else's.
 *
 * Hence three outcomes, and the difference between them is the security
 * property:
 *
 *   - new id                     → created
 *   - your id, posted again      → returns yours, unchanged (the retry case,
 *                                  which will happen constantly on a flaky
 *                                  connection)
 *   - someone else's id          → Conflict, with no detail whatsoever
 *
 * What it must never be is an upsert. `INSERT … ON CONFLICT DO UPDATE` here
 * would let anyone who guesses or learns a child id overwrite that child's
 * profile and — depending on how the update is written — reparent it. That is
 * an account-takeover primitive, and it looks exactly like ordinary
 * idempotency in a diff.
 */
export async function createChild(
  db: Db,
  principal: Principal,
  input: {
    childId: string;
    displayName: string | null;
    avatarId: string;
  },
): Promise<{ child: OwnedChild; created: boolean }> {
  if (!isUuid(input.childId)) throw new BadRequest('childId must be a uuid');

  const existing = await db
    .select({
      id: children.id,
      parentId: children.parentId,
      displayName: children.displayName,
      avatarId: children.avatarId,
    })
    .from(children)
    .where(eq(children.id, input.childId))
    .limit(1);

  const row = existing[0];
  if (row) {
    // Not "if it is not mine, 403". The response for someone else's id and the
    // response for a genuinely duplicated id of your own must not let a caller
    // tell those apart by anything except owning it.
    if (row.parentId !== principal.parentId) throw new Conflict('child id unavailable');
    return { child: row as OwnedChild, created: false };
  }

  const [inserted] = await db
    .insert(children)
    .values({
      id: input.childId,
      parentId: principal.parentId,
      displayName: input.displayName,
      avatarId: input.avatarId,
    })
    // A concurrent request with the same id lands here. DO NOTHING, then re-read
    // and apply the same ownership rule as above — never DO UPDATE.
    .onConflictDoNothing()
    .returning({
      id: children.id,
      parentId: children.parentId,
      displayName: children.displayName,
      avatarId: children.avatarId,
    });

  if (inserted) return { child: inserted as OwnedChild, created: true };

  const [raced] = await db
    .select({
      id: children.id,
      parentId: children.parentId,
      displayName: children.displayName,
      avatarId: children.avatarId,
    })
    .from(children)
    .where(and(eq(children.id, input.childId), eq(children.parentId, principal.parentId)))
    .limit(1);

  if (!raced) throw new Conflict('child id unavailable');
  return { child: raced as OwnedChild, created: false };
}

/** Every child of the calling parent. The only unscoped-by-id read there is. */
export async function listChildren(db: Db, principal: Principal): Promise<OwnedChild[]> {
  const rows = await db
    .select({
      id: children.id,
      parentId: children.parentId,
      displayName: children.displayName,
      avatarId: children.avatarId,
    })
    .from(children)
    .where(eq(children.parentId, principal.parentId));
  return rows as OwnedChild[];
}
