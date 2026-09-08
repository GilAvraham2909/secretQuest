/**
 * @file lettersData.js
 * The 22 base Hebrew letters (no final/sofit forms) used by the letters
 * station. Static data only — no logic.
 * @typedef {{id: string, char: string, nameHe: string}} LetterEntry
 */

/** @type {LetterEntry[]} */
export const LETTERS = Object.freeze([
  { id: 'alef', char: 'א', nameHe: 'אָלֶף' },
  { id: 'bet', char: 'ב', nameHe: 'בֵּית' },
  { id: 'gimel', char: 'ג', nameHe: 'גִּימֶל' },
  { id: 'dalet', char: 'ד', nameHe: 'דָּלֶת' },
  { id: 'he', char: 'ה', nameHe: 'הֵא' },
  { id: 'vav', char: 'ו', nameHe: 'וָו' },
  { id: 'zayin', char: 'ז', nameHe: 'זַיִן' },
  { id: 'het', char: 'ח', nameHe: 'חֵית' },
  { id: 'tet', char: 'ט', nameHe: 'טֵית' },
  { id: 'yod', char: 'י', nameHe: 'יוֹד' },
  { id: 'kaf', char: 'כ', nameHe: 'כַּף' },
  { id: 'lamed', char: 'ל', nameHe: 'לָמֶד' },
  { id: 'mem', char: 'מ', nameHe: 'מֵם' },
  { id: 'nun', char: 'נ', nameHe: 'נוּן' },
  { id: 'samekh', char: 'ס', nameHe: 'סָמֶךְ' },
  { id: 'ayin', char: 'ע', nameHe: 'עַיִן' },
  { id: 'pe', char: 'פ', nameHe: 'פֵּא' },
  { id: 'tsadi', char: 'צ', nameHe: 'צָדִי' },
  { id: 'qof', char: 'ק', nameHe: 'קוֹף' },
  { id: 'resh', char: 'ר', nameHe: 'רֵישׁ' },
  { id: 'shin', char: 'ש', nameHe: 'שִׁין' },
  { id: 'tav', char: 'ת', nameHe: 'תָּו' },
]);
