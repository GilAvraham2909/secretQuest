import type { Db } from '../db/client.js';
import { events } from '../db/schema.js';
import { BadRequest } from '../auth/principal.js';
import type { OwnedChild } from './guard.js';
import type { ValidatedEvent } from '../api/eventSchemas.js';

/**
 * Telemetry ingest. The workhorse — architecture §6.4.
 *
 * TWO PROPERTIES, AND THE CLIENT DEPENDS ON BOTH
 * ==============================================
 * 1. Idempotent. `event_id` is the primary key and the insert is ON CONFLICT DO
 *    NOTHING, so re-POSTing a batch is always safe. This is what lets the
 *    offline flusher retry forever without tracking what the server already
 *    has — and it is why the response distinguishes accepted from duplicates:
 *    the client needs to know it may delete those rows locally, and a duplicate
 *    is just as good a reason to delete as an insert.
 *
 * 2. All-or-nothing per batch. A partially applied batch would leave the client
 *    unable to say what it still owes, and the queue would either lose events
 *    or resend forever.
 */

export interface IngestResult {
  readonly accepted: string[];
  readonly duplicates: string[];
}

export async function ingestEvents(
  db: Db,
  child: OwnedChild,
  batch: readonly ValidatedEvent[],
): Promise<IngestResult> {
  /*
   * The authorization check that actually matters here already happened: the
   * caller could not have obtained an OwnedChild without it. What is left is
   * making sure the batch does not smuggle a different child in its bodies.
   *
   * childId is in the path precisely so there is ONE id to authorize. An event
   * whose own childId disagrees rejects the WHOLE batch rather than being
   * dropped quietly: a client that sends mismatched ids is either broken or
   * hostile, and in both cases silently accepting the rest is wrong — the first
   * loses data without telling anyone, the second is the bug.
   */
  const foreign = batch.filter((e) => e.childId !== child.id);
  if (foreign.length > 0) {
    throw new BadRequest('event childId does not match the path', {
      eventIds: foreign.map((e) => e.eventId),
    });
  }

  // A batch that repeats an id inside itself would make ON CONFLICT fire
  // against a row from the same statement, which Postgres refuses outright
  // ("cannot affect row a second time"). De-duplicate first, and count the
  // repeats as duplicates — which is exactly what they are.
  const seen = new Set<string>();
  const unique: ValidatedEvent[] = [];
  const withinBatchDuplicates: string[] = [];
  for (const e of batch) {
    if (seen.has(e.eventId)) withinBatchDuplicates.push(e.eventId);
    else {
      seen.add(e.eventId);
      unique.push(e);
    }
  }

  const inserted = await db
    .insert(events)
    .values(
      unique.map((e) => ({
        eventId: e.eventId,
        childId: child.id,
        sessionId: e.sessionId,
        clientSeq: e.clientSeq,
        type: e.type,
        occurredAt: new Date(e.occurredAt),
        schemaVersion: e.schemaVersion,
        payload: e.payload,
      })),
    )
    .onConflictDoNothing()
    .returning({ eventId: events.eventId });

  const acceptedIds = new Set(inserted.map((r) => r.eventId));
  const accepted = unique.filter((e) => acceptedIds.has(e.eventId)).map((e) => e.eventId);
  const duplicates = [
    ...unique.filter((e) => !acceptedIds.has(e.eventId)).map((e) => e.eventId),
    ...withinBatchDuplicates,
  ];

  return { accepted, duplicates };
}
