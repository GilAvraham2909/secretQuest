/**
 * @file ArithmeticStation.js
 * The arithmetic station ("חשבון") — Stage 2's fourth real learning
 * activity. Registered in js/world-map/stationRegistry.js for
 * CategoryKeys.ARITHMETIC, reached only via PlaceholderStationScreen's
 * delegation seam (see that file), which folds the shared
 * profileManager/soundManager/screenManager instances into the params
 * object it passes to mount().
 *
 * Mechanic: a simple counting/arithmetic exercise. Each round shows an
 * addition or subtraction fact from the curated bank in
 * js/learning/arithmeticData.js, visualized as two rows of star icons
 * (⭐) for concreteness alongside the plain numeric equation text, then a
 * grid of tappable numeric answer tiles. The round-loop/session-queue/
 * adaptive-difficulty/reward-reveal architecture mirrors
 * js/screens/station/letters/LettersStation.js and
 * js/screens/station/syllables-words/WordBuildingStation.js closely (see
 * those files' header comments); only the prompt/tile content differ here.
 * This station awards the FURNITURE reward family (see rewardCatalog.js).
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { ARITHMETIC_PROBLEMS } from '../../../learning/arithmeticData.js';
import { optionCountForLevel, applyCorrectAnswer, applyIncorrectAnswer } from '../../../learning/adaptiveEngine.js';
import { pickNextReward, FURNITURE_ITEMS } from '../../../rewards/rewardCatalog.js';
import { renderCelebration } from '../../../juice/Celebration.js';
import { playRoundTransition } from '../../../juice/RoundTransition.js';

/** Session length — how many rounds make up one visit to the station. */
const ROUNDS_PER_SESSION = 6;

/** How long (ms) a correct tile stays visible in its "success" state before the next round appears. */
const ADVANCE_DELAY_MS = 600;

/** How many wrong taps on the same round before a gentle hint glow appears on the correct tile. */
const HINT_AFTER_WRONG_ATTEMPTS = 2;

/** Numeric range (inclusive) that distractor answer options are drawn from. */
const DISTRACTOR_MIN = 0;
const DISTRACTOR_MAX = 10;

/** Odds that any given round is a "golden round" — double coins plus a small badge flourish. */
const GOLDEN_ROUND_CHANCE = 1 / 6;

const AFFIRMATIONS = ['כל הכבוד, חישבת נכון!', 'מצוין, זה בדיוק המספר!', 'איזה חשבון מעולה!', 'איזה חשבון חכם!', 'ניצחת את המספר!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

/** Visual operator glyphs — a proper minus sign (−), not a hyphen. */
const OPERATOR_GLYPH = { '+': '+', '-': '−' };
const STAR_GLYPH = '⭐';

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-arithmetic';

let sessionQueue = [];
let roundIndex = 0;
let currentProgress = null;
let wrongAttempts = 0;
let coinsEarnedThisSession = 0;
let roundLocked = false;
let isGoldenRound = false;
/** @type {Map<number, HTMLElement>} numeric answer value -> tile button, for the current round */
let tileButtons = new Map();
/** @type {number[]} pending window.setTimeout ids, cleared on unmount */
let timers = [];

function mount(container, params) {
  rootEl = container;
  profileManager = params?.profileManager ?? null;
  soundManager = params?.soundManager ?? null;
  screenManager = params?.screenManager ?? null;

  const station = getStationById(params?.id) ?? getStationById('station-arithmetic');
  stationId = station?.id ?? 'station-arithmetic';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.ARITHMETIC];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(ARITHMETIC_PROBLEMS).slice(0, ROUNDS_PER_SESSION);
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

  const screen = createElement('div', { classes: 'arithmetic-station' });

  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/arithmetic-scene-alt.png'
    : 'assets/images/stations/scenes/arithmetic-scene.png';
  if (useAltScene) screen.classList.add('arithmetic-station--scene-alt');

  // Graceful fallback for the illustrated scene background: if the image
  // fails to load, fall back to the station's original plain gradient
  // (mirrors the identical bgProbe pattern in
  // js/screens/world-map/WorldMapScreen.js / .world-map--fallback-bg).
  const bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('arithmetic-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'arithmetic-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost arithmetic-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'arithmetic-station__title',
    text: station?.titleHe ?? 'תחנת החשבון',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'arithmetic-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'arithmetic-station__body' });

  // Decorative companion presence in the scene — mounted once here (not
  // re-created per round) so it doesn't flicker/reset each round. Purely
  // ornamental: aria-hidden, no click handler (this station already has its
  // own header back-button for navigation). Same onerror-swap-to-emoji
  // fallback pattern as js/companion/Companion.js.
  const companion = createElement('div', {
    classes: 'arithmetic-station__companion',
    attrs: { 'aria-hidden': 'true' },
  });
  const companionImg = createElement('img', {
    attrs: { src: 'assets/images/companion/companion-idle.png', alt: '' },
  });
  companionImg.addEventListener('error', () => {
    companionImg.remove();
    companion.textContent = '✨';
  });
  companion.append(companionImg);

  screen.append(header, body, companion);
  rootEl.append(screen);
}

function renderRound() {
  roundLocked = false;
  wrongAttempts = 0;
  isGoldenRound = Math.random() < GOLDEN_ROUND_CHANCE;

  const body = rootEl?.querySelector('.arithmetic-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  const target = sessionQueue[roundIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(target, optionCount);
  tileButtons = new Map();

  const promptChildren = [createElement('p', { classes: 'arithmetic-station__prompt-lead', text: 'כמה זה?' })];
  if (isGoldenRound) {
    promptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'arithmetic-station__prompt' }, promptChildren);

  const equation = createElement('div', {
    classes: 'arithmetic-station__equation',
    attrs: { role: 'img', 'aria-label': buildEquationAriaLabel(target) },
  });
  equation.append(
    buildStarGroup(target.a),
    createElement('span', { classes: 'arithmetic-station__operator', text: OPERATOR_GLYPH[target.op] }),
    buildStarGroup(target.b),
    createElement('span', { classes: 'arithmetic-station__operator', text: '=' }),
    createElement('span', { classes: 'arithmetic-station__question-mark', text: '?' })
  );

  const equationText = createElement('p', {
    classes: 'arithmetic-station__equation-text',
    text: `${target.a} ${OPERATOR_GLYPH[target.op]} ${target.b} = ?`,
  });

  const grid = createElement('div', {
    classes: 'arithmetic-station__grid',
    attrs: { role: 'group', 'aria-label': 'בחרו את התשובה הנכונה' },
  });
  for (const value of options) {
    const tile = createTile(value, target);
    tileButtons.set(value, tile);
    grid.append(tile);
  }

  // Backing panel behind the round's content so text/tiles stay legible
  // over the illustrated scene background (see .arithmetic-station__scene-panel).
  const scenePanel = createElement('div', { classes: 'arithmetic-station__scene-panel' });
  scenePanel.append(prompt, equation, equationText, grid);
  body.append(scenePanel);

  scheduleTimeout(() => {
    soundManager?.speak(buildSpokenPrompt(target));
  }, 300);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.arithmetic-station__body');
  const progressEl = rootEl?.querySelector('.arithmetic-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.ARITHMETIC, currentProgress.level);
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
  const el = rootEl?.querySelector('.arithmetic-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'arithmetic-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', { classes: 'arithmetic-station__dots', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state =
      i < roundIndex
        ? 'arithmetic-station__dot--done'
        : i === roundIndex
        ? 'arithmetic-station__dot--current'
        : '';
    dots.append(createElement('span', { classes: ['arithmetic-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

/** @param {number} count */
function buildStarGroup(count) {
  const group = createElement('span', { classes: 'arithmetic-station__stars', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < count; i++) {
    group.append(createElement('span', { classes: 'arithmetic-station__star', text: STAR_GLYPH }));
  }
  return group;
}

function createTile(value, target) {
  const btn = createElement('button', {
    classes: 'answer-tile',
    attrs: { type: 'button', 'aria-label': String(value) },
    text: String(value),
  });
  btn.addEventListener('click', () => handleTileTap(value, target, btn));
  return btn;
}

// ---- Interaction ----

function handleTileTap(value, target, btn) {
  if (roundLocked || btn.disabled) return;

  if (value === target.answer) {
    handleCorrectTap(btn);
  } else {
    handleIncorrectTap(btn, target);
  }
}

function handleCorrectTap(btn) {
  roundLocked = true;

  soundManager?.playEffect('success');
  soundManager?.speak(pickRandom(AFFIRMATIONS));

  btn.classList.add('answer-tile--correct');
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
  btn.classList.remove('answer-tile--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('answer-tile--incorrect');
  scheduleTimeout(() => btn.classList.remove('answer-tile--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const targetTile = tileButtons.get(target.answer);
    targetTile?.classList.add('answer-tile--hint');
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.ARITHMETIC, currentProgress);
}

function navigateToMap() {
  if (screenManager) {
    screenManager.navigate('#/map');
  } else {
    window.location.hash = '#/map';
  }
}

// ---- Helpers ----

/**
 * Builds a spoken/visual accessible label for the equation, e.g.
 * "2 ועוד 3, כמה זה?" without giving away the answer.
 * @param {import('../../../learning/arithmeticData.js').ArithmeticEntry} target
 */
function buildEquationAriaLabel(target) {
  const verb = target.op === '+' ? 'ועוד' : 'פחות';
  return `${target.a} ${verb} ${target.b}, כמה זה?`;
}

/**
 * Builds the spoken prompt read aloud at the start of a round, e.g.
 * "כמה זה 2 ועוד 3?" or "כמה זה 5 פחות 2?" — constructed programmatically
 * from a/op/b rather than hardcoded per-problem.
 * @param {import('../../../learning/arithmeticData.js').ArithmeticEntry} target
 */
function buildSpokenPrompt(target) {
  const verb = target.op === '+' ? 'ועוד' : 'פחות';
  return `כמה זה ${target.a} ${verb} ${target.b}?`;
}

/** @param {import('../../../learning/arithmeticData.js').ArithmeticEntry} target @param {number} optionCount */
function buildOptions(target, optionCount) {
  const distractors = [];
  const pool = shuffle(range(DISTRACTOR_MIN, DISTRACTOR_MAX).filter((n) => n !== target.answer));
  for (const candidate of pool) {
    if (distractors.length >= optionCount - 1) break;
    distractors.push(candidate);
  }
  return shuffle([target.answer, ...distractors]);
}

/** @param {number} min @param {number} max @returns {number[]} inclusive integer range */
function range(min, max) {
  const out = [];
  for (let n = min; n <= max; n++) out.push(n);
  return out;
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

export const ArithmeticStation = { mount, unmount };
