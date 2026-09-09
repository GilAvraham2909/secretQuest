import { describe, it, expect } from 'vitest';
import { loadContentPack } from './pack.js';

/**
 * Tests for the content pack — specifically, for copy interpolation.
 *
 * WHY THIS FILE EXISTS
 * ====================
 * The content linter checks the CSVs. It cannot check the resolver that reads
 * them, and that is where three bugs sat undetected: every opening-sound prompt
 * rendered as "מצא את המילה שמתחילה בצליל " with nothing after it, the stretch
 * hint printed a literal {{stretched_sound}}, and the letter-sound hint named
 * the stretched sound where spec 7.4 asks for an example word.
 *
 * All three linted clean, all three typechecked, and none of them was visible,
 * because no mechanic hosted those tasks yet. They would have surfaced as
 * broken copy in front of a child on the day the match mechanic landed.
 *
 * So the assertion below is deliberately blunt and total: EVERY task, EVERY
 * copy line it can show, no unfilled token anywhere. A new task or a new copy
 * row is covered the moment it is authored, without anyone remembering to add
 * a case here.
 */

const pack = loadContentPack();

const COPY_FIELDS = [
  'promptCopyId',
  'feedbackCorrectCopyId',
  'feedbackRetryCopyId',
] as const;

describe('copy interpolation', () => {
  it('leaves no unfilled token in any line any task can show', () => {
    const unfilled: string[] = [];

    for (const task of pack.tasks) {
      const copyIds = [
        ...COPY_FIELDS.map((f) => task[f]),
        ...task.hintCopyIds,
      ];
      for (const copyId of copyIds) {
        const { textHe } = pack.resolver.copy(copyId, task.targetContentId);
        if (textHe.includes('{{')) {
          unfilled.push(`${task.taskId} · ${copyId} → "${textHe}"`);
        }
      }
    }

    expect(unfilled).toEqual([]);
  });

  it('never renders a blank where a value belongs', () => {
    // A blank is worse than a visible token: it reads as finished copy, which
    // is exactly how the opening-sound prompt hid. Detected structurally — a
    // template with a token must come out LONGER than the same template with
    // its tokens deleted, because something real was substituted in.
    const blanks: string[] = [];

    for (const task of pack.tasks) {
      const copyIds = [...COPY_FIELDS.map((f) => task[f]), ...task.hintCopyIds];
      for (const copyId of copyIds) {
        const { textHe } = pack.resolver.copy(copyId, task.targetContentId);
        const template = pack.rawCopyText(copyId) ?? '';
        const tokenCount = [...template.matchAll(/\{\{[^}]+\}\}/g)].length;
        if (tokenCount === 0) continue;

        const stripped = template.replace(/\{\{[^}]+\}\}/g, '').trim();
        if (textHe.length <= stripped.length) {
          blanks.push(`${task.taskId} · ${copyId} → "${textHe}"`);
        }
      }
    }

    expect(blanks).toEqual([]);
  });
});

/**
 * NOTE ON THE EXPECTATIONS BELOW.
 *
 * They are composed from the source data, never retyped as pointed literals.
 * The first draft of this file hand-typed מַטָּרָה and failed against a string
 * that printed identically, because a hand-typed vowel lands in a different
 * order from the CSV's — the same invisible difference the niqqud-order lint
 * rule exists for. Deriving the expected value proves the composition, which is
 * what these lines are actually about, and cannot drift on mark order.
 */
describe('the three lines that were wrong', () => {
  const render = (copyId: string, contentId: string) =>
    pack.resolver.copy(copyId, contentId).textHe;

  const MATARA = pack.resolver.label('word:matara'); // מַטָּרָה, from words.csv
  const MEM_NAME = pack.resolver.label('letter:mem'); // מֵם, from letters.ts
  const STRETCHED_M = pack.resolver.label('letter_sound:m'); // ממממ

  it('names the opening sound in an opening-sound prompt (spec 8.2)', () => {
    // Was: "מצא את המילה שמתחילה בצליל " — the sound silently missing.
    expect(render('pho.prompt.same_start', 'word:matara')).toBe(
      'מצא את המילה שמתחילה בצליל מ',
    );
  });

  it('stretches the opening sound before the word (spec 8.5)', () => {
    // Was: "{{stretched_sound}}… מַטָּרָה" — the token never substituted at all.
    expect(render('hint.stretch_opening', 'word:matara')).toBe(
      `${STRETCHED_M}… ${MATARA}`,
    );
  });

  it('names an example WORD in the letter-sound hint, not the sound (spec 7.4)', () => {
    // Was: "הצליל מתחיל כמו במילה ממממ" — {{word}} read the stretched sound,
    // because it resolved through a generic `label` field.
    const text = render('hint.sound_like_word', 'letter_sound:m');
    expect(text).toBe(`הצליל מתחיל כמו במילה ${MATARA}`);
    expect(text).not.toContain(STRETCHED_M);
  });

  it('keeps the letter tasks working — {{sound}} is the bare consonant', () => {
    // The same field feeds the balloon/fishing/train hint, so the fix above
    // must not have quietly changed what those say.
    expect(render('hint.starts_with_sound', 'letter:mem')).toBe(
      'האות שאנחנו מחפשים מתחילה בצליל מ',
    );
    expect(render('hint.listen_name', 'letter:mem')).toBe(
      `הקשב לשם האות: ${MEM_NAME}`,
    );
  });

  it('renders the niqqud combination itself, marks and all', () => {
    const combo = pack.resolver.glyph('niqqud_combo:mem_patah')!;
    const text = render('nik.ok.found', 'niqqud_combo:mem_patah');
    expect(text).toBe(`מצאת את ${combo}`);
    // The vowel must survive as a combining mark rather than being dropped on
    // the way through — the whole niqqud skill depends on it.
    expect([...combo].length).toBeGreaterThan(1);
  });
});
