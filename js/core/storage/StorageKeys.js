/**
 * @file StorageKeys.js
 * Centralized, namespaced LocalStorage key constants. Always prefix new
 * keys with "riki:" to avoid collisions with anything else on the origin.
 */
export const StorageKeys = Object.freeze({
  META: 'riki:meta',
  PROFILES: 'riki:profiles',
  ACTIVE_PROFILE_ID: 'riki:activeProfileId',
  SETTINGS: 'riki:settings',
});
