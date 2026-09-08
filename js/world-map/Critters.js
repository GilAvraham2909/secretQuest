/**
 * @file Critters.js
 * Purely decorative, tappable sky critters for the world map — drift on
 * slow ambient loops and give a fun little bounce + sound when tapped. No
 * game state, no progress, no persistence: this exists only to give kids
 * something extra to discover and poke at while they explore the map,
 * beyond navigating to stations.
 *
 * The map background is a space/planet scene (this game is "המסע לכוכב
 * א׳" — Journey to Planet A), not an earthly landscape — bird and
 * butterfly are whimsical rather than literal, but the other two lean into
 * the actual theme: a small wandering alien, and an occasional shooting
 * star that streaks across and is gone, rather than a fourth lazy-loop
 * critter (variety: not everything on the map behaves the same way).
 */
import { createElement } from '../utils/dom.js';

const CRITTERS = [
  { id: 'bird', emoji: '🐦', labelHe: 'ציפור משוטטת', modifier: 'world-map__critter--bird' },
  { id: 'butterfly', emoji: '🦋', labelHe: 'פרפר משוטט', modifier: 'world-map__critter--butterfly' },
  { id: 'alien', emoji: '👽', labelHe: 'חייזר קטן משוטט', modifier: 'world-map__critter--alien' },
  { id: 'comet', emoji: '🌠', labelHe: 'כוכב נופל', modifier: 'world-map__critter--comet' },
];

/**
 * @param {import('../audio/SoundManager.js').SoundManager} soundManager
 * @returns {HTMLElement[]}
 */
export function buildCritters(soundManager) {
  return CRITTERS.map((critter) => {
    const btn = createElement('button', {
      classes: ['world-map__critter', critter.modifier],
      attrs: { type: 'button', 'aria-label': critter.labelHe },
    });

    const inner = createElement('span', {
      classes: 'world-map__critter-inner',
      attrs: { 'aria-hidden': 'true' },
      text: critter.emoji,
    });
    btn.append(inner);

    // A timer (not an `animationend` listener) clears the tap animation —
    // `animationend` proved unreliable for this short a duration in testing,
    // so a plain timeout matched to critter-bounce's CSS duration (550ms) is
    // used instead. Re-tapping mid-bounce just restarts the timer.
    let tapTimer = null;
    btn.addEventListener('click', () => {
      soundManager.playEffect('pop');
      inner.classList.remove('world-map__critter-inner--tapped');
      // Force a reflow so re-adding the class restarts the animation even
      // if it's already mid-bounce from a rapid re-tap.
      void inner.offsetWidth;
      inner.classList.add('world-map__critter-inner--tapped');
      window.clearTimeout(tapTimer);
      tapTimer = window.setTimeout(() => {
        inner.classList.remove('world-map__critter-inner--tapped');
      }, 550);

      // Same sparkle-burst touch as tapping a scenery hotspot (see
      // SceneryHotspots.js) — reuses its "hotspot-sparkle" keyframe so
      // tapping anything fun on the map (a landmark or a critter) feels
      // consistent. Appended to `btn` (the position-driving outer element,
      // not `inner`, which already has its own bounce animation running).
      const burst = createElement('span', {
        classes: 'world-map__critter-burst',
        attrs: { 'aria-hidden': 'true' },
        text: '✨',
      });
      btn.append(burst);
      window.setTimeout(() => burst.remove(), 700);
    });

    return btn;
  });
}
