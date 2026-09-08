/**
 * @file LettersStation.js
 * The letters station ("אותיות") — Stage 2's first real learning activity.
 * Registered in js/world-map/stationRegistry.js for CategoryKeys.LETTERS,
 * reached only via PlaceholderStationScreen's delegation seam (see that
 * file), which folds the shared profileManager/soundManager/screenManager
 * instances into the params object it passes to mount().
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { LETTERS } from '../../../learning/lettersData.js';
import { optionCountForLevel, applyCorrectAnswer, applyIncorrectAnswer } from '../../../learning/adaptiveEngine.js';
import { pickNextReward, OUTFIT_ITEMS } from '../../../rewards/rewardCatalog.js';
import { renderCelebration } from '../../../juice/Celebration.js';
import { playRoundTransition } from '../../../juice/RoundTransition.js';

/** Session length — how many rounds make up one visit to the station. */
const ROUNDS_PER_SESSION = 6;

/** How long (ms) a correct tile stays visible in its "success" state before the next round appears. */
const ADVANCE_DELAY_MS = 600;

/** How many wrong taps on the same round before a gentle hint glow appears on the correct tile. */
const HINT_AFTER_WRONG_ATTEMPTS = 2;

/** Odds that any given round is a "golden round" — double coins plus a small badge flourish. */
const GOLDEN_ROUND_CHANCE = 1 / 6;

const AFFIRMATIONS = ['כל הכבוד!', 'מצוין!', 'נהדר!', 'וואו, איזה כיף!', 'פגעת בול!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-letters';

let sessionQueue = [];
let roundIndex = 0;
let currentProgress = null;
let wrongAttempts = 0;
let coinsEarnedThisSession = 0;
let roundLocked = false;
let isGoldenRound = false;
/** @type {Map<string, HTMLElement>} letter id -> tile button, for the current round */
let tileButtons = new Map();
/** @type {number[]} pending window.setTimeout ids, cleared on unmount */
let timers = [];

function mount(container, params) {
  rootEl = container;
  profileManager = params?.profileManager ?? null;
  soundManager = params?.soundManager ?? null;
  screenManager = params?.screenManager ?? null;

  const station = getStationById(params?.id) ?? getStationById('station-letters');
  stationId = station?.id ?? 'station-letters';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.LETTERS];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(LETTERS).slice(0, ROUNDS_PER_SESSION);
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
}

// ---- Rendering ----

function renderShell(station) {
  clearElement(rootEl);

  const screen = createElement('div', { classes: 'letters-station' });
  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/letters-scene-alt.png'
    : 'assets/images/stations/scenes/letters-scene.png';
  if (useAltScene) screen.classList.add('letters-station--scene-alt');
  const bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('letters-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'letters-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost letters-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'letters-station__title',
    text: station?.titleHe ?? 'תחנת האותיות',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'letters-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'letters-station__body' });

  screen.append(header, body, buildCompanion());
  rootEl.append(screen);
}

/**
 * Small decorative companion presence in the corner of the scene — purely
 * ornamental (no navigation of its own; the header back-button already
 * covers that), mounted once here in the persistent shell so it doesn't
 * flicker/reset on every round. Mirrors the same img-with-emoji-fallback
 * pattern used by js/companion/Companion.js.
 */
function buildCompanion() {
  const wrap = createElement('div', {
    classes: 'letters-station__companion',
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

  const body = rootEl?.querySelector('.letters-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  const target = sessionQueue[roundIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(target, optionCount);
  tileButtons = new Map();

  const promptChildren = [
    createElement('p', { classes: 'letters-station__prompt-lead', text: 'איפה האות' }),
    createElement('p', { classes: 'letters-station__prompt-target', text: target.nameHe }),
  ];
  if (isGoldenRound) {
    promptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'letters-station__prompt' }, promptChildren);

  const grid = createElement('div', {
    classes: 'letters-station__grid',
    attrs: { role: 'group', 'aria-label': `בחרו את האות ${target.nameHe}` },
  });
  for (const letter of options) {
    const tile = createTile(letter, target);
    tileButtons.set(letter.id, tile);
    grid.append(tile);
  }

  const scenePanel = createElement('div', { classes: 'letters-station__scene-panel' });
  scenePanel.append(prompt, grid);
  body.append(scenePanel);

  scheduleTimeout(() => {
    soundManager?.speak(`איפה האות ${target.nameHe}?`);
  }, 300);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.letters-station__body');
  const progressEl = rootEl?.querySelector('.letters-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.LETTERS, currentProgress.level);
  const ownedOutfits = activeProfile?.inventory?.outfits ?? [];
  const reward = pickNextReward(OUTFIT_ITEMS, ownedOutfits);
  if (reward) profileManager?.addReward('outfit', reward.id);

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
  const el = rootEl?.querySelector('.letters-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'letters-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', { classes: 'letters-station__dots', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state = i < roundIndex ? 'letters-station__dot--done' : i === roundIndex ? 'letters-station__dot--current' : '';
    dots.append(createElement('span', { classes: ['letters-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

function createTile(letter, target) {
  const btn = createElement('button', {
    classes: 'letter-tile',
    attrs: { type: 'button', 'aria-label': `האות ${letter.nameHe}` },
    text: letter.char,
  });
  btn.addEventListener('click', () => handleTileTap(letter, target, btn));
  return btn;
}

// ---- Interaction ----

function handleTileTap(letter, target, btn) {
  if (roundLocked || btn.disabled) return;

  if (letter.id === target.id) {
    handleCorrectTap(btn);
  } else {
    handleIncorrectTap(btn, target);
  }
}

function handleCorrectTap(btn) {
  roundLocked = true;

  soundManager?.playEffect('success');
  soundManager?.speak(pickRandom(AFFIRMATIONS));

  btn.classList.add('letter-tile--correct');
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
  // background/border change that reads fine with zero motion).
  btn.classList.remove('letter-tile--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('letter-tile--incorrect');
  scheduleTimeout(() => btn.classList.remove('letter-tile--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const targetTile = tileButtons.get(target.id);
    targetTile?.classList.add('letter-tile--hint');
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.LETTERS, currentProgress);
}

function navigateToMap() {
  if (screenManager) {
    screenManager.navigate('#/map');
  } else {
    window.location.hash = '#/map';
  }
}

// ---- Helpers ----

/** @param {import('../../../learning/lettersData.js').LetterEntry} target @param {number} optionCount */
function buildOptions(target, optionCount) {
  const distractors = shuffle(LETTERS.filter((l) => l.id !== target.id)).slice(0, optionCount - 1);
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

export const LettersStation = { mount, unmount };
