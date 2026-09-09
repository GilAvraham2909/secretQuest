import { describe, it, expect } from 'vitest';
import { lintContent, type ContentSources } from './lint.js';

/**
 * A linter nobody tests is confidence theatre. These assert that each rule
 * actually fires on the thing it claims to catch — especially the
 * forbidden-phrase rule, which is the one standing between a tired author and
 * telling a five-year-old they failed.
 */

const HEADER =
  'task_id,skill_id,also_evidences,mechanic_id,target_content_id,distractors,option_count,prompt_copy,feedback_correct_copy,feedback_retry_copy,hint1_copy,hint2_copy,simpler_task_id,reward';

const okTask = (id: string, target = 'letter:mem', distractors = 'letter:shin|letter:gimel') =>
  `${id},visual_letter_recognition,,balloon_game,${target},${distractors},3,c.prompt,c.ok,c.retry,c.hint,c.hint,,coin:1`;

const COPY_HEADER = 'copy_id,text_he,audio_ref,tokens,voiced,spec_ref,notes';
const BASE_COPY = [
  COPY_HEADER,
  'c.prompt,"מצא את האות",p.mp3,,TRUE,4.2,',
  'c.ok,"מצאת!",ok.mp3,,TRUE,4.2,',
  'c.retry,"בוא ננסה שוב.",retry.mp3,,TRUE,4.4,',
  'c.hint,"הקשב לצליל.",hint.mp3,,TRUE,4.4,',
].join('\n');

const WORDS = [
  'content_id,text_he,root_letter_id,opening_sound_id,image,audio_word,audio_stretched,in_mvp,spec_ref',
  'word:matara,מטרה,letter:mem,letter_sound:m,m.png,w.mp3,s.mp3,TRUE,8.3',
  'word:dag,דג,letter:dalet,letter_sound:d,d.png,w.mp3,s.mp3,TRUE,8.3',
].join('\n');

const SOUNDS = [
  'content_id,root_letter_id,stretched_he,audio_sound,example_word_id,in_mvp,spec_ref',
  'letter_sound:m,letter:mem,ממממ,s.mp3,word:matara,TRUE,7.3',
].join('\n');

/** Five balloon tasks so the min-tasks-per-mechanic rule is satisfied. */
const FIVE_TASKS = [
  HEADER,
  okTask('BAL-001'),
  okTask('BAL-002', 'letter:shin', 'letter:mem|letter:gimel'),
  okTask('BAL-003', 'letter:gimel', 'letter:mem|letter:shin'),
  okTask('BAL-004', 'letter:resh', 'letter:mem|letter:shin'),
  okTask('BAL-005', 'letter:dalet', 'letter:mem|letter:shin'),
  // 2-option variant satisfies the simpler-task rule
  'BAL-001-S,visual_letter_recognition,,balloon_game,letter:mem,letter:shin,2,c.prompt,c.ok,c.retry,c.hint,c.hint,,coin:1',
].join('\n');

const base = (over: Partial<ContentSources> = {}): ContentSources => ({
  tasksCsv: FIVE_TASKS,
  copyCsv: BASE_COPY,
  wordsCsv: WORDS,
  letterSoundsCsv: SOUNDS,
  forbiddenPhrases: 'טעית\nלא נכון\nparent:חלש',
  ...over,
});

const rules = (src: ContentSources) =>
  lintContent(src).diagnostics.filter((d) => d.severity === 'error').map((d) => d.rule);

describe('the linter accepts valid content', () => {
  it('reports no errors on a well-formed set', () => {
    const r = lintContent(base());
    expect(r.errorCount, JSON.stringify(r.diagnostics, null, 2)).toBe(0);
  });
});

describe('spec 21: forbidden phrases (the rule that matters most)', () => {
  it('rejects telling a child they were wrong', () => {
    const copy = BASE_COPY.replace('"בוא ננסה שוב."', '"טעית. נסה שוב."');
    expect(rules(base({ copyCsv: copy }))).toContain('forbidden-phrase');
  });

  it('rejects deficit language on the parent screen', () => {
    const copy = `${BASE_COPY}\nparent.note,"הילד חלש באותיות",,,FALSE,14.3,`;
    expect(rules(base({ copyCsv: copy }))).toContain('forbidden-phrase');
  });

  it('allows parent-only banned words in child copy scope', () => {
    // "חלש" is banned for the parent screen but is not a §21 child-facing ban,
    // so it must not fire on a non-parent line. Guards over-blocking.
    const copy = `${BASE_COPY}\nc.other,"אור חלש מהפנס",o.mp3,,TRUE,20,`;
    expect(rules(base({ copyCsv: copy }))).not.toContain('forbidden-phrase');
  });
});

describe('spec 1.6: spoken lines must be pre-recordable', () => {
  it('rejects speaking the child name', () => {
    const copy = `${BASE_COPY}\nc.hello,"שלום {{child_name}}",h.mp3,child_name,TRUE,2.2,`;
    expect(rules(base({ copyCsv: copy }))).toContain('open-set-token-in-speech');
  });

  it('allows the child name in text that is never spoken', () => {
    const copy = `${BASE_COPY}\nc.hello,"שלום {{child_name}}",,child_name,FALSE,2.2,`;
    expect(rules(base({ copyCsv: copy }))).not.toContain('open-set-token-in-speech');
  });

  it('allows closed-set tokens in speech', () => {
    const copy = `${BASE_COPY}\nc.named,"האות {{letter_name}}",n.mp3,letter_name,TRUE,4.2,`;
    expect(rules(base({ copyCsv: copy }))).not.toContain('open-set-token-in-speech');
  });

  it('rejects a voiced line with no recording', () => {
    const copy = `${BASE_COPY}\nc.silent,"משהו",,,TRUE,20,`;
    expect(rules(base({ copyCsv: copy }))).toContain('voiced-needs-audio');
  });
});

describe('referential integrity', () => {
  it('catches an unknown target', () => {
    const tasks = FIVE_TASKS.replace('letter:resh', 'letter:zayin');
    expect(rules(base({ tasksCsv: tasks }))).toContain('ref-integrity');
  });

  it('catches a copy id that does not exist', () => {
    const tasks = FIVE_TASKS.replace('c.hint,c.hint,,coin:1', 'c.nope,c.hint,,coin:1');
    expect(rules(base({ tasksCsv: tasks }))).toContain('ref-integrity');
  });
});

describe('spec 18: content completeness', () => {
  it('requires at least five tasks per mechanic', () => {
    const tasks = [HEADER, okTask('BAL-001'), okTask('BAL-002', 'letter:shin')].join('\n');
    expect(rules(base({ tasksCsv: tasks }))).toContain('min-tasks-per-mechanic');
  });

  it('requires a voice instruction on every task', () => {
    const copy = BASE_COPY.replace('c.prompt,"מצא את האות",p.mp3', 'c.prompt,"מצא את האות",');
    expect(rules(base({ copyCsv: copy }))).toContain('voice-instruction-required');
  });
});

describe('spec 1.3 #7: MVP scope guard', () => {
  it('rejects a distractor-only niqqud combination used as a target', () => {
    const tasks = [
      HEADER,
      'NIK-001,niqqud_combination_recognition,,match_game,niqqud_combo:mem_hiriq,niqqud_combo:mem_patah,2,c.prompt,c.ok,c.retry,c.hint,c.hint,,coin:1',
    ].join('\n');
    expect(rules(base({ tasksCsv: tasks }))).toContain('distractor-as-target');
  });

  it('rejects asking a child to tell patah from qamats by sound', () => {
    // The MVP explicitly does not teach this discrimination (spec 9.1).
    const tasks = [
      HEADER,
      'NIK-X,niqqud_combination_recognition,,match_game,niqqud_combo:mem_patah,niqqud_combo:mem_qamats,2,c.prompt,c.ok,c.retry,c.hint,c.hint,,coin:1',
    ].join('\n');
    expect(rules(base({ tasksCsv: tasks }))).toContain('patah-vs-qamats');
  });
});

describe('distractor sanity', () => {
  it('catches a target listed among its own distractors', () => {
    const tasks = FIVE_TASKS.replace(
      'balloon_game,letter:mem,letter:shin|letter:gimel',
      'balloon_game,letter:mem,letter:mem|letter:gimel',
    );
    expect(rules(base({ tasksCsv: tasks }))).toContain('distractor-sanity');
  });

  it('catches an opening-sound round with two right answers', () => {
    // A distractor starting with the same sound makes the round unanswerable —
    // and silently makes the collected data meaningless.
    const words = [
      'content_id,text_he,root_letter_id,opening_sound_id,image,audio_word,audio_stretched,in_mvp,spec_ref',
      'word:matara,מטרה,letter:mem,letter_sound:m,m.png,w.mp3,s.mp3,TRUE,8.3',
      'word:mikbat,מקבת,letter:mem,letter_sound:m,mk.png,w.mp3,s.mp3,TRUE,8.3',
    ].join('\n');
    const tasks = [
      HEADER,
      'PHO-1,opening_sound_recognition,,match_game,word:matara,word:mikbat,2,c.prompt,c.ok,c.retry,c.hint,c.hint,,coin:1',
    ].join('\n');
    expect(rules(base({ tasksCsv: tasks, wordsCsv: words }))).toContain('ambiguous-distractor');
  });
});

describe('niqqud ordering in hand-authored CSV', () => {
  it('catches a vowel typed before its dagesh', () => {
    // This is what NFC produces, and it is invisible in a spreadsheet — the
    // exact bug this rule caught on the first real authoring pass.
    const bad = 'ב' + 'ָ' + 'ּ'; // bet + qamats + dagesh — wrong order
    const words = [
      'content_id,text_he,root_letter_id,opening_sound_id,image,audio_word,audio_stretched,in_mvp,spec_ref',
      `word:test,${bad},letter:bet,letter_sound:b,t.png,w.mp3,s.mp3,TRUE,8.3`,
    ].join('\n');
    expect(rules(base({ wordsCsv: words }))).toContain('niqqud-order');
  });

  it('accepts the correct order', () => {
    const good = 'ב' + 'ּ' + 'ָ'; // bet + dagesh + qamats
    const words = [
      'content_id,text_he,root_letter_id,opening_sound_id,image,audio_word,audio_stretched,in_mvp,spec_ref',
      `word:test,${good},letter:bet,letter_sound:b,t.png,w.mp3,s.mp3,TRUE,8.3`,
    ].join('\n');
    expect(rules(base({ wordsCsv: words }))).not.toContain('niqqud-order');
  });
});

describe('the missing-audio list doubles as a recording work-order', () => {
  it('reports absent clips as warnings, not errors', () => {
    const r = lintContent(base({ availableAssets: [] }));
    expect(r.errorCount).toBe(0);
    expect(r.stats.missingAudio).toBeGreaterThan(0);
    expect(r.diagnostics.some((d) => d.rule === 'missing-audio' && d.severity === 'warning')).toBe(true);
  });

  it('shrinks as recordings land', () => {
    const withSome = lintContent(base({ availableAssets: ['p.mp3', 'ok.mp3'] }));
    const withNone = lintContent(base({ availableAssets: [] }));
    expect(withSome.stats.missingAudio).toBeLessThan(withNone.stats.missingAudio);
  });
});
