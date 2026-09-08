/**
 * @file ProfileManager.js
 * Session-level active-profile service, layered ABOVE ProfileRepository.
 * Screens and other UI code must call ONLY this module — never
 * ProfileRepository directly — so active-profile bookkeeping and event
 * emission stay centralized.
 */
import { StorageKeys } from '../core/storage/StorageKeys.js';
import { defaultProfile } from '../core/data/schema.js';
import { logger } from '../utils/logger.js';
import { medalTierForLevel, isMedalUpgrade } from '../rewards/medals.js';

export class ProfileManager {
  /**
   * @param {import('../core/data/ProfileRepository.js').ProfileRepository} profileRepository
   * @param {import('../core/storage/StorageProvider.js').StorageProvider} storageProvider
   * @param {import('../core/events/EventBus.js').EventBus} eventBus
   */
  constructor(profileRepository, storageProvider, eventBus) {
    this._repo = profileRepository;
    this._storage = storageProvider;
    this._bus = eventBus;
    /** @type {object|null} */
    this._activeProfile = null;
  }

  /** Load the active profile (if any) from storage. Call once at startup. */
  async init() {
    const activeId = await this._storage.getItem(StorageKeys.ACTIVE_PROFILE_ID);
    if (activeId) {
      const profile = await this._repo.getById(activeId);
      if (profile) {
        this._activeProfile = profile;
      } else {
        logger.warn('Stored activeProfileId did not resolve to a profile; clearing it.');
        await this._storage.removeItem(StorageKeys.ACTIVE_PROFILE_ID);
      }
    }
    return this._activeProfile;
  }

  /** @returns {object|null} */
  getActiveProfile() {
    return this._activeProfile;
  }

  /** @returns {Promise<object[]>} */
  async listProfiles() {
    return this._repo.getAll();
  }

  /**
   * @param {string} name
   * @param {string} avatarId
   * @returns {Promise<object>} the created Profile
   */
  async createProfile(name, avatarId) {
    const profile = defaultProfile(name.trim(), avatarId);
    await this._repo.create(profile);
    this._bus.emit('profile:created', profile);
    return profile;
  }

  /**
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async selectProfile(id) {
    const profile = await this._repo.getById(id);
    if (!profile) {
      logger.warn(`selectProfile: no profile found for id ${id}`);
      return null;
    }
    this._activeProfile = profile;
    await this._storage.setItem(StorageKeys.ACTIVE_PROFILE_ID, id);
    this._bus.emit('profile:selected', profile);
    return profile;
  }

  /** Clears the active profile without deleting it (used by "switch profile"). */
  async clearActiveProfile() {
    this._activeProfile = null;
    await this._storage.removeItem(StorageKeys.ACTIVE_PROFILE_ID);
  }

  /** @param {string} id @returns {Promise<void>} */
  async deleteProfile(id) {
    await this._repo.delete(id);
    if (this._activeProfile?.id === id) {
      this._activeProfile = null;
      await this._storage.removeItem(StorageKeys.ACTIVE_PROFILE_ID);
    }
    this._bus.emit('profile:deleted', { id });
  }

  /** @param {number} n coins to add (can be negative for spending, not used in Stage 1) */
  async addCoins(n) {
    if (!this._activeProfile) return;
    this._activeProfile.coins = Math.max(0, (this._activeProfile.coins ?? 0) + n);
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /**
   * A small, no-penalty "welcome back" touch: the first time the child
   * opens the map on a given calendar day, grants a small coin bonus and
   * remembers the date. Calling it again later the same day (or with no
   * active profile) is a quiet no-op — safe to call on every map mount.
   * Uses the device's LOCAL calendar date (not UTC) so the boundary lines
   * up with the child's actual day, not an offset one.
   * @returns {Promise<number>} the bonus granted (0 if already claimed today)
   */
  async claimDailyWelcomeIfDue() {
    if (!this._activeProfile) return 0;
    const d = new Date();
    const today = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (this._activeProfile.lastMapVisitDate === today) return 0;

    const bonus = 3;
    this._activeProfile.lastMapVisitDate = today;
    this._activeProfile.coins = Math.max(0, (this._activeProfile.coins ?? 0) + bonus);
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
    return bonus;
  }

  /**
   * @param {'outfit'|'accessory'|'furniture'} rewardFamily
   * @param {string} itemId
   */
  async addReward(rewardFamily, itemId) {
    if (!this._activeProfile) return;
    const bucket = { outfit: 'outfits', accessory: 'accessories', furniture: 'furniture', mapTheme: 'mapThemes' }[
      rewardFamily
    ];
    if (!bucket) {
      logger.warn(`addReward: unknown reward family "${rewardFamily}"`);
      return;
    }
    const list = this._activeProfile.inventory[bucket];
    if (!list.includes(itemId)) list.push(itemId);
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /**
   * Persists an updated CategoryProgress for one learning category on the
   * active profile. Mirrors the addCoins/addReward pattern above — this is
   * the only sanctioned way for a station screen to save adaptive-difficulty
   * state (level/masteryScore/streak/lastPlayedAt); never write it via
   * ProfileRepository directly.
   * @param {string} categoryKey e.g. CategoryKeys.LETTERS
   * @param {{level: number, masteryScore: number, streak: number, lastPlayedAt: string|null}} progress
   */
  async updateCategoryProgress(categoryKey, progress) {
    if (!this._activeProfile) return;
    this._activeProfile.progress[categoryKey] = progress;
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /**
   * Awards/upgrades the "המדליות שלי" medal for one category at
   * station-completion time, based on the adaptive level (1-3) reached
   * during that session — see js/rewards/medals.js for the silver/gold
   * thresholds. One-way only: never downgrades an already-earned medal,
   * even if the child's live level later drops back down from struggling
   * (this project's "zero frustration" rule — see medals.js's own comment).
   * A no-op call (level too low, or no upgrade available) does not write.
   * @param {string} categoryKey e.g. CategoryKeys.LETTERS
   * @param {number} level the category's adaptiveEngine level at session end
   */
  async recordMedalIfEarned(categoryKey, level) {
    if (!this._activeProfile) return;
    const candidate = medalTierForLevel(level);
    const current = this._activeProfile.medals[categoryKey];
    if (!isMedalUpgrade(current, candidate)) return;
    this._activeProfile.medals[categoryKey] = candidate;
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /** @param {string} stationId */
  async recordStationVisit(stationId) {
    if (!this._activeProfile) return;
    this._activeProfile.stationsVisited[stationId] = new Date().toISOString();
    await this._repo.update(this._activeProfile);
  }

  /** @param {string|null} outfitId toggles equip/unequip if the same id is tapped again */
  async setEquippedOutfit(outfitId) {
    if (!this._activeProfile) return;
    this._activeProfile.appearance.outfitId =
      this._activeProfile.appearance.outfitId === outfitId ? null : outfitId;
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /** @param {'hat'|'glasses'|'wings'|'scarf'} slot @param {string} itemId toggles equip/unequip if the same id is tapped again */
  async setEquippedAccessory(slot, itemId) {
    if (!this._activeProfile) return;
    const slots = this._activeProfile.appearance.accessorySlots;
    slots[slot] = slots[slot] === itemId ? null : itemId;
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /**
   * @param {string|null} themeId toggles equip/unequip if the same id is
   *   tapped again. Equipping null (or unequipping the current theme)
   *   returns the world map to its normal random day/twilight A/B pick.
   */
  async setEquippedMapTheme(themeId) {
    if (!this._activeProfile) return;
    this._activeProfile.world.mapThemeId =
      this._activeProfile.world.mapThemeId === themeId ? null : themeId;
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /** @param {string} itemId toggles an owned furniture item in/out of the placed set */
  async toggleFurniturePlacement(itemId) {
    if (!this._activeProfile) return;
    const placed = this._activeProfile.world.placedFurniture;
    const idx = placed.indexOf(itemId);
    if (idx === -1) placed.push(itemId); else placed.splice(idx, 1);
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }

  /**
   * Remembers where the child dragged a furniture piece in the room
   * preview. x/y are `inset-inline-start`/`inset-block-start` percentages
   * (0-100) — kept independent of `placedFurniture` so a dragged position
   * survives toggling the item off and back on.
   * @param {string} itemId @param {number} xPct @param {number} yPct
   */
  async setFurniturePosition(itemId, xPct, yPct) {
    if (!this._activeProfile) return;
    this._activeProfile.world.furniturePositions[itemId] = { x: xPct, y: yPct };
    await this._repo.update(this._activeProfile);
    this._bus.emit('profile:updated', this._activeProfile);
  }
}
