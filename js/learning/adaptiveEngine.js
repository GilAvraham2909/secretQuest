/**
 * @file adaptiveEngine.js
 * Small, generic, reusable adaptive-difficulty engine for tile-based
 * learning stations. Pure functions only — no storage access, no
 * station-specific knowledge (letters, numbers, shapes, ...). A station
 * screen owns reading the current CategoryProgress from ProfileManager and
 * persisting the object this module returns; this module never touches
 * storage itself. Future stations (phonology, arithmetic, ...) can reuse
 * this same module for their own tile-count-based difficulty curve.
 * @typedef {{level: number, masteryScore: number, streak: number, lastPlayedAt: string|null}} CategoryProgress
 */

const MIN_LEVEL = 1;
const MAX_LEVEL = 3;
/** Every Nth consecutive correct answer (session-independent, persisted streak) steps the level up. */
const STREAK_STEP_UP_EVERY = 3;

/** @param {number} level @returns {number} clamped to [MIN_LEVEL, MAX_LEVEL] */
function clampLevel(level) {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Number.isFinite(level) ? level : MIN_LEVEL));
}

/**
 * How many tappable options a round should offer for a given level.
 * @param {number} level
 * @returns {number} 2 for level 1, 3 for level 2, 4 for level 3+
 */
export function optionCountForLevel(level) {
  const clamped = clampLevel(level);
  if (clamped <= 1) return 2;
  if (clamped === 2) return 3;
  return 4;
}

/**
 * @param {CategoryProgress} progress current progress
 * @returns {CategoryProgress} a new progress object reflecting one correct answer
 */
export function applyCorrectAnswer(progress) {
  const level = clampLevel(progress?.level);
  const masteryScore = Math.max(0, (progress?.masteryScore ?? 0) + 1);
  const streak = Math.max(0, (progress?.streak ?? 0) + 1);

  const shouldStepUp = streak % STREAK_STEP_UP_EVERY === 0 && level < MAX_LEVEL;
  const nextLevel = shouldStepUp ? clampLevel(level + 1) : level;

  return {
    level: nextLevel,
    masteryScore,
    streak,
    lastPlayedAt: new Date().toISOString(),
  };
}

/**
 * "Zero frustration" rule: struggle drops difficulty immediately, not
 * after a delay. Streak resets right away too.
 * @param {CategoryProgress} progress current progress
 * @returns {CategoryProgress} a new progress object reflecting one incorrect answer
 */
export function applyIncorrectAnswer(progress) {
  const level = clampLevel(progress?.level);
  const masteryScore = Math.max(0, progress?.masteryScore ?? 0);
  const nextLevel = level > MIN_LEVEL ? clampLevel(level - 1) : level;

  return {
    level: nextLevel,
    masteryScore,
    streak: 0,
    lastPlayedAt: new Date().toISOString(),
  };
}
