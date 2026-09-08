/**
 * @file SettingsRepository.js
 * CRUD over riki:settings — device-level settings (not per-profile).
 */
import { StorageKeys } from '../storage/StorageKeys.js';
import { defaultSettings, migrate, CURRENT_SCHEMA_VERSION } from './schema.js';

export class SettingsRepository {
  /** @param {import('../storage/StorageProvider.js').StorageProvider} storageProvider */
  constructor(storageProvider) {
    this._storage = storageProvider;
  }

  /** @returns {Promise<{schemaVersion: number, muted: boolean}>} */
  async get() {
    const raw = await this._storage.getItem(StorageKeys.SETTINGS);
    if (!raw) {
      const defaults = defaultSettings();
      await this._storage.setItem(StorageKeys.SETTINGS, defaults);
      return defaults;
    }
    const fromVersion = raw.schemaVersion ?? CURRENT_SCHEMA_VERSION;
    const migrated = migrate(raw, fromVersion);
    if (fromVersion !== CURRENT_SCHEMA_VERSION) {
      await this._storage.setItem(StorageKeys.SETTINGS, migrated);
    }
    return migrated;
  }

  /** @param {{schemaVersion?: number, muted: boolean}} settings @returns {Promise<void>} */
  async save(settings) {
    const toSave = { schemaVersion: CURRENT_SCHEMA_VERSION, ...settings };
    await this._storage.setItem(StorageKeys.SETTINGS, toSave);
  }
}
