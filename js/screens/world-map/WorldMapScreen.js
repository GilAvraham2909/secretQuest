/**
 * @file WorldMapScreen.js
 * The free-choice world map: background, 7 station nodes, companion,
 * and a HUD corner showing the active profile's name/avatar/coins.
 */
import { createElement, createImageWithFallback } from '../../utils/dom.js';
import { stations } from '../../world-map/stations.js';
import { createStationNode } from '../../world-map/StationNode.js';
import { buildCritters } from '../../world-map/Critters.js';
import { buildSceneryHotspots } from '../../world-map/SceneryHotspots.js';
import { getAvatarImageSources } from '../../profiles/AvatarCatalog.js';
import { Companion } from '../../companion/Companion.js';
import { MAP_THEME_ITEMS } from '../../rewards/rewardCatalog.js';

/**
 * @param {import('../../profiles/ProfileManager.js').ProfileManager} profileManager
 * @param {import('../../audio/SoundManager.js').SoundManager} soundManager
 * @param {import('../../core/router/ScreenManager.js').ScreenManager} screenManager
 */
export function createWorldMapScreen(profileManager, soundManager, screenManager) {
  let container = null;
  let companion = null;

  async function mount(rootEl) {
    container = rootEl;
    const profile = profileManager.getActiveProfile();

    if (!profile) {
      screenManager.navigate('#/profiles');
      return;
    }

    // Grants (if due) BEFORE the HUD is built, so the coin count already
    // reflects the bonus on first paint rather than needing a second
    // refresh — see the companion greeting below for the visible half of
    // this. A quiet no-op after the first visit of the day.
    const dailyBonus = await profileManager.claimDailyWelcomeIfDue();

    const screen = createElement('div', { classes: 'world-map' });

    // A child who has earned + equipped a MAP_THEME prize (My World ->
    // "רקעי מפה") gets their own chosen background every visit, overriding
    // the default randomness below. Otherwise: roughly 50/50 between the
    // default daytime sky and a twilight/night variant — same "pick once
    // per mount, not re-randomized per action" pattern already used by
    // every station's scene background, giving the map a bit of
    // visit-to-visit freshness rather than always looking identical. Same
    // composition (mountains, winding path, floating island) across all
    // variants, so the trail/stations/critters/hotspots still read
    // sensibly regardless of which one loads.
    const equippedTheme = profile.world.mapThemeId
      ? MAP_THEME_ITEMS.find((t) => t.id === profile.world.mapThemeId)
      : null;

    let bgPath;
    if (equippedTheme) {
      bgPath = equippedTheme.imagePath;
      screen.style.backgroundImage = `url('${bgPath}')`;
    } else {
      const useAltScene = Math.random() < 0.5;
      bgPath = useAltScene ? 'assets/images/ui/map-background-alt.png' : 'assets/images/ui/map-background.png';
      if (useAltScene) screen.classList.add('world-map--scene-alt');
    }

    const bgProbe = new Image();
    bgProbe.onerror = () => screen.classList.add('world-map--fallback-bg');
    bgProbe.src = bgPath;

    screen.append(
      buildHud(profile),
      buildMyWorldButton(),
      buildSwitchButton(),
      buildTitle(),
      buildTrail(),
      ...buildSceneryHotspots(soundManager),
      ...buildCritters(soundManager),
      buildAvatarFigure(profile)
    );

    const stationsLayer = createElement('div', { classes: 'world-map__stations' });
    for (const station of stations) {
      stationsLayer.append(
        createStationNode(
          station,
          (s) => {
            soundManager.playEffect('pop');
            screenManager.navigate(`#/station/${s.id}`);
          },
          Boolean(profile.stationsVisited?.[station.id])
        )
      );
    }
    screen.append(stationsLayer);

    container.append(screen);

    companion = new Companion(soundManager);
    if (dailyBonus > 0) {
      soundManager.playEffect('success');
      companion.mount(container, `איזה כיף שחזרת! הנה מתנה קטנה בשבילך — ${dailyBonus} מטבעות 🪙✨`);
    } else {
      companion.mount(container);
    }
  }

  function buildHud(profile) {
    const hud = createElement('div', { classes: 'world-map__hud' });

    const avatarWrap = createElement('div', { classes: 'avatar avatar--sm' });
    avatarWrap.append(createImageWithFallback({ ...getAvatarImageSources(profile), alt: profile.name }));

    hud.append(
      avatarWrap,
      createElement('span', { classes: 'world-map__hud-name', text: profile.name }),
      createElement('span', { classes: 'world-map__hud-coins', text: `🪙 ${profile.coins ?? 0}` })
    );
    return hud;
  }

  /**
   * A larger "you are here" avatar figure standing on the map, distinct
   * from the tiny HUD-chip avatar. Fixed at a spot near the bottom-center
   * of the map that stays clear of all 7 stations' mapPosition coordinates
   * (closest is reading-comprehension at {60, 85} / mult-prep at {22, 82},
   * both well outside this figure's footprint) and clear of the trail (the
   * SVG trail's only segment down here is the straight line connecting
   * those same two stations, which stays above yPercent 85 — this figure
   * sits lower, at yPercent 93-ish). Doubles as a shortcut into "My World"
   * (same destination as buildMyWorldButton()) — tapping your own character
   * to dress it up is the more discoverable entry point for a 6-8-year-old
   * than a small corner button.
   */
  function buildAvatarFigure(profile) {
    const figure = createElement('button', {
      classes: 'world-map__avatar-figure',
      attrs: {
        type: 'button',
        'aria-label': 'הדמות שלי והעולם שלי',
        style: 'inset-inline-start: 47%; inset-block-end: 6%;',
      },
    });
    figure.addEventListener('click', () => {
      soundManager.playEffect('click');
      screenManager.navigate('#/my-world');
    });

    const avatarWrap = createElement('div', { classes: 'avatar avatar--lg world-map__avatar-figure-img' });
    avatarWrap.append(createImageWithFallback({ ...getAvatarImageSources(profile), alt: profile.name }));
    figure.append(avatarWrap);

    return figure;
  }

  function buildMyWorldButton() {
    const btn = createElement('button', {
      classes: 'btn btn-ghost world-map__my-world-btn',
      attrs: { type: 'button', 'aria-label': 'הדמות שלי והעולם שלי' },
      text: '🎒 העולם שלי',
    });
    btn.addEventListener('click', () => {
      soundManager.playEffect('click');
      screenManager.navigate('#/my-world');
    });
    return btn;
  }

  function buildSwitchButton() {
    const btn = createElement('button', {
      classes: 'btn btn-ghost world-map__switch-btn',
      attrs: { type: 'button', 'aria-label': 'החלף פרופיל' },
      text: '👤 החלף פרופיל',
    });
    btn.addEventListener('click', async () => {
      soundManager.playEffect('click');
      await profileManager.clearActiveProfile();
      screenManager.navigate('#/profiles');
    });
    return btn;
  }

  function buildTitle() {
    return createElement('h1', { classes: 'world-map__title', text: 'המסע לכוכב א׳' });
  }

  /**
   * Purely decorative "journey trail" connecting the station nodes, drawn
   * as an SVG path over the same mapPosition percentages the nodes use —
   * no new image asset, no change to routing/click behavior (pointer
   * events are disabled on it in CSS). Gives the map a sense of a path to
   * follow rather than scattered icons.
   */
  function buildTrail() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'world-map__trail');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');

    // The app is RTL-only: mapPosition.xPercent is measured from the
    // inline-start (physically right) edge, so convert to a physical
    // left-based x for plain SVG path coordinates.
    const points = stations.map((s) => ({
      x: 100 - s.mapPosition.xPercent,
      y: s.mapPosition.yPercent,
    }));

    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      d += ` Q ${points[i].x} ${points[i].y} ${midX} ${midY}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', 'world-map__trail-path');
    svg.append(path);
    return svg;
  }

  function unmount() {
    companion?.unmount();
    companion = null;
    container?.replaceChildren();
    container = null;
  }

  return { mount, unmount };
}
