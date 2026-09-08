/**
 * @file PlaceholderStationScreen.js
 * Registered for the '#/station/:id' route. Resolves the station by id,
 * checks js/world-map/stationRegistry.js for a real learning-activity
 * screen for that category (none exist in Stage 1), and falls back to a
 * friendly "coming soon" placeholder — so every map station is always
 * enterable, per the zero-frustration rule.
 */
import { getStationById } from '../../world-map/stations.js';
import { getRegisteredStationScreen } from '../../world-map/stationRegistry.js';
import { createElement } from '../../utils/dom.js';

/**
 * @param {import('../../profiles/ProfileManager.js').ProfileManager} profileManager
 * @param {import('../../audio/SoundManager.js').SoundManager} soundManager
 * @param {import('../../core/router/ScreenManager.js').ScreenManager} screenManager
 */
export function createStationScreen(profileManager, soundManager, screenManager) {
  /** @type {{mount: Function, unmount?: Function}|null} */
  let delegatedScreen = null;
  let rootEl = null;

  function mount(container, params) {
    const station = getStationById(params.id);

    if (!station) {
      renderNotFound(container);
      return;
    }

    profileManager.recordStationVisit(station.id);

    const realScreen = getRegisteredStationScreen(station.categoryKey);
    if (realScreen) {
      delegatedScreen = realScreen;
      // Real station screens are registered as plain, already-imported
      // modules in stationRegistry.js (no per-screen constructor injection
      // like the other routes get from main.js), so this delegation call is
      // their one seam for reaching the same shared profileManager/
      // soundManager/screenManager instances every other screen uses —
      // folded into the params object to keep mount(container, params)
      // matching the router contract's shape exactly.
      realScreen.mount(container, { ...params, profileManager, soundManager, screenManager });
      return;
    }

    renderPlaceholder(container, station);
  }

  function renderNotFound(container) {
    rootEl = createElement('div', { classes: 'station-placeholder' }, [
      createElement('div', { classes: 'station-placeholder__emoji', attrs: { 'aria-hidden': 'true' }, text: '🧭' }),
      createElement('h1', { classes: 'station-placeholder__title', text: 'לא מצאנו את התחנה הזו' }),
      createElement('p', { classes: 'station-placeholder__message', text: 'בואו נחזור למפה ונבחר תחנה אחרת.' }),
      backButton(),
    ]);
    container.append(rootEl);
  }

  function renderPlaceholder(container, station) {
    rootEl = createElement('div', { classes: 'station-placeholder' }, [
      createElement('div', { classes: 'station-placeholder__emoji', attrs: { 'aria-hidden': 'true' }, text: station.fallbackEmoji }),
      createElement('h1', { classes: 'station-placeholder__title', text: station.titleHe }),
      createElement('p', { classes: 'station-placeholder__message', text: 'נלמד כאן בקרוב! 🎉' }),
      backButton(),
    ]);
    container.append(rootEl);

    window.setTimeout(() => {
      soundManager.speak(`תחנת ${station.titleHe}. נלמד כאן בקרוב!`);
    }, 300);
  }

  function backButton() {
    const btn = createElement('button', {
      classes: 'btn btn-primary btn-large',
      attrs: { type: 'button' },
      text: 'בחזרה למפה',
    });
    btn.addEventListener('click', () => {
      soundManager.playEffect('click');
      screenManager.navigate('#/map');
    });
    return btn;
  }

  function unmount() {
    if (delegatedScreen?.unmount) {
      delegatedScreen.unmount();
    }
    delegatedScreen = null;
    rootEl?.remove();
    rootEl = null;
  }

  return { mount, unmount };
}
