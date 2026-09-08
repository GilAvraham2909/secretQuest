/**
 * @file stations.js
 * Static catalog of the 7 map stations — exactly one per learning category.
 * Positions are spread across a 0-100 x/y percentage grid so nodes don't
 * overlap when rendered over the map background.
 * @typedef {{id: string, categoryKey: string, titleHe: string, imagePath: string, fallbackEmoji: string, mapPosition: {xPercent: number, yPercent: number}, comingSoon: boolean}} Station
 */
import { CategoryKeys, CategoryLabelsHe } from '../learning/categories.js';

/** @type {Station[]} */
export const stations = Object.freeze([
  {
    id: 'station-letters',
    categoryKey: CategoryKeys.LETTERS,
    titleHe: CategoryLabelsHe[CategoryKeys.LETTERS],
    imagePath: 'assets/images/stations/letters.png',
    fallbackEmoji: '🔤',
    mapPosition: { xPercent: 14, yPercent: 22 },
    comingSoon: true,
  },
  {
    id: 'station-phonology',
    categoryKey: CategoryKeys.PHONOLOGY,
    titleHe: CategoryLabelsHe[CategoryKeys.PHONOLOGY],
    imagePath: 'assets/images/stations/phonology.png',
    fallbackEmoji: '👂',
    mapPosition: { xPercent: 32, yPercent: 62 },
    comingSoon: true,
  },
  {
    id: 'station-syllables-words',
    categoryKey: CategoryKeys.SYLLABLES_WORDS,
    titleHe: CategoryLabelsHe[CategoryKeys.SYLLABLES_WORDS],
    imagePath: 'assets/images/stations/syllables-words.png',
    fallbackEmoji: '🚂',
    mapPosition: { xPercent: 50, yPercent: 18 },
    comingSoon: true,
  },
  {
    id: 'station-arithmetic',
    categoryKey: CategoryKeys.ARITHMETIC,
    titleHe: CategoryLabelsHe[CategoryKeys.ARITHMETIC],
    imagePath: 'assets/images/stations/arithmetic.png',
    fallbackEmoji: '🔢',
    mapPosition: { xPercent: 68, yPercent: 55 },
    comingSoon: true,
  },
  {
    id: 'station-geometry',
    categoryKey: CategoryKeys.GEOMETRY,
    titleHe: CategoryLabelsHe[CategoryKeys.GEOMETRY],
    imagePath: 'assets/images/stations/geometry.png',
    fallbackEmoji: '🔺',
    mapPosition: { xPercent: 85, yPercent: 25 },
    comingSoon: true,
  },
  {
    id: 'station-multiplication-prep',
    categoryKey: CategoryKeys.MULTIPLICATION_PREP,
    titleHe: CategoryLabelsHe[CategoryKeys.MULTIPLICATION_PREP],
    imagePath: 'assets/images/stations/multiplication-prep.png',
    fallbackEmoji: '🍬',
    mapPosition: { xPercent: 22, yPercent: 82 },
    comingSoon: true,
  },
  {
    id: 'station-reading-comprehension',
    categoryKey: CategoryKeys.READING_COMPREHENSION,
    titleHe: CategoryLabelsHe[CategoryKeys.READING_COMPREHENSION],
    imagePath: 'assets/images/stations/reading-comprehension.png',
    fallbackEmoji: '📖',
    mapPosition: { xPercent: 60, yPercent: 85 },
    comingSoon: true,
  },
]);

/** @param {string} id @returns {Station|undefined} */
export function getStationById(id) {
  return stations.find((s) => s.id === id);
}
