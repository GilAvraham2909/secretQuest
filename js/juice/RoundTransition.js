/**
 * @file RoundTransition.js
 * Station-themed round-to-round transitions, built on the browser's native
 * View Transitions API (`document.startViewTransition`) — see
 * docs/transition-registry.md for the full per-station motif rationale;
 * check that file before adding a new motif.
 *
 * Each of the 7 stations gets a genuinely different MECHANISM, not a
 * reskinned copy of one shared animation:
 *   - letters: an owl carries the old content off (drag/rotate/shrink)
 *   - phonology: a fish leaps, a circular ripple reveals the new content
 *     from that point (clip-path circle, off-center origin)
 *   - syllables-words: a fog bank slides across and clears
 *   - arithmetic: a diagonal "candy wrapper" peel wipe
 *   - geometry: a center-origin sparkle-burst reveal (clip-path circle,
 *     center origin — same technique family as phonology's ripple, but
 *     origin/rhythm/color make it read as a different event, per the
 *     registry's "still differentiate the specific motion" guidance)
 *   - multiplication-prep: a multi-particle falling-petal shower over a
 *     plain quick cross-fade
 *   - reading-comprehension: a literal 3D page-flip — deliberately NOT
 *     routed through startViewTransition (see playPageFlip below and the
 *     registry entry for why)
 *
 * `view-transition-name` is set programmatically (not baked into each
 * station's CSS) on the station's own stable `__body` element — that
 * element persists across a round's `clearElement()`+rebuild, so tagging
 * it here is enough for the browser to correctly snapshot its old and new
 * appearance around the DOM mutation.
 */
import { createElement } from '../utils/dom.js';

/** Routine navigation stays snappy — per the game-screen-transitions skill's 250-400ms guidance. */
const TRANSITION_DURATION_MS = 380;

/** @type {Object<string, {bodyClass: string, theme: string, emoji: string|null}>} */
const STATION_MOTIFS = {
  'station-letters': { bodyClass: 'letters-station__body', theme: 'letters', emoji: '🦉' },
  'station-phonology': { bodyClass: 'phonology-station__body', theme: 'phonology', emoji: '🐟' },
  'station-syllables-words': { bodyClass: 'word-building-station__body', theme: 'syllables-words', emoji: '🦇' },
  'station-arithmetic': { bodyClass: 'arithmetic-station__body', theme: 'arithmetic', emoji: '🍬' },
  'station-geometry': { bodyClass: 'geometry-station__body', theme: 'geometry', emoji: '🧚' },
  'station-multiplication-prep': {
    bodyClass: 'multiplication-prep-station__body',
    theme: 'multiplication-prep',
    emoji: null,
  },
};

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {string} stationId one of stations.js's station ids
 * @param {() => void} swapFn mutates the station's round content (i.e. `renderRound`)
 * @param {import('../audio/SoundManager.js').SoundManager} [soundManager] plays a light
 *   local "pop" cue (SoundManager.playEffect — synthesized client-side, not the Google
 *   Cloud TTS API) timed to the transition start.
 */
export function playRoundTransition(stationId, swapFn, soundManager) {
  soundManager?.playEffect('pop');

  if (stationId === 'station-reading-comprehension') {
    playPageFlip('reading-comprehension-station__body', swapFn);
    return;
  }

  const motif = STATION_MOTIFS[stationId];
  if (!motif || !document.startViewTransition || prefersReducedMotion()) {
    swapFn();
    return;
  }

  const container = document.querySelector(`.${motif.bodyClass}`);
  const decor = spawnDecor(motif, container);

  container.style.viewTransitionName = 'round-content';
  document.documentElement.dataset.transitionTheme = motif.theme;

  const vt = document.startViewTransition(swapFn);
  vt.finished
    .finally(() => {
      container.style.viewTransitionName = '';
      delete document.documentElement.dataset.transitionTheme;
      decor?.remove();
    })
    .catch(() => {
      // A transition superseded by a newer one (e.g. a fast double-tap)
      // rejects `finished` with InvalidStateError — expected, not a bug;
      // the new transition already took over, nothing left to handle.
    });
}

/**
 * The decorative sprite/particle layer — NOT part of the View Transition
 * snapshot (per the skill's "confetti stays outside the view transition"
 * guidance). Appended to `document.body`, `position: fixed`, so it's safe
 * regardless of what the station's own DOM does during the swap.
 */
function spawnDecor(motif, container) {
  const rect = container?.getBoundingClientRect();
  if (motif.theme === 'multiplication-prep') {
    return spawnPetalShower(rect);
  }
  if (!motif.emoji) return null;

  const sprite = createElement('span', {
    classes: ['round-transition-sprite', `round-transition-sprite--${motif.theme}`],
    attrs: { 'aria-hidden': 'true' },
    text: motif.emoji,
  });
  if (rect) {
    sprite.style.setProperty('--rt-origin-x', `${rect.left + rect.width / 2}px`);
    sprite.style.setProperty('--rt-origin-y', `${rect.top + rect.height / 2}px`);
  }
  document.body.append(sprite);
  window.setTimeout(() => sprite.remove(), TRANSITION_DURATION_MS + 150);
  return sprite;
}

const PETAL_EMOJI = ['🌸', '🍃', '🌼'];

function spawnPetalShower(rect) {
  const layer = createElement('div', { classes: 'round-transition-petals', attrs: { 'aria-hidden': 'true' } });
  if (rect) {
    layer.style.cssText = `position:fixed; inset-inline-start:${rect.left}px; inset-block-start:${rect.top}px; width:${rect.width}px; height:${rect.height}px;`;
  }
  const count = 7;
  for (let i = 0; i < count; i++) {
    const petal = createElement('span', {
      classes: 'round-transition-petal',
      attrs: { 'aria-hidden': 'true' },
      text: PETAL_EMOJI[i % PETAL_EMOJI.length],
    });
    petal.style.setProperty('--rt-petal-x', `${Math.round((i / (count - 1)) * 90 + 5)}%`);
    petal.style.setProperty('--rt-petal-delay', `${Math.round(Math.random() * 120)}ms`);
    layer.append(petal);
  }
  document.body.append(layer);
  window.setTimeout(() => layer.remove(), TRANSITION_DURATION_MS + 250);
  return layer;
}

/**
 * The reading-comprehension station's literal page-flip — deliberately its
 * own technique rather than a View Transition clip-path/particle motif
 * (see docs/transition-registry.md). Clones the CURRENT content as a
 * "back-face" overlay positioned exactly over the real container, swaps
 * the real container's content immediately underneath (hidden behind the
 * clone), then rotates the clone away in 3D — as it crosses 90° its
 * `backface-visibility: hidden` makes it vanish, revealing the already-
 * updated real content beneath.
 * @param {string} bodyClass
 * @param {() => void} swapFn
 */
function playPageFlip(bodyClass, swapFn) {
  const container = document.querySelector(`.${bodyClass}`);
  if (!container || prefersReducedMotion()) {
    swapFn();
    return;
  }

  const rect = container.getBoundingClientRect();
  const cs = getComputedStyle(container);

  const oldFace = createElement('div', { classes: 'page-flip__face', attrs: { 'aria-hidden': 'true' } });
  oldFace.innerHTML = container.innerHTML;
  oldFace.style.background = cs.backgroundColor;

  const wrap = createElement('div', { classes: 'page-flip__wrap' });
  wrap.style.cssText = `position:fixed; inset-inline-start:${rect.left}px; inset-block-start:${rect.top}px; width:${rect.width}px; height:${rect.height}px;`;
  wrap.append(oldFace);
  document.body.append(wrap);

  swapFn();

  requestAnimationFrame(() => {
    wrap.classList.add('page-flip__wrap--flipping');
  });

  window.setTimeout(() => wrap.remove(), 480);
}
