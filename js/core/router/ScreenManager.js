/**
 * @file ScreenManager.js
 * Hash-based router. Each screen module must export:
 *   mount(container: HTMLElement, params: Object<string,string>): void
 *   unmount(): void
 * The router only ever touches #screen-root — #overlay-root (mute toggle,
 * toasts, modals) is owned separately and persists across navigation.
 *
 * Route table entries: { pattern: '#/profiles', screen: ScreenModule }
 * Dynamic segments use ":name" syntax, e.g. '#/station/:id'.
 */
export class ScreenManager {
  /** @param {HTMLElement} container usually #screen-root */
  constructor(container) {
    this._container = container;
    /** @type {{pattern: string, segments: string[], screen: {mount: Function, unmount?: Function}}[]} */
    this._routes = [];
    this._currentScreen = null;
    this._defaultHash = '#/profiles';

    this._onHashChange = this._onHashChange.bind(this);
  }

  /**
   * @param {string} pattern e.g. '#/station/:id'
   * @param {{mount: Function, unmount?: Function}} screen
   */
  register(pattern, screen) {
    this._routes.push({ pattern, segments: pattern.split('/'), screen });
  }

  /** @param {string} hash fallback route used when no hash / no match is present */
  setDefaultHash(hash) {
    this._defaultHash = hash;
  }

  start() {
    window.addEventListener('hashchange', this._onHashChange);
    this._onHashChange();
  }

  /** @param {string} hash e.g. '#/map' */
  navigate(hash) {
    if (window.location.hash === hash) {
      this._onHashChange();
    } else {
      window.location.hash = hash;
    }
  }

  _onHashChange() {
    const rawHash = window.location.hash || this._defaultHash;
    const match = this._matchRoute(rawHash);

    if (!match) {
      window.location.hash = this._defaultHash;
      return;
    }

    if (this._currentScreen?.unmount) {
      try {
        this._currentScreen.unmount();
      } catch (err) {
        console.error('[Riki] Error unmounting screen', err);
      }
    }

    this._container.innerHTML = '';
    this._currentScreen = match.screen;
    match.screen.mount(this._container, match.params);
  }

  _matchRoute(hash) {
    const hashSegments = hash.split('/');
    for (const route of this._routes) {
      if (route.segments.length !== hashSegments.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.segments.length; i++) {
        const routeSeg = route.segments[i];
        const actualSeg = hashSegments[i];
        if (routeSeg.startsWith(':')) {
          params[routeSeg.slice(1)] = decodeURIComponent(actualSeg);
        } else if (routeSeg !== actualSeg) {
          ok = false;
          break;
        }
      }
      if (ok) return { screen: route.screen, params };
    }
    return null;
  }
}
