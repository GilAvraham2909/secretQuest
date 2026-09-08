/**
 * @file EventBus.js
 * Minimal synchronous pub/sub used to decouple modules (e.g. profile
 * lifecycle events, sound mute state) without importing each other directly.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, new Set());
    }
    this._handlers.get(event).add(handler);
    return () => this.off(event, handler);
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    this._handlers.get(event)?.delete(handler);
  }

  /**
   * @param {string} event
   * @param {*} [payload]
   */
  emit(event, payload) {
    const set = this._handlers.get(event);
    if (!set) return;
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error('[Riki] EventBus handler threw for event', event, err);
      }
    }
  }
}

/** Shared app-wide singleton bus. */
export const eventBus = new EventBus();
