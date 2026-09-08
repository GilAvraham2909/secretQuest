/**
 * Hebrew code points, written as explicit \u escapes.
 *
 * WHY ESCAPES AND NOT LITERAL GLYPHS
 * ==================================
 * A combining mark is invisible in a source file. `"מַ"` and
 * `"מָ"` look nearly identical in an editor but are different
 * vowels — patah vs qamats — and the whole niqqud skill (spec 1.3 #5) turns on
 * telling them apart. Escapes make the difference reviewable in a diff.
 *
 * ORDERING IS LOAD-BEARING
 * ========================
 * Browsers position marks correctly only when they arrive in this order:
 *
 *     [base letter] [dagesh / shin-dot / sin-dot] [vowel]
 *
 * `בָּ` must be bet + dagesh + qamats. Emit the vowel before the dagesh and the
 * marks stack wrong or collide.
 *
 * NEVER CALL .normalize() ON THESE STRINGS.
 * Unicode NFC reorders combining marks by canonical combining class, which
 * moves the vowel ahead of the dagesh and breaks rendering. There is a unit
 * test asserting exactly this.
 */

// ── Base letters (spec 1.4 — the 8 MVP letters) ──────────────────────────
export const ALEF = 'א'; // א
export const BET = 'ב'; // ב
export const GIMEL = 'ג'; // ג
export const DALET = 'ד'; // ד
export const LAMED = 'ל'; // ל
export const MEM = 'מ'; // מ
export const RESH = 'ר'; // ר
export const SHIN = 'ש'; // ש
export const VAV = 'ו'; // ו — not an MVP letter; used inside holam/shuruq

// Non-MVP letters that still appear INSIDE the MVP letter names of spec 1.5
// (e.g. שִׁין needs yod + final nun). Never used as a task target.
export const YOD = 'י'; // י
export const TAV = 'ת'; // ת
export const FINAL_MEM = 'ם'; // ם
export const FINAL_NUN = 'ן'; // ן
export const FINAL_PE = 'ף'; // ף

// ── Points that attach to the letter body (come FIRST after the base) ────
export const DAGESH = 'ּ'; // בּ  also mapejk/shuruq dot
export const SHIN_DOT = 'ׁ'; // שׁ  upper-right
export const SIN_DOT = 'ׂ'; // שׂ  upper-left

// ── Vowels (come LAST) ───────────────────────────────────────────────────
export const HIRIQ = 'ִ'; // ִ
export const TSERE = 'ֵ'; // ֵ
export const SEGOL = 'ֶ'; // ֶ
export const PATAH = 'ַ'; // ַ   spec 9.3
export const QAMATS = 'ָ'; // ָ   spec 9.3
export const HOLAM = 'ֹ'; // ֹ
export const QUBUTS = 'ֻ'; // ֻ

/** The full inclusive range of Hebrew points, for font-subsetting checks. */
export const HEBREW_BLOCK_START = 0x0590;
export const HEBREW_BLOCK_END = 0x05ff;

/**
 * True if the character is a combining mark that must never be separated from
 * its base letter by a line break, a span boundary, or a font fallback.
 */
export function isCombiningMark(ch: string): boolean {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return false;
  // Points and accents; excludes the letters themselves (05D0-05EA).
  return (cp >= 0x0591 && cp <= 0x05c7) && !(cp >= 0x05d0 && cp <= 0x05ea);
}

/**
 * Splits a pointed string into [base, ...marks] clusters, so a renderer can
 * guarantee a letter and its marks stay in one element.
 */
export function toClusters(text: string): string[] {
  const clusters: string[] = [];
  for (const ch of text) {
    if (clusters.length > 0 && isCombiningMark(ch)) {
      clusters[clusters.length - 1] += ch;
    } else {
      clusters.push(ch);
    }
  }
  return clusters;
}
