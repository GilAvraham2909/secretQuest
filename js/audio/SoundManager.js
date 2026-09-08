/**
 * @file SoundManager.js
 * Facade over NarrationEngine + EffectsEngine. Every call site needing
 * sound must go through this module — never the engines directly — so
 * mute state gates both consistently and stays persisted in one place.
 */
import { createNarrationEngine } from './NarrationEngine.js';
import { createEffectsEngine } from './EffectsEngine.js';

export class SoundManager {
  /**
   * @param {boolean} initialMuted
   * @param {import('../core/data/SettingsRepository.js').SettingsRepository} settingsRepository
   * @param {import('../core/events/EventBus.js').EventBus} eventBus
   */
  constructor(initialMuted, settingsRepository, eventBus) {
    this._muted = Boolean(initialMuted);
    this._settingsRepo = settingsRepository;
    this._bus = eventBus;
    this._narration = createNarrationEngine();
    this._effects = createEffectsEngine();
  }

  /** @returns {boolean} */
  isMuted() {
    return this._muted;
  }

  /**
   * @param {string} text
   * @param {{rate?: number, pitch?: number}} [opts]
   */
  speak(text, opts) {
    if (this._muted) return;
    this._narration.speak(text, opts);
  }

  /** @param {'pop'|'click'|'success'} name */
  playEffect(name) {
    if (this._muted) return;
    this._effects.play(name);
  }

  async toggleMute() {
    this._muted = !this._muted;
    if (this._muted) {
      this._narration.cancel();
    }
    await this._settingsRepo.save({ muted: this._muted });
    this._bus.emit('sound:muteChanged', { muted: this._muted });
    return this._muted;
  }
}
