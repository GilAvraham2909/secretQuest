/**
 * @file NarrationEngine.js
 * Web Speech API wrapper for Hebrew narration. Feature-detects
 * window.speechSynthesis and silently no-ops if unavailable so the game
 * never breaks on unsupported browsers.
 *
 * Exposed via a createNarrationEngine() factory — this is the swap seam
 * for a future AudioFileNarrationEngine (pre-recorded audio files) that
 * implements the same speak(text, opts)/cancel() contract.
 */
import { logger } from '../utils/logger.js';

class NarrationEngine {
  constructor() {
    this._supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this._voice = null;

    if (this._supported) {
      this._loadVoice();
      window.speechSynthesis.addEventListener?.('voiceschanged', () => this._loadVoice());
    } else {
      logger.warn('speechSynthesis not supported in this browser; narration will be silent.');
    }
  }

  _loadVoice() {
    try {
      const voices = window.speechSynthesis.getVoices();
      this._voice = voices.find((v) => v.lang?.toLowerCase().startsWith('he')) ?? null;
    } catch (err) {
      logger.warn('Failed to load speech voices.', err);
    }
  }

  /**
   * Speak Hebrew text aloud.
   * @param {string} text
   * @param {{rate?: number, pitch?: number}} [opts]
   */
  speak(text, opts = {}) {
    if (!this._supported || !text) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'he-IL';
      utterance.rate = opts.rate ?? 0.9;
      utterance.pitch = opts.pitch ?? 1.05;
      if (this._voice) utterance.voice = this._voice;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      logger.warn('Narration speak() failed.', err);
    }
  }

  cancel() {
    if (!this._supported) return;
    try {
      window.speechSynthesis.cancel();
    } catch (err) {
      logger.warn('Narration cancel() failed.', err);
    }
  }
}

/** @returns {NarrationEngine} */
export function createNarrationEngine() {
  return new NarrationEngine();
}
