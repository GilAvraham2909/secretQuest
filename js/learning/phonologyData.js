/**
 * @file phonologyData.js
 * The 21-word bank used by the phonology station ("צלילים") — "which word
 * starts with this sound?" Every word has a DISTINCT first letter, so any
 * two bank entries are always unambiguous as target vs. distractor. Static
 * data only — no logic.
 * @typedef {{id: string, word: string, firstLetterName: string, emoji: string}} PhonologyEntry
 */

/** @type {PhonologyEntry[]} */
export const PHONOLOGY_WORDS = Object.freeze([
  { id: 'arye', word: 'אריה', firstLetterName: 'אָלֶף', emoji: '🦁' },
  { id: 'bayit', word: 'בית', firstLetterName: 'בֵּית', emoji: '🏠' },
  { id: 'gezer', word: 'גזר', firstLetterName: 'גִּימֶל', emoji: '🥕' },
  { id: 'dag', word: 'דג', firstLetterName: 'דָּלֶת', emoji: '🐟' },
  { id: 'har', word: 'הר', firstLetterName: 'הֵא', emoji: '⛰️' },
  { id: 'zebra', word: 'זברה', firstLetterName: 'זַיִן', emoji: '🦓' },
  { id: 'chatul', word: 'חתול', firstLetterName: 'חֵית', emoji: '🐈' },
  { id: 'telefon', word: 'טלפון', firstLetterName: 'טֵית', emoji: '📞' },
  { id: 'yareach', word: 'ירח', firstLetterName: 'יוֹד', emoji: '🌙' },
  { id: 'kelev', word: 'כלב', firstLetterName: 'כַּף', emoji: '🐕' },
  { id: 'lev', word: 'לב', firstLetterName: 'לָמֶד', emoji: '❤️' },
  { id: 'melech', word: 'מלך', firstLetterName: 'מֵם', emoji: '👑' },
  { id: 'namer', word: 'נמר', firstLetterName: 'נוּן', emoji: '🐅' },
  { id: 'sefer', word: 'ספר', firstLetterName: 'סָמֶךְ', emoji: '📖' },
  { id: 'etz', word: 'עץ', firstLetterName: 'עַיִן', emoji: '🌳' },
  { id: 'pil', word: 'פיל', firstLetterName: 'פֵּא', emoji: '🐘' },
  { id: 'tsipor', word: 'ציפור', firstLetterName: 'צָדִי', emoji: '🐦' },
  { id: 'kof', word: 'קוף', firstLetterName: 'קוֹף', emoji: '🐒' },
  { id: 'rakevet', word: 'רכבת', firstLetterName: 'רֵישׁ', emoji: '🚂' },
  { id: 'shemesh', word: 'שמש', firstLetterName: 'שִׁין', emoji: '☀️' },
  { id: 'tapuach', word: 'תפוח', firstLetterName: 'תָּו', emoji: '🍎' },
]);
