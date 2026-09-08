/**
 * @file categories.js
 * The 7 learning categories tracked by the adaptive progress matrix.
 * Used by core/data/schema.js (to initialize profile.progress) and by
 * world-map/stations.js (one station per category).
 */
export const CategoryKeys = Object.freeze({
  LETTERS: 'letters',
  PHONOLOGY: 'phonology',
  SYLLABLES_WORDS: 'syllablesWords',
  ARITHMETIC: 'arithmetic',
  GEOMETRY: 'geometry',
  MULTIPLICATION_PREP: 'multiplicationPrep',
  READING_COMPREHENSION: 'readingComprehension',
});

/** @type {string[]} */
export const ALL_CATEGORY_KEYS = Object.freeze(Object.values(CategoryKeys));

/** Hebrew display labels per category key. */
export const CategoryLabelsHe = Object.freeze({
  [CategoryKeys.LETTERS]: 'אותיות',
  [CategoryKeys.PHONOLOGY]: 'צלילים',
  [CategoryKeys.SYLLABLES_WORDS]: 'הברות ומילים',
  [CategoryKeys.ARITHMETIC]: 'חשבון',
  [CategoryKeys.GEOMETRY]: 'צורות',
  [CategoryKeys.MULTIPLICATION_PREP]: 'הכנה לכפל',
  [CategoryKeys.READING_COMPREHENSION]: 'הבנת הנקרא',
});
