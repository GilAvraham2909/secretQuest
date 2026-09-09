import { MAX_EVENT_BATCH, type TelemetryEvent } from '@secret-journey/shared';
import type { Outbox } from './outbox.js';

/**
 * The flusher — architecture §6.3 rule 6.
 *
 * THE RULE THAT SHAPES EVERYTHING HERE
 * ====================================
 * "The flusher never touches the UI." A network failure produces no message, no
 * spinner, no degraded mode and no blocked interaction. **The child cannot
 * tell.** That is not a nicety: spec 1.5's acceptance criterion is that a child
 * can never get stuck, and an offline banner in front of a five-year-old is
 * being stuck. It is also why this returns nothing anyone can render — there is
 * deliberately no `isOnline`, no `pendingCount`, no error state to bind to.
 *
 * The one exception is the parent, and only for an expired session, which is
 * the single failure retrying cannot fix.
 */

export interface FlushResult {
  readonly accepted: string[];
  readonly duplicates: string[];
}

export type Transport = (events: readonly TelemetryEvent[]) => Promise<FlushResult>;

export interface FlusherOptions {
  readonly outbox: Outbox;
  readonly transport: Transport;
  readonly batchSize?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Injected so tests are deterministic and instant rather than timing-based. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  /**
   * Called when the server says the session is gone. The ONLY thing that
   * surfaces, and it surfaces to the parent — retrying cannot fix it.
   */
  readonly onAuthExpired?: () => void;
}

/** Thrown by a transport when the server rejects the session. */
export class AuthExpired extends Error {
  constructor() {
    super('session expired');
    this.name = 'AuthExpired';
  }
}

/**
 * Thrown by a transport for a batch the server will never accept — a 400.
 * Retrying is pointless and would block every event behind it forever, so the
 * batch is dropped and logged as a defect rather than retried (§6.4).
 */
export class PermanentlyRejected extends Error {
  constructor(readonly detail?: unknown) {
    super('batch rejected');
    this.name = 'PermanentlyRejected';
  }
}

export class Flusher {
  /**
   * The drain currently in progress, if any.
   *
   * Held as a promise rather than a boolean so a concurrent call can AWAIT the
   * running loop instead of returning immediately. Returning early looks
   * equivalent — only one loop runs either way — but it quietly breaks the
   * meaning of `await flush()`: the caller believes the queue is drained when
   * in fact another loop is still working through it. The loop keeps peeking
   * until the queue is empty, so anything appended while it runs is picked up
   * by it, and awaiting it really does mean "drained".
   */
  private current: Promise<void> | null = null;
  private stopped = false;
  private attempt = 0;

  constructor(private readonly opts: FlusherOptions) {}

  private get batchSize() {
    return Math.min(this.opts.batchSize ?? MAX_EVENT_BATCH, MAX_EVENT_BATCH);
  }

  /**
   * Drains the queue, then keeps draining as long as there is anything left.
   *
   * Re-entrant by design: it is called on boot, after every append, and when
   * the tab becomes visible again, and only one loop may run at a time or two
   * loops send the same batch twice. (Harmless on the server — the insert is
   * idempotent — but it doubles the traffic of a device already struggling.)
   */
  async flush(): Promise<void> {
    if (this.stopped) return;
    if (this.current) return this.current;
    this.current = this.drain();
    try {
      await this.current;
    } finally {
      this.current = null;
    }
  }

  private async drain(): Promise<void> {
    try {
      for (;;) {
        if (this.stopped) return;

        const queued = await this.opts.outbox.peek(this.batchSize);
        if (queued.length === 0) {
          this.attempt = 0;
          return;
        }

        const events = queued.map((q) => q.event);
        const keys = queued.map((q) => q.queueKey!).filter((k) => k !== undefined);

        try {
          const result = await this.opts.transport(events);
          // Accepted AND duplicates are both settled — see Outbox.acknowledge.
          await this.opts.outbox.acknowledge(keys);
          this.attempt = 0;
          void result;
        } catch (error) {
          if (error instanceof AuthExpired) {
            // Retrying will not help and hammering an expired session is worse
            // than stopping. The queue is untouched: everything flushes once
            // the parent signs back in.
            this.opts.onAuthExpired?.();
            return;
          }

          if (error instanceof PermanentlyRejected) {
            // A batch the server will never accept must not block the queue
            // behind it forever. Drop it, and make noise — this is a client
            // defect, and the events are already lost either way.
            console.error('outbox: dropping permanently rejected batch', error.detail);
            await this.opts.outbox.acknowledge(keys);
            continue;
          }

          // Everything else is "the network is not working right now", which is
          // the ordinary case rather than an error. Back off and try again,
          // forever, in silence.
          this.attempt++;
          await this.sleep(this.backoffMs());
        }
      }
    } catch (error) {
      // A drain must never reject. Rule 6 is that a network failure produces no
      // message and no degraded mode; a rejected promise is a thing somebody
      // eventually catches into a UI state a child can see. Anything reaching
      // here is a bug in this file, so it is logged for the operator and
      // swallowed for the child.
      console.error('outbox: drain aborted', error);
    }
  }

  /**
   * Exponential backoff, 1s doubling to a 60s cap, with jitter.
   *
   * The jitter is not decoration. A classroom of tablets that all lost wifi at
   * the same moment will otherwise retry in lockstep and arrive as a
   * synchronised burst the instant it returns — the outage recovers into a
   * self-inflicted thundering herd.
   */
  private backoffMs(): number {
    const base = this.opts.baseDelayMs ?? 1000;
    const cap = this.opts.maxDelayMs ?? 60_000;
    const rand = this.opts.random ?? Math.random;
    const exponential = Math.min(cap, base * 2 ** (this.attempt - 1));
    return Math.round(exponential * (0.5 + rand() * 0.5));
  }

  private sleep(ms: number): Promise<void> {
    if (this.opts.sleep) return this.opts.sleep(ms);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  stop(): void {
    this.stopped = true;
  }
}
