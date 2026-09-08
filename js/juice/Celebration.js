/**
 * @file Celebration.js
 * Shared "station complete" celebration panel used by every learning
 * station's renderCompletion(). Builds a choreographed CSS-staggered
 * entrance (confetti fires immediately, companion hops in, title pops,
 * coin count animates upward, reward flies in and lands, back button
 * settles in last) — all purely visual. The back button is ALWAYS
 * immediately clickable the instant this function returns; the staggered
 * reveal never gates interactivity (per this project's "zero frustration"
 * rule — this replaces the near-identical completion panel each station
 * screen used to build inline).
 */
import { createElement, createImageWithFallback } from '../utils/dom.js';
import { burst } from './Confetti.js';

/**
 * @param {HTMLElement} container - the station's cleared body element to render the panel into
 * @param {{
 *   coinsEarned: number,
 *   reward: {labelHe: string, fallbackEmoji: string} | null,
 *   onBack: () => void,
 *   soundManager: import('../audio/SoundManager.js').SoundManager | null,
 *   spokenMessage: string,
 *   confettiTarget?: HTMLElement,
 * }} opts
 */
export function renderCelebration(container, opts) {
  const { coinsEarned, reward, onBack, soundManager, spokenMessage, confettiTarget } = opts;

  const companionWrap = createElement('div', {
    classes: 'celebration-companion',
    attrs: { 'aria-hidden': 'true' },
  });
  companionWrap.append(
    createImageWithFallback({
      src: 'assets/images/companion/companion-happy.png',
      alt: '',
      emoji: '🎉',
      wrapperClass: 'celebration-companion-inner',
    })
  );

  const title = createElement('h2', { classes: 'celebration-title', text: 'סיימת את התחנה!' });

  const coinsNumberEl = createElement('span', { classes: 'celebration-coins-number', text: '0' });
  const coins = createElement('p', { classes: 'celebration-coins' }, ['אספת ', coinsNumberEl, ' מטבעות! 🪙']);

  let rewardEl;
  if (reward) {
    rewardEl = createElement('div', { classes: 'celebration-reward' }, [
      createElement('span', {
        classes: 'celebration-reward-emoji',
        attrs: { 'aria-hidden': 'true' },
        text: reward.fallbackEmoji,
      }),
      createElement('p', { classes: 'celebration-reward-label', text: `קיבלת פריט חדש: ${reward.labelHe}!` }),
    ]);
  } else {
    rewardEl = createElement('p', { classes: 'celebration-reward-note', text: 'עוד כוכבים בשבילך! ✨' });
  }

  const backBtn = createElement('button', {
    classes: 'btn btn-primary btn-large celebration-back-btn',
    attrs: { type: 'button' },
    text: 'חזרה למפה',
  });
  backBtn.addEventListener('click', () => onBack());

  const panel = createElement('div', { classes: 'celebration-panel' }, [
    companionWrap,
    title,
    coins,
    rewardEl,
    backBtn,
  ]);

  container.append(panel);

  burst(confettiTarget ?? container);
  spawnVictoryCast(panel);

  if (spokenMessage) {
    window.setTimeout(() => soundManager?.speak(spokenMessage), 300);
  }

  animateCoinCount(coinsNumberEl, coinsEarned);
}

/**
 * A small cast of characters jumping/dancing around the celebration panel
 * — the actual "the player won!" moment, distinct from the quieter confetti
 * burst. Reuses characters already established elsewhere in the game (the
 * map's wandering alien, the geometry station's fairy) rather than
 * introducing brand-new ones, so this reads as "the game's own cast shows
 * up to celebrate with you," not a random unrelated sticker pack.
 * Positioned around the panel's edges (not on top of the text/reward),
 * each on its own jump rhythm so they don't bounce in unison — same
 * "desynchronized idle" trick already used for the map's station nodes.
 * Self-removing after a few jumps; the panel and back button are already
 * fully interactive throughout regardless (per this file's "never gate
 * interactivity" rule).
 * @param {HTMLElement} panel the celebration panel itself — the cast is
 *   positioned relative to its edges (`position: relative` already set),
 *   not the whole station container.
 */
function spawnVictoryCast(panel) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const cast = [
    { emoji: '🧚', slot: 'tl' },
    { emoji: '👽', slot: 'tr' },
    { emoji: '⭐', slot: 'bl' },
    { emoji: '🎉', slot: 'br' },
  ];

  const layer = createElement('div', { classes: 'celebration-cast', attrs: { 'aria-hidden': 'true' } });
  for (const member of cast) {
    layer.append(
      createElement('span', {
        classes: ['celebration-cast-member', `celebration-cast-member--${member.slot}`],
        text: member.emoji,
      })
    );
  }
  panel.append(layer);

  window.setTimeout(() => layer.remove(), 2600);
}

function animateCoinCount(el, target) {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || target <= 0) {
    el.textContent = String(target);
    return;
  }
  const durationMs = 700;
  const start = performance.now();
  function tick(now) {
    if (!el.isConnected) return; // bail if the panel was unmounted mid-animation
    const progress = Math.min(1, (now - start) / durationMs);
    el.textContent = String(Math.round(progress * target));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
