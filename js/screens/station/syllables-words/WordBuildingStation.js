/**
 * @file WordBuildingStation.js
 * The syllables/words station ("הברות ומילים") — Stage 2's third real
 * learning activity. Registered in js/world-map/stationRegistry.js for
 * CategoryKeys.SYLLABLES_WORDS, reached only via PlaceholderStationScreen's
 * delegation seam (see that file), which folds the shared
 * profileManager/soundManager/screenManager instances into the params
 * object it passes to mount().
 *
 * Two round types alternate across the 8-round session (even index = blank,
 * odd index = assemble):
 *
 * 1. "Complete the word" (blank rounds) — a curated fill-in-the-missing-
 *    letter exercise, themed as a syllable train (each letter position
 *    rendered as a small train-car box). Deliberately NOT algorithmic
 *    syllable-splitting — Hebrew syllable boundaries without niqud are
 *    genuinely ambiguous, so this avoids that correctness risk by using the
 *    hand-picked word bank in js/learning/wordBuildingData.js instead.
 * 2. "Lost word" (assemble rounds) — a night-detective-themed sequencing
 *    exercise: the word's own letters (plus `level - 1` decoy letters drawn
 *    from js/learning/lettersData.js, so level 1 has zero decoys) are
 *    shuffled into tiles, and the child must tap them in the correct order
 *    to walk the word home into its empty house-slots. Tiles are matched by
 *    character value (not stored position), so a word with a repeated
 *    letter (e.g. שמש) never confuses which physical tile "belongs" where —
 *    any remaining unused tile with the needed character is accepted. Only
 *    the fully-assembled word counts as one round's correct answer (coins/
 *    progress awarded once per word, not once per letter), keeping session
 *    economy identical to blank rounds.
 *
 * The round-loop/session-queue/adaptive-difficulty/reward-reveal
 * architecture mirrors js/screens/station/letters/LettersStation.js and
 * js/screens/station/phonology/PhonologyStation.js closely (see those
 * files' header comments); this station reuses phonology's ACCESSORY
 * reward pool (per Stage 1's syllablesWords -> accessory mapping in
 * rewardCatalog.js).
 *
 * Exports { mount(container, params), unmount() } matching the router
 * contract shape exactly, per js/core/router/ScreenManager.js.
 */
import { createElement, clearElement } from '../../../utils/dom.js';
import { getStationById } from '../../../world-map/stations.js';
import { CategoryKeys } from '../../../learning/categories.js';
import { WORD_BUILDING_WORDS } from '../../../learning/wordBuildingData.js';
import { LETTERS } from '../../../learning/lettersData.js';
import { optionCountForLevel, applyCorrectAnswer, applyIncorrectAnswer } from '../../../learning/adaptiveEngine.js';
import { pickNextReward, OUTFIT_ITEMS } from '../../../rewards/rewardCatalog.js';
import { renderCelebration } from '../../../juice/Celebration.js';
import { playRoundTransition } from '../../../juice/RoundTransition.js';

/** Session length — how many rounds make up one visit to the station. */
const ROUNDS_PER_SESSION = 6;

/** How long (ms) a correct answer stays visible in its "success" state before the next round appears. */
const ADVANCE_DELAY_MS = 600;

/** How many wrong taps on the same round before a gentle hint glow appears on the correct tile. */
const HINT_AFTER_WRONG_ATTEMPTS = 2;

/** Odds that any given round is a "golden round" — double coins plus a small badge flourish. */
const GOLDEN_ROUND_CHANCE = 1 / 6;

const AFFIRMATIONS = ['השלמת את המילה!', 'איזה כיף, בול!', 'קריאה מעולה!', 'וואו, איזו הצלחה!', 'יאלה, קדימה!'];
const ENCOURAGEMENTS = ['כמעט! בואו ננסה שוב', 'כמעט הצלחת!', 'אפשר לנסות שוב, אני מאמין/ה בך!'];

/** Spoken/written intro for "lost word" assemble rounds — the night-detective framing. */
const ASSEMBLE_INTRO_TEXT = 'המילה הזו יצאה לטייל בלילה ואיבדה את הדרך הביתה! עזרו לה להתאסף בסדר הנכון ולחזור 🌙';
const ASSEMBLE_INTRO_SPOKEN = 'המילה הזו איבדה את הדרך הביתה בלילה. עזרו לה לחזור, אות אחרי אות, בסדר הנכון';

/** Placeholder glyph shown in the blanked train-car box before it's solved. */
const BLANK_GLYPH = '_';

// --- Per-mount state (this module is imported once and reused; all of
// this is reset at the top of mount() and cleared in unmount()). ---
let rootEl = null;
let profileManager = null;
let soundManager = null;
let screenManager = null;
let stationId = 'station-syllables-words';

let sessionQueue = [];
let roundIndex = 0;
let currentProgress = null;
let wrongAttempts = 0;
let coinsEarnedThisSession = 0;
let roundLocked = false;
let isGoldenRound = false;
/** @type {HTMLElement|null} the blanked letter-box tile for the current round, so the correct tap can fill it in visually */
let blankBoxEl = null;
/** @type {Map<string, HTMLElement>} letter/tile id -> option tile button, for the current round */
let tileButtons = new Map();
/** @type {number} for assemble rounds: index of the next word-letter still needed, 0-based */
let assembleNextIndex = 0;
/** @type {HTMLElement[]} for assemble rounds: the empty "house" slot elements, in word order */
let assembleHouseSlots = [];
/** @type {number[]} pending window.setTimeout ids, cleared on unmount */
let timers = [];

function mount(container, params) {
  rootEl = container;
  profileManager = params?.profileManager ?? null;
  soundManager = params?.soundManager ?? null;
  screenManager = params?.screenManager ?? null;

  const station = getStationById(params?.id) ?? getStationById('station-syllables-words');
  stationId = station?.id ?? 'station-syllables-words';

  profileManager?.recordStationVisit(stationId);

  const activeProfile = profileManager?.getActiveProfile();
  const startingProgress = activeProfile?.progress?.[CategoryKeys.SYLLABLES_WORDS];
  currentProgress = {
    level: startingProgress?.level ?? 1,
    masteryScore: startingProgress?.masteryScore ?? 0,
    streak: startingProgress?.streak ?? 0,
    lastPlayedAt: startingProgress?.lastPlayedAt ?? null,
  };

  sessionQueue = shuffle(WORD_BUILDING_WORDS).slice(0, ROUNDS_PER_SESSION);
  roundIndex = 0;
  wrongAttempts = 0;
  coinsEarnedThisSession = 0;
  roundLocked = false;
  assembleNextIndex = 0;
  assembleHouseSlots = [];
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
  blankBoxEl = null;
  assembleHouseSlots = [];
  currentProgress = null;
}

// ---- Rendering ----

function renderShell(station) {
  clearElement(rootEl);

  const screen = createElement('div', { classes: 'word-building-station' });

  // Pick the scene background variant once per mount (not re-randomized per
  // round) — roughly 50/50 between the default and "alt" illustrated scene,
  // for a little visual variety between visits.
  const useAltScene = Math.random() < 0.5;
  const scenePath = useAltScene
    ? 'assets/images/stations/scenes/syllables-words-scene-alt.png'
    : 'assets/images/stations/scenes/syllables-words-scene.png';
  if (useAltScene) screen.classList.add('word-building-station--scene-alt');

  // Illustrated night-village scene background, with a graceful fallback to
  // the station's original gradient if the image fails to load. Mirrors the
  // bgProbe pattern in js/screens/world-map/WorldMapScreen.js exactly.
  const bgProbe = new Image();
  bgProbe.onerror = () => screen.classList.add('word-building-station--fallback-bg');
  bgProbe.src = scenePath;

  const header = createElement('header', { classes: 'word-building-station__header' });
  const backBtn = createElement('button', {
    classes: 'btn btn-ghost word-building-station__back',
    attrs: { type: 'button' },
    text: 'בחזרה למפה',
  });
  backBtn.addEventListener('click', () => {
    soundManager?.playEffect('click');
    navigateToMap();
  });

  const title = createElement('h1', {
    classes: 'word-building-station__title',
    text: station?.titleHe ?? 'תחנת הברות ומילים',
  });

  // Not marked aria-live itself: #screen-root already has aria-live="polite"
  // (see index.html), and this updates on every round (~every second while
  // answering correctly) — a nested live region here would just spam
  // screen-reader users with "Round N of 8" on each tap.
  const progress = createElement('div', { classes: 'word-building-station__progress' });

  header.append(backBtn, title, progress);

  const body = createElement('div', { classes: 'word-building-station__body' });

  screen.append(header, body, buildCompanion());
  rootEl.append(screen);
}

/**
 * Small decorative companion presence in the scene corner — purely
 * ornamental (aria-hidden, no click handler; this station already has its
 * own header back-button for navigation). Mounted once here in the
 * persistent shell so it never flickers/resets on each round. Reuses the
 * same img-with-emoji-fallback pattern as js/companion/Companion.js.
 */
function buildCompanion() {
  const wrap = createElement('div', {
    classes: 'word-building-station__companion',
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
  blankBoxEl = null;
  assembleNextIndex = 0;
  assembleHouseSlots = [];

  const body = rootEl?.querySelector('.word-building-station__body');
  if (!body) return;
  clearElement(body);

  updateProgressIndicator();

  // Alternate round types across the session: even index = "complete the
  // word" (blank), odd index = "lost word" (assemble). See file header.
  if (roundIndex % 2 === 1) {
    renderAssembleRound(body);
  } else {
    renderBlankRound(body);
  }
}

function renderBlankRound(body) {
  const target = sessionQueue[roundIndex];
  const correctLetter = target.word[target.blankIndex];
  const optionCount = optionCountForLevel(currentProgress.level);
  const options = buildOptions(correctLetter, optionCount);
  tileButtons = new Map();

  const blankPromptChildren = [
    createElement('p', { classes: 'word-building-station__prompt-lead', text: 'השלימו את המילה' }),
    createElement('span', {
      classes: 'word-building-station__prompt-emoji',
      attrs: { 'aria-hidden': 'true' },
      text: target.emoji,
    }),
  ];
  if (isGoldenRound) {
    blankPromptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'word-building-station__prompt' }, blankPromptChildren);

  const train = createElement('div', {
    classes: 'word-building-station__train',
    attrs: { role: 'img', 'aria-label': buildWordAriaLabel(target) },
  });
  for (let i = 0; i < target.word.length; i++) {
    const isBlank = i === target.blankIndex;
    const car = createElement('span', {
      classes: ['word-building-station__car', isBlank ? 'word-building-station__car--blank' : ''].filter(Boolean),
      text: isBlank ? BLANK_GLYPH : target.word[i],
    });
    if (isBlank) blankBoxEl = car;
    train.append(car);
  }

  const grid = createElement('div', {
    classes: 'word-building-station__grid',
    attrs: { role: 'group', 'aria-label': 'בחרו את האות המתאימה' },
  });
  for (const letter of options) {
    const tile = createTile(letter, correctLetter, target);
    tileButtons.set(letter.id, tile);
    grid.append(tile);
  }

  const panel = createElement('div', { classes: 'word-building-station__scene-panel' });
  panel.append(prompt, train, grid);
  body.append(panel);

  scheduleTimeout(() => {
    soundManager?.speak('השלימו את המילה');
  }, 300);
}

function renderAssembleRound(body) {
  const target = sessionQueue[roundIndex];
  const wordChars = target.word.split('');

  // Difficulty here is decoy-tile count, not option count — level 1 gets
  // zero decoys (just the word's own letters, shuffled), level 2 gets one,
  // level 3 gets two. Distractors are always letters absent from the word,
  // so they can never be mistaken for a "duplicate" of a needed letter.
  const decoyCount = Math.max(0, currentProgress.level - 1);
  const decoyLetters = shuffle(LETTERS.filter((l) => !wordChars.includes(l.char))).slice(0, decoyCount);

  const tileDefs = shuffle([
    ...wordChars.map((char, i) => ({ id: `word-${i}`, char })),
    ...decoyLetters.map((l, i) => ({ id: `decoy-${i}`, char: l.char })),
  ]);

  const assemblePromptChildren = [
    createElement('p', { classes: 'word-building-station__prompt-lead', text: ASSEMBLE_INTRO_TEXT }),
    createElement('span', {
      classes: 'word-building-station__prompt-emoji',
      attrs: { 'aria-hidden': 'true' },
      text: target.emoji,
    }),
  ];
  if (isGoldenRound) {
    assemblePromptChildren.push(
      createElement('p', { classes: 'golden-round-badge', text: '⭐ סיבוב מוזהב! מטבע כפול!' })
    );
  }
  const prompt = createElement('div', { classes: 'word-building-station__prompt' }, assemblePromptChildren);

  const house = createElement('div', {
    classes: 'word-building-station__train',
    attrs: { role: 'img', 'aria-label': `הרכיבו את המילה בסדר הנכון, ${wordChars.length} אותיות` },
  });
  assembleHouseSlots = [];
  for (let i = 0; i < wordChars.length; i++) {
    const car = createElement('span', {
      classes: 'word-building-station__car word-building-station__car--blank',
      text: BLANK_GLYPH,
    });
    assembleHouseSlots.push(car);
    house.append(car);
  }

  const grid = createElement('div', {
    classes: 'word-building-station__grid',
    attrs: { role: 'group', 'aria-label': 'אותיות להרכבה' },
  });
  tileButtons = new Map();
  for (const tileDef of tileDefs) {
    const tile = createAssembleTile(tileDef, wordChars);
    tileButtons.set(tileDef.id, tile);
    grid.append(tile);
  }

  const panel = createElement('div', { classes: 'word-building-station__scene-panel' });
  panel.append(prompt, house, grid);
  body.append(panel);

  scheduleTimeout(() => {
    soundManager?.speak(ASSEMBLE_INTRO_SPOKEN);
  }, 300);
}

function renderCompletion() {
  const body = rootEl?.querySelector('.word-building-station__body');
  const progressEl = rootEl?.querySelector('.word-building-station__progress');
  if (progressEl) clearElement(progressEl);
  if (!body) return;
  clearElement(body);

  const activeProfile = profileManager?.getActiveProfile();
  profileManager?.recordMedalIfEarned(CategoryKeys.SYLLABLES_WORDS, currentProgress.level);
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
  const el = rootEl?.querySelector('.word-building-station__progress');
  if (!el) return;
  clearElement(el);

  const text = createElement('p', {
    classes: 'word-building-station__progress-text',
    text: `סיבוב ${roundIndex + 1} מתוך ${sessionQueue.length}`,
  });

  const dots = createElement('div', { classes: 'word-building-station__dots', attrs: { 'aria-hidden': 'true' } });
  for (let i = 0; i < sessionQueue.length; i++) {
    const state =
      i < roundIndex
        ? 'word-building-station__dot--done'
        : i === roundIndex
        ? 'word-building-station__dot--current'
        : '';
    dots.append(createElement('span', { classes: ['word-building-station__dot', state].filter(Boolean) }));
  }

  el.append(text, dots);
}

function createTile(letter, correctLetter, target) {
  const btn = createElement('button', {
    classes: 'letter-slot',
    attrs: { type: 'button', 'aria-label': `האות ${letter.nameHe}` },
    text: letter.char,
  });
  btn.addEventListener('click', () => handleTileTap(letter, correctLetter, target, btn));
  return btn;
}

// ---- Interaction ----

function handleTileTap(letter, correctLetter, target, btn) {
  if (roundLocked || btn.disabled) return;

  if (letter.char === correctLetter) {
    handleCorrectTap(btn);
  } else {
    handleIncorrectTap(btn, correctLetter);
  }
}

function handleCorrectTap(btn) {
  roundLocked = true;

  soundManager?.playEffect('success');
  soundManager?.speak(pickRandom(AFFIRMATIONS));

  btn.classList.add('letter-slot--correct');
  for (const tile of tileButtons.values()) {
    tile.disabled = true;
  }

  if (blankBoxEl) {
    blankBoxEl.textContent = btn.textContent;
    blankBoxEl.classList.remove('word-building-station__car--blank');
    blankBoxEl.classList.add('word-building-station__car--filled');
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

function handleIncorrectTap(btn, correctLetter) {
  soundManager?.playEffect('pop');
  soundManager?.speak(pickRandom(ENCOURAGEMENTS));

  currentProgress = applyIncorrectAnswer(currentProgress);
  persistProgress();
  wrongAttempts += 1;

  // Non-animation-dependent feedback too (prefers-reduced-motion neutralizes
  // the animation-duration globally, so the class also carries its own
  // background/border change that reads fine with zero motion).
  btn.classList.remove('letter-slot--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth; // restart the animation if tapped again quickly
  btn.classList.add('letter-slot--incorrect');
  scheduleTimeout(() => btn.classList.remove('letter-slot--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    for (const tile of tileButtons.values()) {
      if (tile.textContent === correctLetter) {
        tile.classList.add('letter-slot--hint');
        break;
      }
    }
  }
}

// ---- Assemble-round interaction ("lost word") ----
//
// Tiles are matched by character value against the next needed letter, not
// by a stored original position — so if a word repeats a letter (e.g. שמש
// has two ש), tapping EITHER unused matching tile is accepted. This is
// simpler than position-tracking and never confuses the child: any unused
// tile showing the right glyph is, by definition, correct for "the next ש".

function createAssembleTile(tileDef, wordChars) {
  const btn = createElement('button', {
    classes: 'letter-slot',
    attrs: { type: 'button', 'aria-label': `האות ${tileDef.char}` },
    text: tileDef.char,
  });
  btn.addEventListener('click', () => handleAssembleTileTap(tileDef, btn, wordChars));
  return btn;
}

function handleAssembleTileTap(tileDef, btn, wordChars) {
  if (roundLocked || btn.disabled) return;

  const neededChar = wordChars[assembleNextIndex];
  if (tileDef.char === neededChar) {
    handleAssembleCorrectTap(btn, wordChars);
  } else {
    handleAssembleIncorrectTap(btn, wordChars);
  }
}

function handleAssembleCorrectTap(btn, wordChars) {
  btn.disabled = true;
  btn.classList.add('letter-slot--correct');
  soundManager?.playEffect('success');

  const slot = assembleHouseSlots[assembleNextIndex];
  if (slot) {
    slot.textContent = btn.textContent;
    slot.classList.remove('word-building-station__car--blank');
    slot.classList.add('word-building-station__car--filled');
  }

  assembleNextIndex += 1;
  wrongAttempts = 0; // hint threshold applies per letter-position, not across the whole word

  if (assembleNextIndex >= wordChars.length) {
    handleAssembleWordComplete();
  }
}

/** The whole word is home — this is the round's one scored "correct answer" (coins/progress awarded once per word, matching blank rounds' economy). */
function handleAssembleWordComplete() {
  roundLocked = true;
  soundManager?.speak(pickRandom(AFFIRMATIONS));

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

function handleAssembleIncorrectTap(btn, wordChars) {
  soundManager?.playEffect('pop');
  soundManager?.speak(pickRandom(ENCOURAGEMENTS));

  currentProgress = applyIncorrectAnswer(currentProgress);
  persistProgress();
  wrongAttempts += 1;

  btn.classList.remove('letter-slot--incorrect');
  // eslint-disable-next-line no-unused-expressions
  void btn.offsetWidth;
  btn.classList.add('letter-slot--incorrect');
  scheduleTimeout(() => btn.classList.remove('letter-slot--incorrect'), 500);

  if (wrongAttempts >= HINT_AFTER_WRONG_ATTEMPTS) {
    const neededChar = wordChars[assembleNextIndex];
    for (const tile of tileButtons.values()) {
      if (!tile.disabled && tile.textContent === neededChar) {
        tile.classList.add('letter-slot--hint');
        break;
      }
    }
  }
}

function persistProgress() {
  profileManager?.updateCategoryProgress(CategoryKeys.SYLLABLES_WORDS, currentProgress);
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
 * Builds a spoken/visual accessible label for the train, e.g. "המילה:
 * ס, חסר, ר" without giving away the missing letter's identity.
 * @param {import('../../../learning/wordBuildingData.js').WordBuildingEntry} target
 */
function buildWordAriaLabel(target) {
  const parts = [];
  for (let i = 0; i < target.word.length; i++) {
    parts.push(i === target.blankIndex ? 'אות חסרה' : target.word[i]);
  }
  return `השלימו את המילה: ${parts.join(', ')}`;
}

/** @param {string} correctLetter @param {number} optionCount */
function buildOptions(correctLetter, optionCount) {
  const correct = LETTERS.find((l) => l.char === correctLetter);
  const distractors = shuffle(LETTERS.filter((l) => l.char !== correctLetter)).slice(0, optionCount - 1);
  return shuffle(correct ? [correct, ...distractors] : distractors);
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

export const WordBuildingStation = { mount, unmount };
