/**
 * @file LocalStorageProvider.js
 * Concrete StorageProvider backed by window.localStorage.
 *
 * Wrapped in try/catch: if localStorage is unavailable (private browsing
 * in some browsers, quota exceeded, disabled storage) it transparently
 * falls back to an in-memory Map so the game keeps working for the current
 * tab session, and logs a gentle console warning. Callers can inspect
 * `isPersistent` to know whether data will actually survive a reload.
 *
 * @implements {StorageProvider}
 */
import { StorageProvider } from './StorageProvider.js';
import { logger } from '../../utils/logger.js';

export class LocalStorageProvider extends StorageProvider {
  constructor() {
    super();
    this._memoryFallback = new Map();
    this.isPersistent = this._probe();
    this._quotaWarningShown = false;
  }

  async _warnQuotaExceededOnce() {
    if (this._quotaWarningShown) return;
    this._quotaWarningShown = true;
    try {
      const { showToast } = await import('../../ui/Toast.js');
      showToast('אין מקום פנוי לשמור נתונים חדשים. ההתקדמות הנוכחית תישמר רק עד סגירת הדף.', {
        variant: 'warning',
        duration: 5000,
      });
    } catch (err) {
      logger.warn('Could not show storage-quota toast.', err);
    }
  }

  _probe() {
    try {
      const testKey = '__riki_storage_probe__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      logger.warn('LocalStorage unavailable, falling back to in-memory storage for this session.', err);
      return false;
    }
  }

  async getItem(key) {
    if (!this.isPersistent) {
      return this._memoryFallback.has(key) ? this._memoryFallback.get(key) : null;
    }
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
      // Not in real storage — it may only exist in the in-memory fallback
      // because a previous write for this key hit a quota error.
      return this._memoryFallback.has(key) ? this._memoryFallback.get(key) : null;
    } catch (err) {
      logger.warn(`Failed to read "${key}" from localStorage.`, err);
      return this._memoryFallback.has(key) ? this._memoryFallback.get(key) : null;
    }
  }

  async setItem(key, value) {
    if (!this.isPersistent) {
      this._memoryFallback.set(key, value);
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      this._memoryFallback.set(key, value);
    } catch (err) {
      logger.warn(`Failed to write "${key}" to localStorage (quota exceeded?). Keeping in-memory only.`, err);
      this._memoryFallback.set(key, value);
      // Swallow the error rather than rethrowing: per the "zero frustration"
      // rule, a storage failure must never break the game flow. The value
      // still lives in the in-memory fallback for the rest of this session.
      this._warnQuotaExceededOnce();
    }
  }

  async removeItem(key) {
    this._memoryFallback.delete(key);
    if (!this.isPersistent) return;
    try {
      window.localStorage.removeItem(key);
    } catch (err) {
      logger.warn(`Failed to remove "${key}" from localStorage.`, err);
    }
  }

  async hasItem(key) {
    if (!this.isPersistent) {
      return this._memoryFallback.has(key);
    }
    try {
      return window.localStorage.getItem(key) !== null;
    } catch (err) {
      return this._memoryFallback.has(key);
    }
  }
}
