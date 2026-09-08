/**
 * @file Companion.js
 * The magical companion: a small floating creature with a speech bubble.
 * Built as a standalone reusable component, but per game.md it is mounted
 * only on the world map screen in Stage 1.
 */
import { createElement } from '../utils/dom.js';

const ENCOURAGEMENTS_HE = [
  'איזה כיף שאתה כאן! בחר תחנה ובואו נלמד ביחד! ✨',
  'אתה יכול לבחור כל תחנה שבא לך, אין תחנות אסורות!',
  'אני כאן איתך תמיד. קדימה, לאן נטוס עכשיו?',
  'כל תחנה מביאה הפתעה חדשה! רוצה לנסות?',
  'איזה כיף ללמוד ביחד! אתה עושה עבודה נהדרת.',
];

const IDLE_INTERVAL_MS = 25000;

export class Companion {
  /** @param {import('../audio/SoundManager.js').SoundManager} soundManager */
  constructor(soundManager) {
    this._soundManager = soundManager;
    this._el = null;
    this._bubbleEl = null;
    this._idleTimer = null;
    this._bubbleHideTimer = null;
  }

  /**
   * @param {HTMLElement} container
   * @param {string} [initialMessage] overrides the default "hi, let's pick
   *   a station together" greeting — e.g. WorldMapScreen.js passes a daily
   *   welcome-bonus message on the first visit of the day. Avoids a timing
   *   race between two separate `say()` calls fighting over the same
   *   500ms-delayed slot.
   */
  mount(container, initialMessage) {
    this._el = createElement('div', { classes: 'companion', attrs: { 'aria-hidden': 'false' } });

    const figure = createElement('div', { classes: 'companion__figure' });
    const img = createElement('img', { attrs: { src: 'assets/images/companion/companion-idle.png', alt: '' } });
    img.addEventListener('error', () => {
      img.remove();
      figure.textContent = '✨';
    });
    figure.append(img);

    this._bubbleEl = createElement('div', {
      classes: 'companion__bubble',
      attrs: { role: 'status', 'aria-live': 'polite' },
    });

    this._el.append(this._bubbleEl, figure);
    container.append(this._el);

    figure.addEventListener('click', () => this._speakRandomEncouragement());

    window.setTimeout(() => this.say(initialMessage ?? 'היי! אני החבר הקסום שלך. בוא נבחר תחנה יחד! 🌟'), 500);
    this._resetIdleTimer();
  }

  /** @param {string} text */
  say(text) {
    if (!this._bubbleEl) return;
    this._bubbleEl.textContent = text;
    this._bubbleEl.classList.add('companion__bubble--visible');
    this._soundManager.speak(text);

    if (this._bubbleHideTimer) window.clearTimeout(this._bubbleHideTimer);
    this._bubbleHideTimer = window.setTimeout(() => {
      this._bubbleEl?.classList.remove('companion__bubble--visible');
    }, 5200);

    this._resetIdleTimer();
  }

  _speakRandomEncouragement() {
    const text = ENCOURAGEMENTS_HE[Math.floor(Math.random() * ENCOURAGEMENTS_HE.length)];
    this.say(text);
  }

  _resetIdleTimer() {
    if (this._idleTimer) window.clearTimeout(this._idleTimer);
    this._idleTimer = window.setTimeout(() => this._speakRandomEncouragement(), IDLE_INTERVAL_MS);
  }

  unmount() {
    if (this._idleTimer) window.clearTimeout(this._idleTimer);
    if (this._bubbleHideTimer) window.clearTimeout(this._bubbleHideTimer);
    this._el?.remove();
    this._el = null;
    this._bubbleEl = null;
  }
}
