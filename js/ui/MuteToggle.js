/**
 * @file MuteToggle.js
 * Persistent floating mute/unmute button, mounted ONCE into #overlay-root
 * (outside ScreenManager's control) so it survives all navigation.
 */
import { createElement } from '../utils/dom.js';

/**
 * @param {HTMLElement} container e.g. #overlay-root
 * @param {import('../audio/SoundManager.js').SoundManager} soundManager
 * @param {import('../core/events/EventBus.js').EventBus} eventBus
 */
export function mountMuteToggle(container, soundManager, eventBus) {
  const button = createElement('button', {
    classes: 'mute-toggle',
    attrs: {
      type: 'button',
      'aria-pressed': String(soundManager.isMuted()),
      'aria-label': soundManager.isMuted() ? 'הפעל צליל' : 'השתק צליל',
    },
    text: soundManager.isMuted() ? '🔇' : '🔊',
  });

  button.addEventListener('click', async () => {
    const muted = await soundManager.toggleMute();
    updateVisual(muted);
  });

  function updateVisual(muted) {
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'הפעל צליל' : 'השתק צליל');
    button.textContent = muted ? '🔇' : '🔊';
  }

  eventBus.on('sound:muteChanged', ({ muted }) => updateVisual(muted));

  container.append(button);
  return button;
}
