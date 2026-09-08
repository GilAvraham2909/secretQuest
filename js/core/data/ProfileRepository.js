/**
 * @file ProfileRepository.js
 * CRUD over riki:profiles, a MAP keyed by profileId (not an array).
 * Runs schema migration on load. This is the only module that talks to
 * StorageProvider for profile data — everything else goes through
 * profiles/ProfileManager.js.
 */
import { StorageKeys } from '../storage/StorageKeys.js';
import { migrate, CURRENT_SCHEMA_VERSION } from './schema.js';
import { logger } from '../../utils/logger.js';

export class ProfileRepository {
  /** @param {import('../storage/StorageProvider.js').StorageProvider} storageProvider */
  constructor(storageProvider) {
    this._storage = storageProvider;
  }

  /** @returns {Promise<Object<string, object>>} map of profileId -> Profile */
  async _readAll() {
    const raw = await this._storage.getItem(StorageKeys.PROFILES);
    if (!raw || typeof raw !== 'object') return {};

    const migrated = {};
    let changed = false;
    for (const [id, profile] of Object.entries(raw)) {
      const fromVersion = profile?.schemaVersion ?? CURRENT_SCHEMA_VERSION;
      const upgraded = migrate(profile, fromVersion);
      if (fromVersion !== CURRENT_SCHEMA_VERSION) changed = true;
      migrated[id] = upgraded;
    }
    if (changed) {
      logger.info('Migrated stored profiles to schema version', CURRENT_SCHEMA_VERSION);
      await this._storage.setItem(StorageKeys.PROFILES, migrated);
    }
    return migrated;
  }

  /** @returns {Promise<object[]>} */
  async getAll() {
    const all = await this._readAll();
    return Object.values(all);
  }

  /** @param {string} id @returns {Promise<object|null>} */
  async getById(id) {
    const all = await this._readAll();
    return all[id] ?? null;
  }

  /** @param {object} profile @returns {Promise<object>} */
  async create(profile) {
    const all = await this._readAll();
    all[profile.id] = profile;
    await this._storage.setItem(StorageKeys.PROFILES, all);
    return profile;
  }

  /** @param {object} profile @returns {Promise<object>} */
  async update(profile) {
    const all = await this._readAll();
    profile.updatedAt = new Date().toISOString();
    all[profile.id] = profile;
    await this._storage.setItem(StorageKeys.PROFILES, all);
    return profile;
  }

  /** @param {string} id @returns {Promise<void>} */
  async delete(id) {
    const all = await this._readAll();
    delete all[id];
    await this._storage.setItem(StorageKeys.PROFILES, all);
  }
}
