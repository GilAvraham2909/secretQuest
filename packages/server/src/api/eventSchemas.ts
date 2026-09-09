import { z } from 'zod';
import { ALL_EVENT_TYPES, MAX_EVENT_BATCH } from '@secret-journey/shared';

/**
 * Validation at the boundary — the standing rule is Zod on every inbound
 * request and every webhook, and this is the highest-volume inbound surface in
 * the system.
 *
 * These schemas mirror the types in shared/telemetry/events.ts. The types are
 * the agreement between client and server; the schemas are what stops the
 * server believing a client that lies or a client that is simply an old build.
 *
 * A note on strictness: the envelope is `.strict()` — an unknown key is a
 * rejection, not something to ignore. This is a research instrument, and an
 * event carrying a field the server silently drops is data the study thinks it
 * has and does not. The payload is deliberately looser, because payload shapes
 * differ per event type and new ones must be able to arrive from a newer client
 * without the whole batch failing.
 */

const uuid = z.string().uuid();
const isoDateTime = z.string().datetime({ offset: true });

export const eventEnvelope = z
  .object({
    eventId: uuid,
    clientSeq: z.number().int().nonnegative(),
    childId: uuid,
    sessionId: uuid,
    type: z.enum(ALL_EVENT_TYPES as unknown as [string, ...string[]]),
    occurredAt: isoDateTime,
    schemaVersion: z.number().int().positive(),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();

export const eventBatch = z
  .object({
    events: z.array(eventEnvelope).min(1).max(MAX_EVENT_BATCH),
  })
  .strict();

export type ValidatedEvent = z.infer<typeof eventEnvelope>;

export const createChildBody = z
  .object({
    childId: uuid,
    // Bounded on purpose. This is the one free-text field a child's row has,
    // and the users are 5-7 — it holds a first name or a nickname. A field with
    // no ceiling is a field someone eventually pastes an address into.
    displayName: z.string().trim().min(1).max(40).nullable(),
    avatarId: z.string().trim().min(1).max(64),
    createdAt: isoDateTime.optional(),
  })
  .strict();

export const createSessionBody = z
  .object({
    sessionId: uuid,
    startedAt: isoDateTime,
    clientAppVersion: z.string().trim().min(1).max(64),
    contentPackVersion: z.string().trim().min(1).max(64),
  })
  .strict();
