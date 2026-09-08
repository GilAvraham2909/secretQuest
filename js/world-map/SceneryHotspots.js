/**
 * @file SceneryHotspots.js
 * Invisible tappable hotspots layered over a few landmarks already painted
 * into map-background.png (the big sun, the floating UFO-shaped island, a
 * sparkle star, the smaller sun/moon) — tapping one gives a little sparkle
 * burst + sound, purely for kids to discover while poking around the map.
 * Same spirit as Critters.js (no game state, no persistence) but for the
 * static scenery instead of moving creatures.
 *
 * Positions are percentages of the `.world-map` container, chosen from
 * where these features sit in the source art but favoring spots closer to
 * horizontal center — `background-size: cover` crops the image's left/right
 * edges on any viewport wider than the source art's 1:1 aspect ratio, so a
 * hotspot near the image's edge would drift off-screen on very wide
 * windows. None of this needs to be pixel-perfect: a hotspot with no
 * visible marker of its own just needs to land close enough to the art to
 * feel connected to it.
 */
import { createElement } from '../utils/dom.js';

const HOTSPOTS = [
  { id: 'sun', labelHe: 'השמש הגדולה', xPercent: 86, yPercent: 9 },
  { id: 'island', labelHe: 'האי המעופף', xPercent: 32, yPercent: 36 },
  { id: 'sparkle', labelHe: 'כוכב נוצץ', xPercent: 62, yPercent: 16 },
  { id: 'moon', labelHe: 'השמש הקטנה', xPercent: 16, yPercent: 20 },
];

/**
 * @param {import('../audio/SoundManager.js').SoundManager} soundManager
 * @returns {HTMLElement[]}
 */
export function buildSceneryHotspots(soundManager) {
  return HOTSPOTS.map((spot) => {
    const btn = createElement('button', {
      classes: 'world-map__hotspot',
      attrs: {
        type: 'button',
        'aria-label': spot.labelHe,
        style: `inset-inline-start: ${spot.xPercent}%; inset-block-start: ${spot.yPercent}%;`,
      },
    });

    btn.addEventListener('click', () => {
      soundManager.playEffect('success');
      const burst = createElement('span', {
        classes: 'world-map__hotspot-burst',
        attrs: { 'aria-hidden': 'true' },
        text: '✨',
      });
      btn.append(burst);
      burst.addEventListener(
        'animationend',
        () => burst.remove(),
        { once: true }
      );
      // Belt-and-suspenders cleanup — `animationend` proved unreliable for
      // short animations in this project's browser-automation testing
      // (see Critters.js's tap-bounce), so also force removal by timer.
      window.setTimeout(() => burst.remove(), 700);
    });

    return btn;
  });
}
