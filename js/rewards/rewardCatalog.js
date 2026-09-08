/**
 * @file rewardCatalog.js
 * Reward family scaffolding. Stage 1 has no real reward items yet — this
 * just defines the enum and the category -> family mapping so
 * ProfileManager.addReward() and future station modules have a stable
 * contract to target.
 */
import { CategoryKeys } from '../learning/categories.js';

/** @enum {string} */
export const RewardFamily = Object.freeze({
  OUTFIT: 'outfit',
  ACCESSORY: 'accessory',
  FURNITURE: 'furniture',
  MAP_THEME: 'mapTheme',
});

/**
 * Which reward family each learning station awards.
 * Reworked per direct user feedback while live-testing: outfits (a full
 * dressed portrait) read as a much more satisfying reward than the
 * accessory emoji-overlay style, so PHONOLOGY/SYLLABLES_WORDS/
 * READING_COMPREHENSION were moved from ACCESSORY to OUTFIT (joining
 * LETTERS) — ACCESSORY_ITEMS is no longer awarded by any station (existing
 * profiles that already own/equipped one keep it; the pool/UI still work,
 * there's just no new path to earn more). MULTIPLICATION_PREP was peeled
 * off FURNITURE to award MAP_THEME instead, per the user's separate ask for
 * "prizes that change the map background" — ARITHMETIC/GEOMETRY still
 * share FURNITURE between just the two of them.
 * @type {Object<string, RewardFamily>}
 */
export const categoryToRewardFamily = Object.freeze({
  [CategoryKeys.LETTERS]: RewardFamily.OUTFIT,
  [CategoryKeys.PHONOLOGY]: RewardFamily.OUTFIT,
  [CategoryKeys.SYLLABLES_WORDS]: RewardFamily.OUTFIT,
  [CategoryKeys.ARITHMETIC]: RewardFamily.FURNITURE,
  [CategoryKeys.GEOMETRY]: RewardFamily.FURNITURE,
  [CategoryKeys.MULTIPLICATION_PREP]: RewardFamily.MAP_THEME,
  [CategoryKeys.READING_COMPREHENSION]: RewardFamily.OUTFIT,
});

/**
 * Outfit reward pool, awarded by the letters station (the first real
 * OUTFIT-family station). A small, warm, kid-friendly wardrobe — more
 * items can be appended here later without touching anything else.
 * @typedef {{id: string, labelHe: string, fallbackEmoji: string}} RewardItem
 * @type {RewardItem[]}
 */
export const OUTFIT_ITEMS = Object.freeze([
  { id: 'outfit-rainbow-shirt', labelHe: 'חולצה צבעונית', fallbackEmoji: '👕' },
  { id: 'outfit-star-cape', labelHe: 'גלימת כוכבים', fallbackEmoji: '🦸' },
  { id: 'outfit-cozy-vest', labelHe: 'אפודה חמימה', fallbackEmoji: '🦺' },
  { id: 'outfit-star-top', labelHe: 'חולצת כוכבים נוצצת', fallbackEmoji: '🌟' },
  { id: 'outfit-astro-suit', labelHe: 'חליפת אסטרונאוט', fallbackEmoji: '🧑‍🚀' },
  { id: 'outfit-explorer-jacket', labelHe: 'מעיל הרפתקאות', fallbackEmoji: '🧥' },
]);

/**
 * Accessory reward pool, awarded by the phonology station (the first real
 * ACCESSORY-family station). Per game.md: כובעים/משקפיים/כנפיים-style
 * items. More can be appended here later without touching anything else.
 * @type {RewardItem[]}
 */
export const ACCESSORY_ITEMS = Object.freeze([
  { id: 'accessory-magic-hat', labelHe: 'כובע קסמים', fallbackEmoji: '🎩' },
  { id: 'accessory-magic-glasses', labelHe: 'משקפי קסם', fallbackEmoji: '👓' },
  { id: 'accessory-wonder-wings', labelHe: 'כנפי פלא', fallbackEmoji: '🪽' },
  { id: 'accessory-sparkly-scarf', labelHe: 'צעיף נוצץ', fallbackEmoji: '🧣' },
]);

/**
 * Furniture reward pool, awarded by the arithmetic station (the first real
 * FURNITURE-family station). Per game.md: חפצים וריהוט לחדר/עולם האישי —
 * objects/furniture for the child's personal room. More can be appended
 * here later without touching anything else.
 * @type {RewardItem[]}
 */
export const FURNITURE_ITEMS = Object.freeze([
  { id: 'furniture-sparkly-bed', labelHe: 'מיטה נוצצת', fallbackEmoji: '🛏️' },
  { id: 'furniture-magic-lamp', labelHe: 'מנורת קסם', fallbackEmoji: '💡' },
  { id: 'furniture-blooming-plant', labelHe: 'עציץ פורח', fallbackEmoji: '🪴' },
  { id: 'furniture-magic-frame', labelHe: 'תמונה קסומה', fallbackEmoji: '🖼️' },
]);

/**
 * Map-background reward pool, awarded by the multiplication-prep station —
 * per the user's ask for "prizes that change the map background". The
 * default day sky (assets/images/ui/map-background.png) is always
 * available and isn't in this pool; each item here is an alternate full-map
 * background the child unlocks and can then choose to equip (My World ->
 * setEquippedMapTheme), which overrides the map's normal random day/
 * twilight A/B pick with their own chosen look.
 * @type {RewardItem[]}
 */
export const MAP_THEME_ITEMS = Object.freeze([
  { id: 'maptheme-twilight', labelHe: 'שמי דמדומים', fallbackEmoji: '🌆', imagePath: 'assets/images/ui/map-background-alt.png' },
  { id: 'maptheme-aurora', labelHe: 'שמי זוהר קסום', fallbackEmoji: '🌌', imagePath: 'assets/images/ui/map-background-aurora.png' },
]);

/**
 * Maps each ACCESSORY_ITEMS id to the appearance.accessorySlots key it
 * occupies when equipped. Used by the "My Character / My World" screen to
 * read/write equipped state via ProfileManager.setEquippedAccessory().
 * @type {Object<string, 'hat'|'glasses'|'wings'|'scarf'>}
 */
export const accessoryIdToSlot = Object.freeze({
  'accessory-magic-hat': 'hat',
  'accessory-magic-glasses': 'glasses',
  'accessory-wonder-wings': 'wings',
  'accessory-sparkly-scarf': 'scarf',
});

/**
 * Picks the next item from a reward pool that a profile hasn't earned yet.
 * @param {RewardItem[]} pool the reward pool to pick from, e.g. OUTFIT_ITEMS or ACCESSORY_ITEMS
 * @param {string[]} ownedIds ids already in the profile's matching inventory bucket
 * @returns {RewardItem|null} the next unowned item, or null once all are owned
 */
export function pickNextReward(pool = [], ownedIds = []) {
  return pool.find((item) => !ownedIds.includes(item.id)) ?? null;
}
