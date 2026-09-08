/**
 * @file MultiplicationPrepStation.js
 * The multiplication-prep station ("הכנה לכפל") — Stage 2's sixth real
 * learning activity. Registered in js/world-map/stationRegistry.js for
 * CategoryKeys.MULTIPLICATION_PREP, reached only via
 * PlaceholderStationScreen's delegation seam (see that file), which folds
 * the shared profileManager/soundManager/screenManager instances into the
 * params object it passes to mount().
 *
 * Mechanic: two related early-multiplication-readiness skills, drawn from
 * one mixed bank in js/learning/multiplicationPrepData.js (per game.md's
 * own spec wording, "הכנה לכפל — קבוצות שוות ודילוגים"):
 *  - 'groups' rounds: `groups` bordered star-clusters of `perGroup` stars
 *    each, prompting "כמה כוכבים יש בסך הכל?" (equal-groups total count).
 *  - 'skip' rounds: 3 given terms of a skip-counting sequence plus a "?"
 *    chip, prompting "מה המספר הבא ברצף?" (next term). Rendered
 *    `direction: ltr` for correct left-to-right numeric reading — the same
 *    documented RTL exception ArithmeticStation.js uses for its equation
 *    text (see arithmetic-station.css's `__equation-text` comment).
 * Both types resolve to the same "pick the tile matching `answer`"
 * interaction, sharing one numeric answer-tile grid/tap-handling path.
 *
 * The round-loop/session-queue/adaptive-difficulty/reward-reveal
 * architecture mirrors js/screens/station/arithmetic/ArithmeticStation.js
 * and js/screens/station/geometry/GeometryStation.js closely (see those
 * files' header comments); only the prompt/visual content and distractor
 * generation differ here — answers range up to 40 (vs. arithmetic's 0-10),
 * so distractors are generated as small offsets from the correct answer
 * rather than drawn from a fixed pool (see buildOptions below). This
 * station awards the FURNITURE reward family, the same pool
 * ArithmeticStation/GeometryStation draw from (see rewardCatalog.js).
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { MULTIPLICATION_PREP_PROBLEMS } from '../../../learning/multiplicationPrepData.js';
import { optionCountForLevel, applyCorrectAnswer, applyIncorrectAnswer } from '../../../learning/adaptiveEngine.js';
import { pickNextReward, MAP_THEME_ITEMS } from '../../../rewards/rewardCatalog.js';
import { renderCelebration } from '../../../juice/Celebration.js';
import { playRoundTransition } from '../../../juice/RoundTransition.js';

/** Session length — how many rounds make up one visit to the station. */
const ROUNDS_PER_SESSION = 6;

/** How long (ms) a correct tile stays visible in its "success" state before the next round appears. */
const ADVANCE_DELAY_MS = 600;

/** How many wrong taps on the same round before a gentle hint glow appears on the correct tile. */
const HINT_AFTER_WRONG_ATTEMPTS = 2;

/** Distractor offsets are drawn from this inclusive range (0 excluded separately). */
const DISTRACTOR_OFFSET_MIN = -5;
const DISTRACTOR_OFFSET_MAX = 5;

/** Odds that any given round is a "golden round" — double coins plus a small badge flourish. */
const GOLDEN_ROUND_CHANCE = 1 / 6;

const AFFIRMATIONS = ['כל הכבוד, חישבת נכון!', 'מצוין, זה בדיוק המספר!', 'איזה חישוב מעולה!', 'איזה ראש למספרים!', 'דילגת נכון!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

const STAR_GLYPH = '⭐';

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-multiplication-prep';

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

  const station = getStationById(params?.id) ?? getStationById('station-multiplication-prep');
  stationId = station?.id ?? 'station-multiplication-prep';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.MULTIPLICATION_PREP];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(MULTIPLICATION_PREP_PROBLEMS).slice(0, ROUNDS_PER_SESSION);
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

  const screen = createElement('div', { classes: 'multiplication-prep-station' });

  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/multiplication-prep-scene-alt.png'
    : 'assets/images/stations/scenes/multiplication-prep-scene.png';
  if (useAltScene) screen.classList.add('multiplication-prep-station--scene-alt');

  // Illustrated scene background with graceful onerror fallback — same
  // bgProbe pattern WorldMapScreen.js uses for the map background image.
  const bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('multiplication-prep-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'multiplication-prep-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost multiplication-prep-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'multiplication-prep-station__title',
    text: station?.titleHe ?? 'תחנת הכנה לכפל',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'multiplication-prep-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'multiplication-prep-station__body' });

  screen.append(header, body, buildCompanion());
  rootEl.append(screen);
}

/**
 * Small decorative companion presence sitting in the corner of the orchard
 * scene — purely ornamental (this station already has its own header
 * back-button for navigation), mounted once here in the persistent shell so
 * it doesn't get re-created/reset on every round. Reuses the real companion
 * art with the same img-onerror-swap-to-emoji-fallback pattern as
 * js/companion/Companion.js.
 */
function buildCompanion() {
  const wrap = createElement('div', {
    classes: 'multiplication-prep-station__companion',
    attrs: { 'aria-hidden': 'true' },
  });
  const img = createElement('img', { attrs: { src: 'assets/images/companion/companion-idle.png', alt: '' } });
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

  const body = rootEl?.querySelector('.multiplication-prep-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  const target = sessionQueue[roundIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(target, optionCount);
  tileButtons = new Map();

  const promptChildren = [
    createElement('p', {
      classes: 'multiplication-prep-station__prompt-lead',
      text: buildPromptLead(target),
    }),
  ];
  if (isGoldenRound) {
    promptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'multiplication-prep-station__prompt' }, promptChildren);

  const visual = target.type === 'groups' ? buildGroupsVisual(target) : buildSkipVisual(target);

  const grid = createElement('div', {
    classes: 'multiplication-prep-station__grid',
    attrs: { role: 'group', 'aria-label': 'בחרו את התשובה הנכונה' },
  });
  for (const value of options) {
    const tile = createTile(value, target);
    tileButtons.set(value, tile);
    grid.append(tile);
  }

  // Translucent backing behind the round's visual + answer tiles so they
  // stay legible over the busy orchard scene background (see
  // .multiplication-prep-station__scene-panel in the stylesheet). Wraps
  // both problem types identically; the sequence-row's own `direction: ltr`
  // exception lives on .sequence-row itself and is unaffected by this
  // outer wrapper.
  const scenePanel = createElement('div', { classes: 'multiplication-prep-station__scene-panel' }, [
    prompt,
    visual,
    grid,
  ]);
  body.append(scenePanel);

  scheduleTimeout(() => {
    soundManager?.speak(buildPromptLead(target));
  }, 300);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.multiplication-prep-station__body');
  const progressEl = rootEl?.querySelector('.multiplication-prep-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.MULTIPLICATION_PREP, currentProgress.level);
  const ownedMapThemes = activeProfile?.inventory?.mapThemes ?? [];
  const reward = pickNextReward(MAP_THEME_ITEMS, ownedMapThemes);
  if (reward) profileManager?.addReward('mapTheme', reward.id);

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
  const el = rootEl?.querySelector('.multiplication-prep-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'multiplication-prep-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', {
    classes: 'multiplication-prep-station__dots',
    attrs: { 'aria-hidden': 'true' },
  });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state =
      i < roundIndex
        ? 'multiplication-prep-station__dot--done'
        : i === roundIndex
        ? 'multiplication-prep-station__dot--current'
        : '';
    dots.append(createElement('span', { classes: ['multiplication-prep-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

/**
 * Equal-groups visual: `groups` bordered cluster boxes side by side, each
 * containing `perGroup` stars — distinct clusters, not one undifferentiated
 * row, so the equal-groups structure is visually obvious.
 * @param {import('../../../learning/multiplicationPrepData.js').GroupsEntry} target
 */
function buildGroupsVisual(target) {
  const row = createElement('div', {
    classes: 'group-cluster-row',
    attrs: { role: 'img', 'aria-label': buildGroupsAriaLabel(target) },
  });
  for (let g = 0; g < target.groups; g++) {
    const cluster = createElement('div', { classes: 'group-cluster' });
    for (let s = 0; s < target.perGroup; s++) {
      cluster.append(createElement('span', { classes: 'group-cluster__star', text: STAR_GLYPH }));
    }
    row.append(cluster);
  }
  return row;
}

/** @param {import('../../../learning/multiplicationPrepData.js').GroupsEntry} target */
function buildGroupsAriaLabel(target) {
  return `${target.groups} קבוצות של ${target.perGroup} כוכבים כל אחת, כמה כוכבים יש בסך הכל?`;
}

/**
 * Skip-counting visual: the 3 given sequence terms plus a "?" chip, styled
 * left-to-right (see .sequence-row's `direction: ltr` comment in
 * multiplication-prep-station.css) for correct numeric reading order — the
 * same documented RTL exception ArithmeticStation.js uses for its equation
 * text.
 * @param {import('../../../learning/multiplicationPrepData.js').SkipEntry} target
 */
function buildSkipVisual(target) {
  const row = createElement('div', {
    classes: 'sequence-row',
    attrs: { role: 'img', 'aria-label': buildSkipAriaLabel(target) },
  });
  for (const n of target.sequence) {
    row.append(createElement('span', { classes: 'sequence-chip', text: String(n) }));
  }
  row.append(
    createElement('span', { classes: 'sequence-chip sequence-chip--question', text: '?', attrs: { 'aria-hidden': 'true' } })
  );
  return row;
}

/** @param {import('../../../learning/multiplicationPrepData.js').SkipEntry} target */
function buildSkipAriaLabel(target) {
  return `${target.sequence.join(', ')}, מה המספר הבא ברצף?`;
}

/** @param {import('../../../learning/multiplicationPrepData.js').MultiplicationPrepEntry} target */
function buildPromptLead(target) {
  return target.type === 'groups' ? 'כמה כוכבים יש בסך הכל?' : 'מה המספר הבא ברצף?';
}

function createTile(value, target) {
  const btn = createElement('button', {
    classes: 'number-tile',
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

  btn.classList.add('number-tile--correct');
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
  btn.classList.remove('number-tile--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('number-tile--incorrect');
  scheduleTimeout(() => btn.classList.remove('number-tile--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const targetTile = tileButtons.get(target.answer);
    targetTile?.classList.add('number-tile--hint');
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.MULTIPLICATION_PREP, currentProgress);
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
 * Builds the numeric answer options for a round: the correct answer plus
 * `optionCount - 1` distinct distractors. Answers here range up to 40 (vs.
 * arithmetic's fixed 0-10 bank), so distractors are generated as small
 * random offsets from the correct answer rather than drawn from a fixed
 * pool — offsets are non-zero integers roughly in [-5, 5], reflected to the
 * positive side if they'd go negative, and deduplicated against each other
 * and against the correct answer.
 * @param {import('../../../learning/multiplicationPrepData.js').MultiplicationPrepEntry} target
 * @param {number} optionCount
 */
function buildOptions(target, optionCount) {
  const distractors = [];
  let guard = 0;
  while (distractors.length < optionCount - 1 && guard < 300) {
    guard += 1;
    const offset = randomNonZeroOffset();
    let candidate = target.answer + offset;
    if (candidate < 0) candidate = target.answer + Math.abs(offset); // reflect to the positive side
    if (candidate < 0) continue;
    if (candidate === target.answer) continue;
    if (distractors.includes(candidate)) continue;
    distractors.push(candidate);
  }
  return shuffle([target.answer, ...distractors]);
}

/** @returns {number} a random non-zero integer in [DISTRACTOR_OFFSET_MIN, DISTRACTOR_OFFSET_MAX] */
function randomNonZeroOffset() {
  let offset = 0;
  while (offset === 0) {
    offset = DISTRACTOR_OFFSET_MIN + Math.floor(Math.random() * (DISTRACTOR_OFFSET_MAX - DISTRACTOR_OFFSET_MIN + 1));
  }
  return offset;
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

export const MultiplicationPrepStation = { mount, unmount };
