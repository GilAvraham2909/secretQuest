/**
 * @file AvatarCatalog.js
 * The 6 base avatar options offered at profile creation. No real art
 * assets exist yet, so each entry also carries a fallbackEmoji — UI code
 * renders an <img> and swaps to the emoji (in a colored circle) on error,
 * so the picker works fully today and upgrades automatically the moment
 * real PNGs land at the given imagePath.
 * @typedef {{id: string, imagePath: string, labelHe: string, fallbackEmoji: string}} AvatarOption
 */
import { createElement, createImageWithFallback } from '../utils/dom.js';
import { ACCESSORY_ITEMS } from '../rewards/rewardCatalog.js';

/** @type {AvatarOption[]} */
export const AvatarCatalog = Object.freeze([
  { id: 'avatar-01', imagePath: 'assets/images/avatars/avatar-01.png', labelHe: 'נור', fallbackEmoji: '🧒🏻' },
  { id: 'avatar-02', imagePath: 'assets/images/avatars/avatar-02.png', labelHe: 'תום', fallbackEmoji: '🧒🏽' },
  { id: 'avatar-03', imagePath: 'assets/images/avatars/avatar-03.png', labelHe: 'מאיה', fallbackEmoji: '👧🏻' },
  { id: 'avatar-04', imagePath: 'assets/images/avatars/avatar-04.png', labelHe: 'איתן', fallbackEmoji: '👦🏿' },
  { id: 'avatar-05', imagePath: 'assets/images/avatars/avatar-05.png', labelHe: 'הילה', fallbackEmoji: '👧🏽' },
  { id: 'avatar-06', imagePath: 'assets/images/avatars/avatar-06.png', labelHe: 'דניאל', fallbackEmoji: '👦🏻' },
]);

/** @param {string} avatarId @returns {AvatarOption|undefined} */
export function getAvatarById(avatarId) {
  return AvatarCatalog.find((a) => a.id === avatarId);
}

/**
 * Where a "dressed" character portrait lives for a given avatar+outfit
 * combination — a real image generated per (avatarId, outfitId) pair
 * (24 total: 6 avatars × 4 outfits), not a layered/composited overlay.
 * @param {string} avatarId
 * @param {string} outfitId
 * @returns {string}
 */
export function getDressedAvatarImagePath(avatarId, outfitId) {
  return `assets/images/avatars/outfits/${avatarId}_${outfitId}.png`;
}

/**
 * Builds the ordered image-source chain for rendering a profile's avatar
 * with `createImageWithFallback` (js/utils/dom.js): the outfit-specific
 * dressed portrait first if an outfit is equipped, falling back to the
 * plain base avatar, with the emoji fallback handled by the caller as
 * always. Centralizing this means every screen that shows a profile's
 * avatar (world map HUD/figure, My World, profile-select cards) picks up
 * equipped-outfit art consistently without duplicating the fallback logic.
 * @param {{avatarId: string, appearance?: {outfitId?: string|null}}|null|undefined} profile
 * @returns {{src: string, fallbackSrcs: string[], emoji: string}}
 */
export function getAvatarImageSources(profile) {
  const avatar = getAvatarById(profile?.avatarId);
  const baseSrc = avatar?.imagePath ?? '';
  const emoji = avatar?.fallbackEmoji ?? '🙂';
  const outfitId = profile?.appearance?.outfitId;

  if (outfitId && avatar) {
    return { src: getDressedAvatarImagePath(avatar.id, outfitId), fallbackSrcs: [baseSrc], emoji };
  }
  return { src: baseSrc, fallbackSrcs: [], emoji };
}

/**
 * Per-avatar vertical calibration for accessory overlays (inset-block-start
 * percentages, keyed by avatarId then by slot). The 6 base avatar portraits
 * are NOT drawn to a consistent head-to-canvas ratio — 5 are full-body
 * shots with the head occupying roughly the top third of a square 1024px
 * canvas, one (avatar-04) is a close-up head-and-shoulders shot — so a
 * single shared percentage set left accessories floating visibly away from
 * the head on most avatars. Values below were measured per avatar:
 * hairline top detected programmatically (first non-near-white pixel
 * scanning down the image's vertical center column), eye level and
 * neckline estimated visually against that reference (automated dark-pixel
 * scans for eye level proved unreliable on the darker-haired avatars, which
 * have enough near-black hair pixels to swamp the actual eye pupils).
 * AVERAGE_ACCESSORY_POSITION is the fallback for any avatarId not listed
 * here. Known remaining gap: the 24 outfit-dressed portraits
 * (getDressedAvatarImagePath) are independent generations and can drift in
 * framing/scale from their base avatar (already noted elsewhere as a
 * hair-color drift too) — this calibration targets the base avatar images,
 * the dominant case, not every dressed variant individually.
 */
const ACCESSORY_POSITION_BY_AVATAR = {
  'avatar-01': { hat: 12, glasses: 42, wings: 63, scarf: 66 },
  'avatar-02': { hat: 6, glasses: 42, wings: 63, scarf: 66 },
  'avatar-03': { hat: 4, glasses: 41, wings: 63, scarf: 66 },
  'avatar-04': { hat: 4, glasses: 46, wings: 66, scarf: 69 },
  'avatar-05': { hat: 7, glasses: 37, wings: 55, scarf: 58 },
  'avatar-06': { hat: 13, glasses: 42, wings: 61, scarf: 64 },
};
const AVERAGE_ACCESSORY_POSITION = { hat: 8, glasses: 42, wings: 62, scarf: 65 };

/**
 * Builds small positioned emoji-overlay elements for a profile's currently
 * equipped accessories (hat/glasses/wings/scarf), meant to be appended
 * on top of the <img> produced by createImageWithFallback() inside the
 * same `.avatar` wrapper. Unlike outfits (which swap to a whole different
 * pre-generated character image), accessories use simple positioned emoji
 * overlays — pre-generating every outfit×accessory×slot combination would
 * need hundreds of images, and there's no image-layering/inpainting
 * capability available, only one-shot text-to-image generation. This
 * approach works for any number of simultaneously-equipped accessories
 * (up to all 4 slots) with zero combinatorial explosion, since each is
 * just an independently-positioned small element, not a full image swap.
 * Horizontal centering/rotation/sizing lives in
 * css/components/avatar-accessory.css (keyed off the
 * `avatar-accessory--{slotKey}` class); vertical position is set here per
 * avatar via inline style (see ACCESSORY_POSITION_BY_AVATAR above), which
 * — being inline — always overrides the CSS file's block-start rules
 * regardless of specificity.
 * @param {{avatarId?: string, appearance?: {accessorySlots?: Object<string, string|null>}}|null|undefined} profile
 * @returns {HTMLElement[]} zero or more <span> overlay elements, one per equipped slot
 */
export function buildAccessoryOverlays(profile) {
  const slots = profile?.appearance?.accessorySlots ?? {};
  const positions = ACCESSORY_POSITION_BY_AVATAR[profile?.avatarId] ?? AVERAGE_ACCESSORY_POSITION;
  const overlays = [];

  for (const [slotKey, itemId] of Object.entries(slots)) {
    if (!itemId) continue;
    const item = ACCESSORY_ITEMS.find((a) => a.id === itemId);
    if (!item) continue;
    const el = createImageWithFallback({
      src: `assets/images/accessories/${item.id}.png`,
      alt: '',
      emoji: item.fallbackEmoji,
      wrapperClass: `avatar-accessory avatar-accessory--${slotKey}`,
    });
    el.setAttribute('aria-hidden', 'true');
    const topPct = positions[slotKey];
    if (topPct !== undefined) {
      el.style.insetBlockStart = `${topPct}%`;
    }
    overlays.push(el);
  }

  return overlays;
}
