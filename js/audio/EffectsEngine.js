/**
 * @file EffectsEngine.js
 * Web Audio API wrapper for short UI sound effects, synthesized with
 * OscillatorNode tones (no audio files needed). The shared AudioContext is
 * created lazily on the first play() call, since browsers require it to be
 * created/resumed after a user gesture under autoplay policy.
 *
 * Exposed via a createEffectsEngine() factory — swap seam for a future
 * sample-file-based effects engine.
 */
import { logger } from '../utils/logger.js';

const EFFECT_PRESETS = {
  pop: [{ freq: 520, duration: 0.09, type: 'sine' }],
  click: [{ freq: 340, duration: 0.05, type: 'square' }],
  success: [
    { freq: 523.25, duration: 0.11, type: 'sine' },
    { freq: 659.25, duration: 0.11, type: 'sine', delay: 0.1 },
    { freq: 783.99, duration: 0.16, type: 'sine', delay: 0.2 },
  ],
};

class EffectsEngine {
  constructor() {
    this._ctx = null;
    this._supported = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  }

  _ensureContext() {
    if (!this._supported) return null;
    if (!this._ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      this._ctx = new Ctor();
    }
    if (this._ctx.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    return this._ctx;
  }

  /** @param {'pop'|'click'|'success'} name */
  play(name) {
    if (!this._supported) return;
    const preset = EFFECT_PRESETS[name];
    if (!preset) {
      logger.warn(`Unknown sound effect "${name}"`);
      return;
    }
    const ctx = this._ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      for (const tone of preset) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = tone.type;
        osc.frequency.value = tone.freq;
        const start = now + (tone.delay ?? 0);
        const end = start + tone.duration;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(end + 0.02);
      }
    } catch (err) {
      logger.warn(`EffectsEngine.play("${name}") failed.`, err);
    }
  }
}

/** @returns {EffectsEngine} */
export function createEffectsEngine() {
  return new EffectsEngine();
}
