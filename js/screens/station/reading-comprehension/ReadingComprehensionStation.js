/**
 * @file ReadingComprehensionStation.js
 * The reading-comprehension station ("הבנת הנקרא") — Stage 2's seventh and
 * final real learning activity. Registered in
 * js/world-map/stationRegistry.js for CategoryKeys.READING_COMPREHENSION,
 * reached only via PlaceholderStationScreen's delegation seam (see that
 * file), which folds the shared profileManager/soundManager/screenManager
 * instances into the params object it passes to mount().
 *
 * Mechanic: short-story comprehension, structurally closest to
 * js/screens/station/geometry/GeometryStation.js in one specific way —
 * there are 8 stories in the bank, and each session uses a random 6-of-8
 * shuffled subset (ROUNDS_PER_SESSION < bank size), same pattern as
 * Geometry — no "running out" handling needed, and repeat visits see some
 * variety. Unlike every other station, though, each round shows a
 * 2-sentence Hebrew story (read aloud) plus a question about it, and the
 * answer options are curated PER STORY
 * (see readingComprehensionData.js) rather than drawn from a shared bank —
 * buildOptions() below only ever pulls from `target.distractors`, the same
 * story entry's own curated wrong answers, so options are never mixed
 * across different stories. This station awards the ACCESSORY reward
 * family, the same pool PhonologyStation/WordBuildingStation draw from
 * (see rewardCatalog.js — the readingComprehension -> accessory mapping
 * documented there is a deliberate, final decision, not a placeholder).
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { READING_COMPREHENSION_STORIES } from '../../../learning/readingComprehensionData.js';
import { optionCountForLevel, applyCorrectAnswer, applyIncorrectAnswer } from '../../../learning/adaptiveEngine.js';
import { pickNextReward, OUTFIT_ITEMS } from '../../../rewards/rewardCatalog.js';
import { renderCelebration } from '../../../juice/Celebration.js';
import { playRoundTransition } from '../../../juice/RoundTransition.js';

/** Session length — how many rounds make up one visit to the station. There are 8 stories in the bank; a 6-round session uses a random 6-of-8 subset each visit (see mount()'s shuffle+slice), which also adds replay variety across sessions. */
const ROUNDS_PER_SESSION = 6;

/** How long (ms) a correct tile stays visible in its "success" state before the next round appears. */
const ADVANCE_DELAY_MS = 600;

/** How many wrong taps on the same round before a gentle hint glow appears on the correct tile. */
const HINT_AFTER_WRONG_ATTEMPTS = 2;

/** Delay (ms) before the story + question are spoken, to let the round's entrance animation start first. */
const NARRATION_DELAY_MS = 300;

/** Odds that any given round is a "golden round" — double coins plus a small badge flourish. */
const GOLDEN_ROUND_CHANCE = 1 / 6;

const AFFIRMATIONS = ['כל הכבוד, הבנת נכון!', 'מצוין, זאת התשובה הנכונה!', 'איזו הבנה מעולה!', 'איזו הבנה חדה!', 'קראת וניצחת!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-reading-comprehension';

let sessionQueue = [];
let roundIndex = 0;
let currentProgress = null;
let wrongAttempts = 0;
let coinsEarnedThisSession = 0;
let roundLocked = false;
let isGoldenRound = false;
/** @type {Map<string, HTMLElement>} answer label -> tile button, for the current round */
let tileButtons = new Map();
/** @type {number[]} pending window.setTimeout ids, cleared on unmount */
let timers = [];

function mount(container, params) {
  rootEl = container;
  profileManager = params?.profileManager ?? null;
  soundManager = params?.soundManager ?? null;
  screenManager = params?.screenManager ?? null;

  const station = getStationById(params?.id) ?? getStationById('station-reading-comprehension');
  stationId = station?.id ?? 'station-reading-comprehension';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.READING_COMPREHENSION];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(READING_COMPREHENSION_STORIES).slice(0, ROUNDS_PER_SESSION);
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

  const screen = createElement('div', { classes: 'reading-comprehension-station' });

  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/reading-comprehension-scene-alt.png'
    : 'assets/images/stations/scenes/reading-comprehension-scene.png';
  if (useAltScene) screen.classList.add('reading-comprehension-station--scene-alt');

  // Illustrated scene background: probe-load it and fall back to the
  // station's existing gradient background if it's ever missing, mirroring
  // WorldMapScreen.js's bgProbe pattern exactly (and the same treatment
  // already applied to the other 6 stations).
  const bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('reading-comprehension-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'reading-comprehension-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost reading-comprehension-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'reading-comprehension-station__title',
    text: station?.titleHe ?? 'תחנת הבנת הנקרא',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'reading-comprehension-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'reading-comprehension-station__body' });

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
    classes: 'reading-comprehension-station__companion',
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

  const body = rootEl?.querySelector('.reading-comprehension-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  const target = sessionQueue[roundIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(target, optionCount);
  tileButtons = new Map();

  const storyCard = createElement('div', { classes: 'story-card' }, [
    createElement('p', { classes: 'story-card__text', text: target.story }),
  ]);

  // The question line sits directly on the bare scene background (unlike
  // the story card and answer tiles, which already have their own opaque
  // tile-tint background) — the scene-panel class gives it a small
  // translucent backing so it stays legible over the busy illustration.
  const question = createElement('p', {
    classes: ['reading-comprehension-station__question', 'reading-comprehension-station__scene-panel'],
    text: target.question,
  });

  const promptChildren = [storyCard, question];
  if (isGoldenRound) {
    promptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'reading-comprehension-station__prompt' }, promptChildren);

  const grid = createElement('div', {
    classes: 'reading-comprehension-station__grid',
    attrs: { role: 'group', 'aria-label': target.question },
  });
  for (const option of options) {
    const tile = createTile(option, target);
    tileButtons.set(option.label, tile);
    grid.append(tile);
  }

  body.append(prompt, grid);

  // Web Speech API queues consecutive speak() calls by default (each
  // SpeechSynthesisUtterance plays after the previous one finishes unless
  // cancel() is called in between — see NarrationEngine.js), so two
  // sequential speak() calls here reliably read the story, then the
  // question, without needing a completion-callback mechanism.
  scheduleTimeout(() => {
    soundManager?.speak(target.story);
    soundManager?.speak(target.question);
  }, NARRATION_DELAY_MS);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.reading-comprehension-station__body');
  const progressEl = rootEl?.querySelector('.reading-comprehension-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.READING_COMPREHENSION, currentProgress.level);
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
  const el = rootEl?.querySelector('.reading-comprehension-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'reading-comprehension-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', {
    classes: 'reading-comprehension-station__dots',
    attrs: { 'aria-hidden': 'true' },
  });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state =
      i < roundIndex
        ? 'reading-comprehension-station__dot--done'
        : i === roundIndex
        ? 'reading-comprehension-station__dot--current'
        : '';
    dots.append(createElement('span', { classes: ['reading-comprehension-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

function createTile(option, target) {
  const btn = createElement('button', {
    classes: 'answer-option',
    attrs: { type: 'button', 'aria-label': option.label },
  });
  btn.append(
    createElement('span', { classes: 'answer-option__emoji', attrs: { 'aria-hidden': 'true' }, text: option.emoji }),
    createElement('span', { classes: 'answer-option__label', text: option.label })
  );
  btn.addEventListener('click', () => handleTileTap(option, target, btn));
  return btn;
}

// ---- Interaction ----

function handleTileTap(option, target, btn) {
  if (roundLocked || btn.disabled) return;

  if (option.label === target.correct.label) {
    handleCorrectTap(btn);
  } else {
    handleIncorrectTap(btn, target);
  }
}

function handleCorrectTap(btn) {
  roundLocked = true;

  soundManager?.playEffect('success');
  soundManager?.speak(pickRandom(AFFIRMATIONS));

  btn.classList.add('answer-option--correct');
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
  btn.classList.remove('answer-option--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('answer-option--incorrect');
  scheduleTimeout(() => btn.classList.remove('answer-option--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const targetTile = tileButtons.get(target.correct.label);
    targetTile?.classList.add('answer-option--hint');
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.READING_COMPREHENSION, currentProgress);
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
 * Builds the answer options for a round: the story's own correct answer
 * plus `optionCount - 1` distractors, drawn ONLY from that same story
 * entry's `distractors` array — never from any other story's bank entry,
 * so options are always unambiguous for the story shown.
 * @param {import('../../../learning/readingComprehensionData.js').ReadingComprehensionEntry} target
 * @param {number} optionCount
 */
function buildOptions(target, optionCount) {
  const distractors = shuffle(target.distractors).slice(0, optionCount - 1);
  return shuffle([target.correct, ...distractors]);
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

export const ReadingComprehensionStation = { mount, unmount };
