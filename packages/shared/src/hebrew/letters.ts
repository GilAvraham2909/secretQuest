/**
 * The 8 MVP letters (spec 1.4) with their pointed names and base sounds
 * (spec 1.5), plus the niqqud combination bank (spec 9.3) widened to include
 * every distractor that spec 9.4's option lists actually present.
 *
 * Names are assembled from the code-point constants rather than typed as
 * literals, so the mark order stays visible and reviewable in a diff.
 */

import {
  ALEF, BET, GIMEL, DALET, LAMED, MEM, RESH, SHIN, VAV,
  YOD, TAV, FINAL_MEM, FINAL_NUN, FINAL_PE,
  DAGESH, SHIN_DOT,
  HIRIQ, TSERE, SEGOL, PATAH, QAMATS, HOLAM, QUBUTS,
} from './codepoints.js';

export type LetterId = 'alef' | 'bet' | 'gimel' | 'dalet' | 'lamed' | 'mem' | 'resh' | 'shin';

export interface LetterDef {
  /** Namespaced content id, per the architecture's ContentId scheme. */
  readonly contentId: `letter:${LetterId}`;
  readonly letterId: LetterId;
  /** The bare glyph a child taps. Never pointed. */
  readonly glyph: string;
  /** The letter's NAME, pointed, per spec 1.5. Spoken and displayed. */
  readonly nameHe: string;
  /**
   * Base consonant sound, per spec 1.5. Alef is deliberately null: the spec
   * lists it as "א / ללא עיצור מלא" — no full consonant — so it is never used
   * as a letter-sound or opening-sound target.
   */
  readonly baseSound: string | null;
}

export const LETTERS: readonly LetterDef[] = [
  {
    contentId: 'letter:alef',
    letterId: 'alef',
    glyph: ALEF,
    // אָלֶף
    nameHe: ALEF + QAMATS + LAMED + SEGOL + FINAL_PE,
    baseSound: null,
  },
  {
    contentId: 'letter:bet',
    letterId: 'bet',
    glyph: BET,
    // בֵּית — bet takes a dagesh, which must precede the vowel
    nameHe: BET + DAGESH + TSERE + YOD + TAV,
    baseSound: BET,
  },
  {
    contentId: 'letter:gimel',
    letterId: 'gimel',
    glyph: GIMEL,
    // גִּימֶל
    nameHe: GIMEL + DAGESH + HIRIQ + YOD + MEM + SEGOL + LAMED,
    baseSound: GIMEL,
  },
  {
    contentId: 'letter:dalet',
    letterId: 'dalet',
    glyph: DALET,
    // דָּלֶת
    nameHe: DALET + DAGESH + QAMATS + LAMED + SEGOL + TAV,
    baseSound: DALET,
  },
  {
    contentId: 'letter:lamed',
    letterId: 'lamed',
    glyph: LAMED,
    // לָמֶד
    nameHe: LAMED + QAMATS + MEM + SEGOL + DALET,
    baseSound: LAMED,
  },
  {
    contentId: 'letter:mem',
    letterId: 'mem',
    glyph: MEM,
    // מֵם
    nameHe: MEM + TSERE + FINAL_MEM,
    baseSound: MEM,
  },
  {
    contentId: 'letter:resh',
    letterId: 'resh',
    glyph: RESH,
    // רֵישׁ — the final shin carries a shin-dot
    nameHe: RESH + TSERE + YOD + SHIN + SHIN_DOT,
    baseSound: RESH,
  },
  {
    contentId: 'letter:shin',
    letterId: 'shin',
    glyph: SHIN,
    // שִׁין — shin-dot BEFORE the hiriq
    nameHe: SHIN + SHIN_DOT + HIRIQ + YOD + FINAL_NUN,
    baseSound: SHIN,
  },
] as const;

export const LETTERS_BY_ID: Readonly<Record<LetterId, LetterDef>> = Object.freeze(
  Object.fromEntries(LETTERS.map((l) => [l.letterId, l])) as Record<LetterId, LetterDef>,
);

// ─────────────────────────────────────────────────────────────────────────
// Niqqud combinations
// ─────────────────────────────────────────────────────────────────────────

export type NiqqudMark = 'patah' | 'qamats' | 'hiriq' | 'holam' | 'shuruq' | 'tsere' | 'qubuts';

export interface NiqqudComboDef {
  readonly contentId: string;
  readonly letterId: LetterId;
  readonly mark: NiqqudMark;
  readonly glyph: string;
  /**
   * Spec 1.3 #7 / 9.1: the MVP teaches patah and qamats only. Everything else
   * exists purely as a distractor and must never be a task target.
   * The content linter enforces this.
   */
  readonly isTargetEligible: boolean;
}

/** Letters that take a dagesh in these combinations (בּ גּ דּ). */
const TAKES_DAGESH: ReadonlySet<LetterId> = new Set<LetterId>(['bet', 'gimel', 'dalet']);

function buildCombo(letterId: LetterId, mark: NiqqudMark): NiqqudComboDef {
  const letter = LETTERS_BY_ID[letterId];
  let glyph = letter.glyph;

  // ORDER MATTERS: body points first, then the vowel.
  if (letterId === 'shin') glyph += SHIN_DOT;
  if (TAKES_DAGESH.has(letterId)) glyph += DAGESH;

  switch (mark) {
    case 'patah':
      glyph += PATAH;
      break;
    case 'qamats':
      glyph += QAMATS;
      break;
    case 'hiriq':
      glyph += HIRIQ;
      break;
    case 'tsere':
      glyph += TSERE;
      break;
    case 'qubuts':
      glyph += QUBUTS;
      break;
    case 'holam':
      // Holam male: the letter, then vav carrying the holam point.
      glyph += VAV + HOLAM;
      break;
    case 'shuruq':
      // Shuruq: vav with a dagesh dot inside it.
      glyph += VAV + DAGESH;
      break;
  }

  return {
    contentId: `niqqud_combo:${letterId}_${mark}`,
    letterId,
    mark,
    glyph,
    isTargetEligible: mark === 'patah' || mark === 'qamats',
  };
}

/**
 * Spec 9.3 gives patah + qamats for 7 letters. Spec 9.4's rounds additionally
 * present hiriq, holam, shuruq, tsere and qubuts as distractors — so the bank
 * must be wider than 9.3's table or those rounds cannot be built.
 * Per spec 18, every combination here needs its own recording, distractors
 * included.
 */
const COMBO_LETTERS: readonly LetterId[] = ['mem', 'shin', 'dalet', 'resh', 'bet', 'lamed', 'gimel'];

export const NIQQUD_COMBOS: readonly NiqqudComboDef[] = [
  // The taught set (spec 9.3)
  ...COMBO_LETTERS.map((l) => buildCombo(l, 'patah')),
  ...COMBO_LETTERS.map((l) => buildCombo(l, 'qamats')),
  // Distractors required by spec 9.4's option lists
  buildCombo('mem', 'hiriq'), // מִ
  buildCombo('mem', 'holam'), // מוֹ
  buildCombo('shin', 'hiriq'), // שִׁ
  buildCombo('shin', 'shuruq'), // שוּ
  buildCombo('dalet', 'hiriq'), // דִ
  buildCombo('dalet', 'qubuts'), // דֻ
  buildCombo('resh', 'tsere'), // רֵ
  buildCombo('resh', 'holam'), // רוֹ
  buildCombo('bet', 'hiriq'), // בִּ
  buildCombo('bet', 'holam'), // בּוֹ
];
