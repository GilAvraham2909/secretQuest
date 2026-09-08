/**
 * @file wordBuildingData.js
 * Curated "complete the word" bank for the syllables/words station
 * ("הברות ומילים"). Deliberately NOT algorithmic syllable-splitting —
 * Hebrew syllable boundaries without niqud are genuinely ambiguous, so this
 * sidesteps that correctness risk with simple, hand-picked fill-in-the-
 * missing-letter words instead. Static data only — no logic.
 *
 * `word` is the full correct word; `blankIndex` is the 0-based index (into
 * `word`) of the letter to blank out when displaying the puzzle. The
 * station computes the display string and the correct letter itself from
 * `word` + `blankIndex` — this file never pre-splits the string.
 *
 * @typedef {{id: string, word: string, blankIndex: number, emoji: string}} WordBuildingEntry
 */

/** @type {WordBuildingEntry[]} */
export const WORD_BUILDING_WORDS = Object.freeze([
  { id: 'sefer', word: 'ספר', blankIndex: 1, emoji: '📖' }, // ס_ר -> פ
  { id: 'bayit', word: 'בית', blankIndex: 1, emoji: '🏠' }, // ב_ת -> י
  { id: 'halav', word: 'חלב', blankIndex: 1, emoji: '🥛' }, // ח_ב -> ל
  { id: 'dvash', word: 'דבש', blankIndex: 1, emoji: '🍯' }, // ד_ש -> ב
  { id: 'shemesh', word: 'שמש', blankIndex: 1, emoji: '☀️' }, // ש_ש -> מ
  { id: 'yareach', word: 'ירח', blankIndex: 1, emoji: '🌙' }, // י_ח -> ר
  { id: 'tapuach', word: 'תפוח', blankIndex: 3, emoji: '🍎' }, // תפו_ -> ח
  { id: 'glida', word: 'גלידה', blankIndex: 3, emoji: '🍦' }, // גלי_ה -> ד
  { id: 'mitriya', word: 'מטריה', blankIndex: 1, emoji: '☂️' }, // מ_ריה -> ט
  { id: 'kadur', word: 'כדור', blankIndex: 1, emoji: '⚽' }, // כ_ור -> ד
  { id: 'uga', word: 'עוגה', blankIndex: 2, emoji: '🎂' }, // עו_ה -> ג
  { id: 'delet', word: 'דלת', blankIndex: 1, emoji: '🚪' }, // ד_ת -> ל
  { id: 'chalon', word: 'חלון', blankIndex: 1, emoji: '🪟' }, // ח_ון -> ל
  { id: 'perach', word: 'פרח', blankIndex: 1, emoji: '🌸' }, // פ_ח -> ר
  { id: 'anan', word: 'ענן', blankIndex: 1, emoji: '☁️' }, // ע_ן -> נ
  { id: 'dag', word: 'דג', blankIndex: 0, emoji: '🐟' }, // _ג -> ד
]);
