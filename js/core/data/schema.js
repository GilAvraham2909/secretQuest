/**
 * @file schema.js
 * Data schema version, factory functions for default records, and the
 * migration pipeline. Any change to a persisted record's shape must bump
 * CURRENT_SCHEMA_VERSION and add a numbered migration step.
 */
import { ALL_CATEGORY_KEYS } from '../../learning/categories.js';
import { generateId } from '../../utils/id.js';

export const CURRENT_SCHEMA_VERSION = 6;
export const APP_VERSION = '0.1.0';

/** @returns {{level: number, masteryScore: number, streak: number, lastPlayedAt: string|null}} */
function defaultCategoryProgress() {
  return { level: 1, masteryScore: 0, streak: 0, lastPlayedAt: null };
}

/** @returns {Object<string, ReturnType<typeof defaultCategoryProgress>>} */
function defaultProgress() {
  const progress = {};
  for (const key of ALL_CATEGORY_KEYS) {
    progress[key] = defaultCategoryProgress();
  }
  return progress;
}

/**
 * Build a brand-new Profile record.
 * @param {string} name
 * @param {string} avatarId
 * @returns {object} Profile
 */
export function defaultProfile(name, avatarId) {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name,
    avatarId,
    appearance: {
      outfitId: null,
      accessorySlots: { hat: null, glasses: null, wings: null, scarf: null },
    },
    coins: 0,
    inventory: { outfits: [], accessories: [], furniture: [], mapThemes: [] },
    world: { placedFurniture: [], furniturePositions: {}, mapThemeId: null },
    progress: defaultProgress(),
    medals: {},
    stationsVisited: {},
    lastMapVisitDate: null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build default device-level settings.
 * @returns {{schemaVersion: number, muted: boolean}}
 */
export function defaultSettings() {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, muted: false };
}

/** @returns {{schemaVersion: number, appVersion: string}} */
export function defaultMeta() {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, appVersion: APP_VERSION };
}

/**
 * Numbered migration steps. Each function takes a record at version N and
 * returns it upgraded to version N+1.
 * @type {Array<(record: any) => any>}
 */
const migrations = [
  // migration 1 -> 2: the "My Character / My World" screen adds a scarf
  // accessory slot. Existing v1 profiles only have
  // { hat, glasses, wings } — add `scarf: null` without touching any other
  // field (outfitId and any already-set hat/glasses/wings values are left
  // exactly as they are).
  (record) => {
    if (record?.appearance?.accessorySlots && !('scarf' in record.appearance.accessorySlots)) {
      record.appearance.accessorySlots.scarf = null;
    }
    return record;
  },
  // migration 2 -> 3: the room preview switched from fixed furniture spots
  // to free drag-and-drop placement. Existing v2 profiles have no
  // `furniturePositions` map yet — add an empty one so already-placed
  // furniture just keeps using the stylesheet's default spot until the
  // child drags it somewhere new.
  (record) => {
    if (record?.world && !('furniturePositions' in record.world)) {
      record.world.furniturePositions = {};
    }
    return record;
  },
  // migration 3 -> 4: the map gained a once-per-day welcome-back bonus.
  // Existing v3 profiles have no `lastMapVisitDate` yet — add it as null,
  // which reads as "never claimed", so the very next map visit triggers
  // the bonus once (matches a brand-new profile's behavior, not a bug).
  (record) => {
    if (record && !('lastMapVisitDate' in record)) {
      record.lastMapVisitDate = null;
    }
    return record;
  },
  // migration 4 -> 5: multiplication-prep now awards MAP_THEME rewards
  // (unlockable alternate map backgrounds) instead of furniture. Existing
  // v4 profiles have no `inventory.mapThemes` or `world.mapThemeId` yet —
  // add an empty owned list and a null (unequipped) selection, which reads
  // as "map still behaves like before" (the normal random day/twilight A/B
  // pick) until the child earns and equips one.
  (record) => {
    if (record?.inventory && !('mapThemes' in record.inventory)) {
      record.inventory.mapThemes = [];
    }
    if (record?.world && !('mapThemeId' in record.world)) {
      record.world.mapThemeId = null;
    }
    return record;
  },
  // migration 5 -> 6: new "המדליות שלי" section — one silver/gold medal per
  // learning category, derived from the highest adaptive level ever
  // reached (see js/rewards/medals.js). Existing v5 profiles have no
  // `medals` map yet — add an empty one; nothing is retroactively awarded
  // for past play, medals start accruing from the next station completion.
  (record) => {
    if (record && !('medals' in record)) {
      record.medals = {};
    }
    return record;
  },
];

/**
 * Run any pending migrations on a record, mutating it up to
 * CURRENT_SCHEMA_VERSION. Safe to call on already-current records (no-op).
 * @param {any} record
 * @param {number} fromVersion
 * @returns {any} migrated record
 */
export function migrate(record, fromVersion) {
  let version = fromVersion ?? CURRENT_SCHEMA_VERSION;
  let result = record;
  while (version < CURRENT_SCHEMA_VERSION && migrations[version - 1]) {
    result = migrations[version - 1](result);
    version += 1;
  }
  if (result && typeof result === 'object') {
    result.schemaVersion = CURRENT_SCHEMA_VERSION;
  }
  return result;
}
