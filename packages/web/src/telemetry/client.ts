import {
  EVENT_SCHEMA_VERSION,
  type EventType,
  type EventPayload,
  type TelemetryEvent,
} from '@secret-journey/shared';
import { Outbox } from './outbox.js';
import { Flusher, AuthExpired, PermanentlyRejected, type Transport } from './flusher.js';

/**
 * What game code talks to.
 *
 * One method — `record` — and it returns a promise the caller is expected to
 * await before painting anything. That is architecture §6.3 rule 1, "append
 * before animate", and making it the only shape available is the point: there
 * is no fire-and-forget variant to reach for on a busy afternoon.
 */

export interface TelemetryClientOptions {
  readonly childId: string;
  readonly sessionId: string;
  readonly outbox: Outbox;
  readonly flusher: Flusher;
  readonly now?: () => Date;
  readonly newId?: () => string;
}

export class TelemetryClient {
  constructor(private readonly opts: TelemetryClientOptions) {}

  /**
   * Makes one event durable, then returns.
   *
   * Deliberately does NOT await the flush. Durability is what the caller is
   * waiting for; delivery is the flusher's problem and may take days. Awaiting
   * the network here would put it back inside the child's feedback loop, which
   * is the one thing architecture §6.1 says is non-negotiable.
   */
  async record(type: EventType, payload: EventPayload): Promise<void> {
    const clientSeq = await this.opts.outbox.nextClientSeq(this.opts.childId);

    const event: TelemetryEvent = {
      eventId: (this.opts.newId ?? defaultId)(),
      clientSeq,
      childId: this.opts.childId,
      sessionId: this.opts.sessionId,
      type,
      occurredAt: (this.opts.now ?? (() => new Date()))().toISOString(),
      schemaVersion: EVENT_SCHEMA_VERSION,
      payload,
    };

    await this.opts.outbox.append(event);

    // Kick the flusher without waiting for it. If it is already draining this
    // returns immediately.
    void this.opts.flusher.flush();
  }
}

function defaultId(): string {
  return crypto.randomUUID();
}

/**
 * The HTTP transport.
 *
 * `credentials: 'include'` because the parent's session is an HttpOnly cookie —
 * the child's app never holds a token of its own (architecture §6.0).
 *
 * The status mapping is the contract with the flusher, and each branch is a
 * decision about what a failure MEANS rather than a translation of a number:
 *
 *   401  → stop and tell the parent. Retrying cannot fix an expired session.
 *   400  → drop the batch. The server will never accept it, and retrying would
 *          block every event queued behind it forever.
 *   else → the network is not working right now. Back off, retry, in silence.
 *          That includes 5xx, 429 and a thrown fetch, because from the child's
 *          side those are the same event: not now, try later.
 */
export function httpTransport(baseUrl: string, childId: string): Transport {
  return async (events) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/children/${childId}/events`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
      });
    } catch (cause) {
      // A thrown fetch is offline, DNS, a dropped connection. Ordinary.
      throw new Error('network unavailable', { cause });
    }

    if (response.status === 401) throw new AuthExpired();
    if (response.status === 400) {
      throw new PermanentlyRejected(await response.text().catch(() => undefined));
    }
    if (!response.ok) throw new Error(`server responded ${response.status}`);

    return (await response.json()) as { accepted: string[]; duplicates: string[] };
  };
}

/**
 * Wires the three pieces together and starts draining whatever a previous
 * session left behind (§6.3 rule 7).
 */
export async function startTelemetry(opts: {
  childId: string;
  sessionId: string;
  baseUrl: string;
  indexedDB: IDBFactory;
  onAuthExpired?: () => void;
}): Promise<{ client: TelemetryClient; flusher: Flusher; outbox: Outbox }> {
  const outbox = new Outbox({ indexedDB: opts.indexedDB });
  await outbox.open();

  const flusher = new Flusher({
    outbox,
    transport: httpTransport(opts.baseUrl, opts.childId),
    onAuthExpired: opts.onAuthExpired,
  });

  const client = new TelemetryClient({
    childId: opts.childId,
    sessionId: opts.sessionId,
    outbox,
    flusher,
  });

  // A session quit mid-round uploads on the NEXT launch, not on a schedule.
  void flusher.flush();

  return { client, flusher, outbox };
}

/**
 * Best-effort end-of-session signalling — architecture §6.3 rule 8.
 *
 * `visibilitychange` and `pagehide`, never `beforeunload`: beforeunload does
 * not fire reliably when mobile Safari discards a backgrounded tab, which is
 * exactly the case this exists for.
 *
 * And it is genuinely best-effort. Every task event was already durable at the
 * moment it happened, so a missing session end costs nothing — the server
 * closes stale sessions with a sweep. Building anything load-bearing on a
 * lifecycle event that fires "usually" is how a study loses a day of sessions
 * to an OS update.
 */
export function installSessionEndBeacon(opts: {
  baseUrl: string;
  childId: string;
  event: TelemetryEvent;
}): () => void {
  const send = () => {
    const body = JSON.stringify({ events: [opts.event] });
    const url = `${opts.baseUrl}/v1/children/${opts.childId}/events`;
    // sendBeacon survives the page going away; fetch does not.
    navigator.sendBeacon?.(url, new Blob([body], { type: 'application/json' }));
  };

  const onHidden = () => {
    if (document.visibilityState === 'hidden') send();
  };

  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', send);

  return () => {
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', send);
  };
}
