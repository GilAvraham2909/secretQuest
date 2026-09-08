/**
 * @file stationRegistry.js
 * Maps a learning categoryKey to its real station screen module
 * ({ mount, unmount }). All 7 categories now have real Stage 2 stations
 * registered here — none fall through to the default
 * PlaceholderStationScreen any more. (See PlaceholderStationScreen.js's
 * delegation call for how a registered screen reaches
 * profileManager/soundManager/screenManager.)
 */
import { CategoryKeys } from '../learning/categories.js';
import { LettersStation } from '../screens/station/letters/LettersStation.js';
import { PhonologyStation } from '../screens/station/phonology/PhonologyStation.js';
import { WordBuildingStation } from '../screens/station/syllables-words/WordBuildingStation.js';
import { ArithmeticStation } from '../screens/station/arithmetic/ArithmeticStation.js';
import { GeometryStation } from '../screens/station/geometry/GeometryStation.js';
import { MultiplicationPrepStation } from '../screens/station/multiplication-prep/MultiplicationPrepStation.js';
import { ReadingComprehensionStation } from '../screens/station/reading-comprehension/ReadingComprehensionStation.js';

/** @type {Object<string, {mount: Function, unmount?: Function}|undefined>} */
export const stationRegistry = {
  [CategoryKeys.LETTERS]: LettersStation,
  [CategoryKeys.PHONOLOGY]: PhonologyStation,
  [CategoryKeys.SYLLABLES_WORDS]: WordBuildingStation,
  [CategoryKeys.ARITHMETIC]: ArithmeticStation,
  [CategoryKeys.GEOMETRY]: GeometryStation,
  [CategoryKeys.MULTIPLICATION_PREP]: MultiplicationPrepStation,
  [CategoryKeys.READING_COMPREHENSION]: ReadingComprehensionStation,
};

/**
 * @param {string} categoryKey
 * @returns {{mount: Function, unmount?: Function}|undefined} the real screen module, or undefined if none built yet
 */
export function getRegisteredStationScreen(categoryKey) {
  return stationRegistry[categoryKey];
}
