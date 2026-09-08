/**
 * @file StorageProvider.js
 * Abstract storage contract. Every persistence backend (LocalStorage today,
 * a future cloud/REST backend tomorrow) must implement this exact async
 * interface so the rest of the app never needs to know which one is active.
 *
 * All methods return Promises even though the LocalStorage implementation
 * resolves synchronously — this is the seam that makes swapping in a real
 * network-backed provider later a non-breaking change.
 *
 * @interface StorageProvider
 */
export class StorageProvider {
  /**
   * @param {string} key
   * @returns {Promise<any|null>} parsed value, or null if absent
   */
  async getItem(key) {
    throw new Error('StorageProvider.getItem() not implemented');
  }

  /**
   * @param {string} key
   * @param {any} value JSON-serializable value
   * @returns {Promise<void>}
   */
  async setItem(key, value) {
    throw new Error('StorageProvider.setItem() not implemented');
  }

  /**
   * @param {string} key
   * @returns {Promise<void>}
   */
  async removeItem(key) {
    throw new Error('StorageProvider.removeItem() not implemented');
  }

  /**
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async hasItem(key) {
    throw new Error('StorageProvider.hasItem() not implemented');
  }
}
