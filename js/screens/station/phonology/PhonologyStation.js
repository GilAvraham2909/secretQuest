/**
 * @file PhonologyStation.js
 * The phonology station ("צלילים") — Stage 2's second real learning
 * activity. Registered in js/world-map/stationRegistry.js for
 * CategoryKeys.PHONOLOGY, reached only via PlaceholderStationScreen's
 * delegation seam (see that file), which folds the shared
 * profileManager/soundManager/screenManager instances into the params
 * object it passes to mount().
 *
 * Mechanic: phonological awareness, "which word starts with this sound?" —
 * distinct from the Letters station's pure letter-shape matching. The
 * round-loop/session-queue/adaptive-difficulty/reward-reveal architecture
 * mirrors js/screens/station/letters/LettersStation.js closely (see that
 * file's header comment); only the prompt/tile content and reward family
 * differ here.
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { PHONOLOGY_WORDS } from '../../../learning/phonologyData.js';
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

const AFFIRMATIONS = ['יופי!', 'בול פגיעה!', 'כל הכבוד!', 'איזה אוזן חדה!', 'את/ה כוכב/ת!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-phonology';

let sessionQueue = [];
let roundIndex = 0;
let currentProgress = null;
let wrongAttempts = 0;
let coinsEarnedThisSession = 0;
let roundLocked = false;
let isGoldenRound = false;
/** @type {Map<string, HTMLElement>} word id -> tile button, for the current round */
let tileButtons = new Map();
/** @type {number[]} pending window.setTimeout ids, cleared on unmount */
let timers = [];

function mount(container, params) {
  rootEl = container;
  profileManager = params?.profileManager ?? null;
  soundManager = params?.soundManager ?? null;
  screenManager = params?.screenManager ?? null;

  const station = getStationById(params?.id) ?? getStationById('station-phonology');
  stationId = station?.id ?? 'station-phonology';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.PHONOLOGY];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(PHONOLOGY_WORDS).slice(0, ROUNDS_PER_SESSION);
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

  const screen = createElement('div', { classes: 'phonology-station' });

  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/phonology-scene-alt.png'
    : 'assets/images/stations/scenes/phonology-scene.png';
  if (useAltScene) screen.classList.add('phonology-station--scene-alt');

  // Illustrated scene background: probe-load it and fall back to the
  // station's existing gradient background if it's ever missing, mirroring
  // WorldMapScreen.js's bgProbe pattern exactly.
  const bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('phonology-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'phonology-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost phonology-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'phonology-station__title',
    text: station?.titleHe ?? 'תחנת הצלילים',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'phonology-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'phonology-station__body' });

  screen.append(header, body, buildCompanion());
  rootEl.append(screen);
}

/**
 * Small decorative companion presence in a corner of the scene — mounted
 * once as part of the persistent screen chrome (not re-created per round).
 * Purely decorative: not focusable/interactive, this station already has
 * its own header back-button for navigation. Mirrors the image-with-
 * emoji-fallback pattern used by js/companion/Companion.js.
 */
function buildCompanion() {
  const wrap = createElement('div', {
    classes: 'phonology-station__companion',
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

  const body = rootEl?.querySelector('.phonology-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  const target = sessionQueue[roundIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(target, optionCount);
  tileButtons = new Map();

  const promptChildren = [
    createElement('p', { classes: 'phonology-station__prompt-lead', text: 'איזו מילה מתחילה בצליל' }),
    createElement('p', { classes: 'phonology-station__prompt-target', text: target.firstLetterName }),
  ];
  if (isGoldenRound) {
    promptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'phonology-station__prompt' }, promptChildren);

  const grid = createElement('div', {
    classes: 'phonology-station__grid',
    attrs: { role: 'group', 'aria-label': `בחרו את המילה שמתחילה בצליל ${target.firstLetterName}` },
  });
  for (const word of options) {
    const tile = createTile(word, target);
    tileButtons.set(word.id, tile);
    grid.append(tile);
  }

  const scenePanel = createElement('div', { classes: 'phonology-station__scene-panel' }, [prompt, grid]);
  body.append(scenePanel);

  scheduleTimeout(() => {
    soundManager?.speak(`איזו מילה מתחילה בצליל ${target.firstLetterName}?`);
  }, 300);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.phonology-station__body');
  const progressEl = rootEl?.querySelector('.phonology-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.PHONOLOGY, currentProgress.level);
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
  const el = rootEl?.querySelector('.phonology-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'phonology-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', { classes: 'phonology-station__dots', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state =
      i < roundIndex ? 'phonology-station__dot--done' : i === roundIndex ? 'phonology-station__dot--current' : '';
    dots.append(createElement('span', { classes: ['phonology-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

function createTile(word, target) {
  const btn = createElement('button', {
    classes: 'word-tile',
    attrs: { type: 'button', 'aria-label': word.word },
  });
  btn.append(
    createElement('span', { classes: 'word-tile__emoji', attrs: { 'aria-hidden': 'true' }, text: word.emoji }),
    createElement('span', { classes: 'word-tile__label', text: word.word })
  );
  btn.addEventListener('click', () => handleTileTap(word, target, btn));
  return btn;
}

// ---- Interaction ----

function handleTileTap(word, target, btn) {
  if (roundLocked || btn.disabled) return;

  if (word.id === target.id) {
    handleCorrectTap(btn);
  } else {
    handleIncorrectTap(btn, target);
  }
}

function handleCorrectTap(btn) {
  roundLocked = true;

  soundManager?.playEffect('success');
  soundManager?.speak(pickRandom(AFFIRMATIONS));

  btn.classList.add('word-tile--correct');
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
  btn.classList.remove('word-tile--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('word-tile--incorrect');
  scheduleTimeout(() => btn.classList.remove('word-tile--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const targetTile = tileButtons.get(target.id);
    targetTile?.classList.add('word-tile--hint');
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.PHONOLOGY, currentProgress);
}

function navigateToMap() {
  if (screenManager) {
    screenManager.navigate('#/map');
  } else {
    window.location.hash = '#/map';
  }
}

// ---- Helpers ----

/** @param {import('../../../learning/phonologyData.js').PhonologyEntry} target @param {number} optionCount */
function buildOptions(target, optionCount) {
  const distractors = shuffle(PHONOLOGY_WORDS.filter((w) => w.id !== target.id)).slice(0, optionCount - 1);
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

export const PhonologyStation = { mount, unmount };
