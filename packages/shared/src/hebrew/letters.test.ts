import { describe, it, expect } from 'vitest';
import { LETTERS, LETTERS_BY_ID, NIQQUD_COMBOS } from './letters.js';
import {
  DAGESH, SHIN_DOT, PATAH, QAMATS, MEM, BET, SHIN,
  isCombiningMark, toClusters,
} from './codepoints.js';

/**
 * This is the highest-priority test in the project.
 *
 * The design review flagged niqqud rendering as step 1 of the build order: if
 * mark positioning is wrong, every screen built on top of it is wasted work.
 * Rendering correctness ultimately needs human eyes on a real device — but
 * ordering is mechanically checkable, and wrong ordering is the single most
 * likely cause of wrong rendering.
 */

const VOWELS = [PATAH, QAMATS, 'ִ', 'ֵ', 'ֶ', 'ֹ', 'ֻ'];

describe('MVP letter set', () => {
  it('has exactly the 8 letters spec 1.4 allows', () => {
    expect(LETTERS).toHaveLength(8);
    expect(LETTERS.map((l) => l.letterId).sort()).toEqual(
      ['alef', 'bet', 'dalet', 'gimel', 'lamed', 'mem', 'resh', 'shin'],
    );
  });

  it('gives every letter an unpointed tap glyph', () => {
    // The glyph a child taps carries no marks — only the NAME is pointed.
    for (const l of LETTERS) {
      expect(l.glyph).toHaveLength(1);
      expect([...l.glyph].some(isCombiningMark)).toBe(false);
    }
  });

  it('starts every pointed name with its own base letter', () => {
    for (const l of LETTERS) {
      expect(l.nameHe.startsWith(l.glyph)).toBe(true);
    }
  });

  it('treats alef as having no full consonant sound (spec 1.5)', () => {
    expect(LETTERS_BY_ID.alef.baseSound).toBeNull();
    // Every other letter must have one, or letter-sound tasks cannot be built.
    for (const l of LETTERS) {
      if (l.letterId !== 'alef') expect(l.baseSound).toBeTruthy();
    }
  });
});

describe('combining-mark ordering', () => {
  it('never places a vowel before a dagesh or shin-dot', () => {
    // Renderers expect [base][dagesh/shin-dot][vowel]. A vowel appearing
    // before a body point is the classic cause of colliding marks.
    const bodyPoints = [DAGESH, SHIN_DOT, 'ׂ'];
    const all = [...LETTERS.map((l) => l.nameHe), ...NIQQUD_COMBOS.map((c) => c.glyph)];

    for (const text of all) {
      for (const cluster of toClusters(text)) {
        const marks = [...cluster].filter(isCombiningMark);
        const firstVowel = marks.findIndex((m) => VOWELS.includes(m));
        const lastBody = marks.map((m) => bodyPoints.includes(m)).lastIndexOf(true);
        if (firstVowel !== -1 && lastBody !== -1) {
          expect(
            lastBody,
            `vowel precedes body point in cluster of "${text}"`,
          ).toBeLessThan(firstVowel);
        }
      }
    }
  });

  it('keeps each base letter with its marks in one cluster', () => {
    // מַ is one cluster of two code points, not two clusters.
    const mePatah = MEM + PATAH;
    expect(toClusters(mePatah)).toEqual([mePatah]);
  });
});

describe('NFC normalization is destructive here', () => {
  it('reorders bet+dagesh+qamats, which is why .normalize() is banned', () => {
    const correct = BET + DAGESH + QAMATS; // בָּ as a renderer wants it
    const normalized = correct.normalize('NFC');

    // Guard the assumption itself: if a future Node/ICU stops reordering,
    // this test tells us the ban can be revisited rather than silently rotting.
    expect(normalized).not.toBe(correct);
    expect(normalized.indexOf(QAMATS)).toBeLessThan(normalized.indexOf(DAGESH));
  });

  it('leaves no reorder-sensitive combo already in a normalized (broken) form', () => {
    // NFC only reorders when ONE cluster carries both a body point and a
    // vowel. שׁוּ is the instructive counter-example: its shin-dot sits on the
    // shin and its dagesh sits on the vav, so no cluster holds two marks and
    // NFC is a harmless no-op there. Asserting "every combo changes under NFC"
    // would therefore be wrong — the invariant is narrower than that.
    const bodyPoints = [DAGESH, SHIN_DOT, 'ׂ'];
    let checked = 0;

    for (const c of NIQQUD_COMBOS) {
      for (const cluster of toClusters(c.glyph)) {
        const marks = [...cluster].filter(isCombiningMark);
        const hasBody = marks.some((m) => bodyPoints.includes(m));
        const hasVowel = marks.some((m) => VOWELS.includes(m));
        if (hasBody && hasVowel) {
          checked += 1;
          expect(cluster, `${c.contentId} cluster is pre-normalized`).not.toBe(
            cluster.normalize('NFC'),
          );
        }
      }
    }

    // Guard against the check silently matching nothing.
    expect(checked).toBeGreaterThan(0);
  });
});

describe('niqqud combination bank', () => {
  it('covers the 7 letters of spec 9.3 in both taught marks', () => {
    const taught = NIQQUD_COMBOS.filter((c) => c.isTargetEligible);
    expect(taught).toHaveLength(14); // 7 letters x patah + qamats
    for (const mark of ['patah', 'qamats'] as const) {
      expect(taught.filter((c) => c.mark === mark)).toHaveLength(7);
    }
  });

  it('includes every distractor spec 9.4 presents, marked ineligible', () => {
    const required = [
      'niqqud_combo:mem_hiriq', 'niqqud_combo:mem_holam',
      'niqqud_combo:shin_hiriq', 'niqqud_combo:shin_shuruq',
      'niqqud_combo:dalet_hiriq', 'niqqud_combo:dalet_qubuts',
      'niqqud_combo:resh_tsere', 'niqqud_combo:resh_holam',
      'niqqud_combo:bet_hiriq', 'niqqud_combo:bet_holam',
    ];
    for (const id of required) {
      const combo = NIQQUD_COMBOS.find((c) => c.contentId === id);
      expect(combo, `missing distractor ${id}`).toBeDefined();
      // Spec 1.3 #7: only patah/qamats are taught. These exist to be wrong.
      expect(combo!.isTargetEligible).toBe(false);
    }
  });

  it('makes patah and qamats visually distinct for every letter', () => {
    // If these ever collide, the entire niqqud skill is untestable.
    const letters = new Set(NIQQUD_COMBOS.map((c) => c.letterId));
    for (const letterId of letters) {
      const p = NIQQUD_COMBOS.find((c) => c.letterId === letterId && c.mark === 'patah');
      const q = NIQQUD_COMBOS.find((c) => c.letterId === letterId && c.mark === 'qamats');
      if (p && q) expect(p.glyph).not.toBe(q.glyph);
    }
  });

  it('gives shin its shin-dot in every combination', () => {
    for (const c of NIQQUD_COMBOS.filter((c) => c.letterId === 'shin')) {
      expect(c.glyph.startsWith(SHIN + SHIN_DOT)).toBe(true);
    }
  });

  it('uses unique content ids', () => {
    const ids = NIQQUD_COMBOS.map((c) => c.contentId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
