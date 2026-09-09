import type { TelemetryEvent } from '@secret-journey/shared';

/**
 * The durable outbox — architecture §6.3.
 *
 * This is the mechanism behind three separate acceptance criteria at once:
 * spec 1.4 ("הנתונים נשמרים גם אם הילד יוצא"), 16.4 ("לשמור נתונים מיד") and
 * criterion 3.7 (">=95% complete records"). If it is wrong, the study's data is
 * wrong, and the failure is silent — which is why it is a module with its own
 * tests rather than a fetch call in a component.
 *
 * WHY INDEXEDDB AND NOT localStorage
 * ==================================
 * localStorage is synchronous, so every write blocks the main thread — during
 * a balloon-pop animation, on a cheap tablet, that is a visible stutter in the
 * exact moment the child is being told they succeeded. It is also string-only
 * and capped around 5MB, and an event log over a multi-week study exceeds that.
 *
 * WHY THE STORE IS INJECTED
 * =========================
 * `indexedDB` arrives as a parameter rather than off `globalThis`, so the tests
 * run against a real IndexedDB implementation instead of a hand-written double.
 * A double would agree with whatever this code does, which is the opposite of
 * useful for the one component whose failure mode is losing data quietly.
 */

const DB_NAME = 'secret-journey-outbox';
const DB_VERSION = 1;
const STORE = 'events';
const META = 'meta';

/**
 * Architecture §6.3 rule 9. A supervised study should never come near this, but
 * "should never" is not a storage policy: without a ceiling, a client that can
 * never reach the server fills the device's quota and then fails every write,
 * including the ones that would have told us.
 */
export const MAX_QUEUED_EVENTS = 10_000;

export interface OutboxOptions {
  readonly indexedDB: IDBFactory;
  /** Called when the cap forces eviction. Loud on purpose — see below. */
  readonly onOverflow?: (droppedCount: number) => void;
}

export interface QueuedEvent {
  /** Auto-increment key. Insertion order IS flush order. */
  readonly queueKey?: number;
  readonly event: TelemetryEvent;
}

export class Outbox {
  private db: IDBDatabase | null = null;
  private readonly factory: IDBFactory;
  private readonly onOverflow: (n: number) => void;

  constructor(opts: OutboxOptions) {
    this.factory = opts.indexedDB;
    this.onOverflow = opts.onOverflow ?? ((n) => console.warn(`outbox evicted ${n} events`));
  }

  async open(): Promise<void> {
    if (this.db) return;
    this.db = await promisify<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'queueKey', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(META)) {
          db.createObjectStore(META);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Appends one event. Resolves once the transaction has COMMITTED.
   *
   * The await is the whole point, and it is the part that is tempting to drop:
   * "append before animate" (§6.3 rule 1) means the caller does not paint
   * anything until this has resolved. Firing it off unawaited would make the
   * animation smoother and the guarantee false — a tab that dies during the
   * celebration would lose the attempt that caused it.
   */
  async append(event: TelemetryEvent): Promise<void> {
    await this.open();
    const db = this.db!;

    await promisify<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add({ event });
      // `oncomplete`, not `onsuccess` on the request: the request succeeding
      // means the write is staged, the transaction completing means it is
      // durable. Only the second one is the promise this method makes.
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await this.enforceCap();
  }

  /** The next batch to send, oldest first. */
  async peek(limit: number): Promise<QueuedEvent[]> {
    await this.open();
    const db = this.db!;

    return promisify<QueuedEvent[]>((resolve, reject) => {
      const out: QueuedEvent[] = [];
      const tx = db.transaction(STORE, 'readonly');
      const cursorRequest = tx.objectStore(STORE).openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || out.length >= limit) return resolve(out);
        out.push(cursor.value as QueuedEvent);
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    });
  }

  /**
   * Removes events the server has accounted for.
   *
   * Duplicates count. The server reporting an event as already-known is just as
   * good a reason to delete it locally as a fresh insert — that is what makes
   * retrying a batch forever safe, and it is why the ingest response separates
   * the two lists rather than returning a count.
   */
  async acknowledge(keys: readonly number[]): Promise<void> {
    if (keys.length === 0) return;
    await this.open();
    const db = this.db!;

    await promisify<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const key of keys) store.delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async size(): Promise<number> {
    await this.open();
    const db = this.db!;
    return promisify<number>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * The monotonic per-child counter — §6.3 rule 4.
   *
   * Persisted, and read-modify-write inside ONE transaction so two events
   * appended in the same tick cannot receive the same sequence number. It, not
   * the wall clock, defines replay order: a child's tablet may be wrong by
   * hours, and one that has never been online may be wrong by years.
   */
  async nextClientSeq(childId: string): Promise<number> {
    await this.open();
    const db = this.db!;
    const key = `clientSeq:${childId}`;

    return promisify<number>((resolve, reject) => {
      const tx = db.transaction(META, 'readwrite');
      const store = tx.objectStore(META);
      const read = store.get(key);
      let next = 1;
      read.onsuccess = () => {
        next = ((read.result as number | undefined) ?? 0) + 1;
        store.put(next, key);
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private async enforceCap(): Promise<void> {
    const size = await this.size();
    if (size <= MAX_QUEUED_EVENTS) return;

    const excess = size - MAX_QUEUED_EVENTS;
    const oldest = await this.peek(excess);
    await this.acknowledge(oldest.map((q) => q.queueKey!).filter((k) => k !== undefined));

    /*
     * Oldest-first, and loudly.
     *
     * Dropping the NEWEST would be easier and is the wrong choice: the oldest
     * events are the ones a partially-flushed queue has already sent, and more
     * importantly a study that loses its beginning loses the baseline it exists
     * to measure against. Either way this is data loss, so it must never be
     * silent — the whole point of the cap is that the alternative is losing
     * everything without a word.
     */
    this.onOverflow(excess);
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

function promisify<T>(
  executor: (resolve: (value: T) => void, reject: (reason: unknown) => void) => void,
): Promise<T> {
  return new Promise<T>(executor);
}
