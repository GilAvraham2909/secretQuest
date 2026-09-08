/**
 * @file GeometryStation.js
 * The geometry station ("צורות") — Stage 2's fifth real learning activity.
 * Registered in js/world-map/stationRegistry.js for CategoryKeys.GEOMETRY,
 * reached only via PlaceholderStationScreen's delegation seam (see that
 * file), which folds the shared profileManager/soundManager/screenManager
 * instances into the params object it passes to mount().
 *
 * Mechanic: match-the-named-shape among 2-4 tappable CSS-drawn shape tiles,
 * structurally identical to js/screens/station/letters/LettersStation.js —
 * only the prompt copy and tile content differ (a `<span class="shape
 * shape--*">` silhouette from js/learning/shapesData.js instead of a
 * Hebrew glyph). The round-loop/session-queue/adaptive-difficulty/
 * reward-reveal architecture mirrors LettersStation.js and
 * ArithmeticStation.js closely (see those files' header comments). There
 * are 8 shapes in the bank; each session uses a random 6-of-8 shuffled
 * subset (ROUNDS_PER_SESSION < bank size), so no "running out" handling is
 * needed and repeat visits see some variety. This station awards the
 * FURNITURE reward family (same pool ArithmeticStation draws from — see
 * rewardCatalog.js).
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { SHAPES } from '../../../learning/shapesData.js';
import { optionCountForLevel, applyCorrectAnswer, applyIncorrectAnswer } from '../../../learning/adaptiveEngine.js';
import { pickNextReward, FURNITURE_ITEMS } from '../../../rewards/rewardCatalog.js';
import { renderCelebration } from '../../../juice/Celebration.js';
import { playRoundTransition } from '../../../juice/RoundTransition.js';

/** Session length — how many rounds make up one visit to the station. There are 8 shapes in the bank; a 6-round session uses a random 6-of-8 subset each visit (see mount()'s shuffle+slice), which also adds replay variety across sessions. */
const ROUNDS_PER_SESSION = 6;

/** How long (ms) a correct tile stays visible in its "success" state before the next round appears. */
const ADVANCE_DELAY_MS = 600;

/** How many wrong taps on the same round before a gentle hint glow appears on the correct tile. */
const HINT_AFTER_WRONG_ATTEMPTS = 2;

/** Odds that any given round is a "golden round" — double coins plus a small badge flourish. */
const GOLDEN_ROUND_CHANCE = 1 / 6;

const AFFIRMATIONS = ['כל הכבוד, זיהית נכון!', 'מצוין, זאת הצורה הנכונה!', 'איזה זיהוי מעולה!', 'עין חדה לצורות!', 'זיהוי מושלם!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-geometry';

let sessionQueue = [];
let roundIndex = 0;
let currentProgress = null;
let wrongAttempts = 0;
let coinsEarnedThisSession = 0;
let roundLocked = false;
let isGoldenRound = false;
/** @type {Map<string, HTMLElement>} shape id -> tile button, for the current round */
let tileButtons = new Map();
/** @type {number[]} pending window.setTimeout ids, cleared on unmount */
let timers = [];
/** @type {HTMLImageElement|null} background-scene probe, only used to toggle the fallback-bg class */
let bgProbe = null;

function mount(container, params) {
  rootEl = container;
  profileManager = params?.profileManager ?? null;
  soundManager = params?.soundManager ?? null;
  screenManager = params?.screenManager ?? null;

  const station = getStationById(params?.id) ?? getStationById('station-geometry');
  stationId = station?.id ?? 'station-geometry';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.GEOMETRY];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(SHAPES).slice(0, ROUNDS_PER_SESSION);
  roundIndex = 0;
  wrongAttempts = 0;
  coinsEarnedThisSession = 0;
  roundLocked = false;
  timers = [];

  renderShell(station);
  renderRound();
}

function unmount() {
  clearAllTimers();
  if (rootEl) clearElement(rootEl);
  rootEl = null;
  profileManager = null;
  soundManager = null;
  screenManager = null;
  sessionQueue = [];
  tileButtons = new Map();
  currentProgress = null;
  bgProbe = null;
}

// ---- Rendering ----

function renderShell(station) {
  clearElement(rootEl);

  const screen = createElement('div', { classes: 'geometry-station' });

  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/geometry-scene-alt.png'
    : 'assets/images/stations/scenes/geometry-scene.png';
  if (useAltScene) screen.classList.add('geometry-station--scene-alt');

  // Illustrated scene background with graceful fallback: if the scene
  // image fails to load, fall back to the station's pre-existing gradient
  // background (see .geometry-station--fallback-bg in geometry-station.css).
  // Mirrors the identical pattern in WorldMapScreen.js/world-map.css.
  bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('geometry-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'geometry-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost geometry-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'geometry-station__title',
    text: station?.titleHe ?? 'תחנת הצורות',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'geometry-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'geometry-station__body' });

  screen.append(header, body, buildCompanion());
  rootEl.append(screen);
}

/**
 * Small decorative companion presence in a corner of the scene — purely
 * ornamental (aria-hidden, no click handler; this station already has its
 * own header back-button for navigation). Mirrors the same
 * image-with-emoji-fallback pattern used in js/companion/Companion.js.
 * Built once per mount() (called from renderShell(), not renderRound()), so
 * it never flickers/resets across rounds.
 */
function buildCompanion() {
  const wrap = createElement('div', {
    classes: 'geometry-station__companion',
    attrs: { 'aria-hidden': 'true' },
  });
  const img = createElement('img', {
    attrs: { src: 'assets/images/companion/companion-idle.png', alt: '' },
  });
  img.addEventListener('error', () => {
    img.remove();
    wrap.textContent = '✨';
  });
  wrap.append(img);
  return wrap;
}

function renderRound() {
  roundLocked = false;
  wrongAttempts = 0;
  isGoldenRound = Math.random() < GOLDEN_ROUND_CHANCE;

  const body = rootEl?.querySelector('.geometry-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  const target = sessionQueue[roundIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(target, optionCount);
  tileButtons = new Map();

  const promptChildren = [
    createElement('p', { classes: 'geometry-station__prompt-lead', text: 'איפה ה' + target.nameHe + '?' }),
  ];
  if (isGoldenRound) {
    promptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'geometry-station__prompt' }, promptChildren);

  const grid = createElement('div', {
    classes: 'geometry-station__grid',
    attrs: { role: 'group', 'aria-label': `בחרו את ה${target.nameHe}` },
  });
  for (const shape of options) {
    const tile = createTile(shape, target);
    tileButtons.set(shape.id, tile);
    grid.append(tile);
  }

  const scenePanel = createElement('div', { classes: 'geometry-station__scene-panel' }, [prompt, grid]);
  body.append(scenePanel);

  scheduleTimeout(() => {
    soundManager?.speak(`איפה ה${target.nameHe}?`);
  }, 300);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.geometry-station__body');
  const progressEl = rootEl?.querySelector('.geometry-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.GEOMETRY, currentProgress.level);
  const ownedFurniture = activeProfile?.inventory?.furniture ?? [];
  const reward = pickNextReward(FURNITURE_ITEMS, ownedFurniture);
  if (reward) profileManager?.addReward('furniture', reward.id);

  renderCelebration(body, {
    coinsEarned: coinsEarnedThisSession,
    reward,
    onBack: () => {
      soundManager?.playEffect('click');
      navigateToMap();
    },
    soundManager,
    spokenMessage: reward
      ? `סיימת את התחנה! קיבלת ${reward.labelHe}!`
      : 'סיימת את התחנה! עוד כוכבים בשבילך!',
    confettiTarget: rootEl,
  });
}

function updateProgressIndicator() {
  const el = rootEl?.querySelector('.geometry-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'geometry-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', { classes: 'geometry-station__dots', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state =
      i < roundIndex
        ? 'geometry-station__dot--done'
        : i === roundIndex
        ? 'geometry-station__dot--current'
        : '';
    dots.append(createElement('span', { classes: ['geometry-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

function createTile(shape, target) {
  const btn = createElement('button', {
    classes: 'shape-tile',
    attrs: { type: 'button', 'aria-label': shape.nameHe },
  });
  btn.append(createElement('span', { classes: ['shape', shape.cssClass], attrs: { 'aria-hidden': 'true' } }));
  btn.addEventListener('click', () => handleTileTap(shape, target, btn));
  return btn;
}

// ---- Interaction ----

function handleTileTap(shape, target, btn) {
  if (roundLocked || btn.disabled) return;

  if (shape.id === target.id) {
    handleCorrectTap(btn);
  } else {
    handleIncorrectTap(btn, target);
  }
}

function handleCorrectTap(btn) {
  roundLocked = true;

  soundManager?.playEffect('success');
  soundManager?.speak(pickRandom(AFFIRMATIONS));

  btn.classList.add('shape-tile--correct');
  for (const tile of tileButtons.values()) {
    tile.disabled = true;
  }

  currentProgress = applyCorrectAnswer(currentProgress);
  persistProgress();
  const coinsThisRound = isGoldenRound ? 2 : 1;
  profileManager?.addCoins(coinsThisRound);
  coinsEarnedThisSession += coinsThisRound;

  scheduleTimeout(() => {
    roundIndex += 1;
    if (roundIndex >= sessionQueue.length) {
      renderCompletion();
    } else {
      playRoundTransition(stationId, () => renderRound(), soundManager);
    }
  }, ADVANCE_DELAY_MS);
}

function handleIncorrectTap(btn, target) {
  soundManager?.playEffect('pop');
  soundManager?.speak(pickRandom(ENCOURAGEMENTS));

  currentProgress = applyIncorrectAnswer(currentProgress);
  persistProgress();
  wrongAttempts += 1;

  // Non-animation-dependent feedback too (prefers-reduced-motion neutralizes
  // the animation-duration globally, so the class also carries its own
  // background/border change that reads fine with zero motion). This
  // touches the TILE's own background/border, never the shape's fill
  // color, so the exercise never recolors the thing being identified.
  btn.classList.remove('shape-tile--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('shape-tile--incorrect');
  scheduleTimeout(() => btn.classList.remove('shape-tile--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const targetTile = tileButtons.get(target.id);
    targetTile?.classList.add('shape-tile--hint');
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.GEOMETRY, currentProgress);
}

function navigateToMap() {
  if (screenManager) {
    screenManager.navigate('#/map');
  } else {
    window.location.hash = '#/map';
  }
}

// ---- Helpers ----

/** @param {import('../../../learning/shapesData.js').ShapeEntry} target @param {number} optionCount */
function buildOptions(target, optionCount) {
  const distractors = shuffle(SHAPES.filter((s) => s.id !== target.id)).slice(0, optionCount - 1);
  return shuffle([target, ...distractors]);
}

/** Fisher-Yates shuffle, returns a new array (never mutates the input). */
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function scheduleTimeout(fn, delay) {
  const id = window.setTimeout(() => {
    timers = timers.filter((t) => t !== id);
    fn();
  }, delay);
  timers.push(id);
  return id;
}

function clearAllTimers() {
  for (const id of timers) window.clearTimeout(id);
  timers = [];
}

export const GeometryStation = { mount, unmount };
