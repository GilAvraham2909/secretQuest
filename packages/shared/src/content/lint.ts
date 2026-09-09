import { parseCsv, pipeList, isTrue, extractTokens, type CsvRow } from './csv.js';
import { ALL_MECHANIC_IDS, ALL_SKILL_IDS } from '../domain/ids.js';
import { LETTERS, NIQQUD_COMBOS } from '../hebrew/letters.js';
import { isCombiningMark, toClusters, DAGESH, SHIN_DOT } from '../hebrew/codepoints.js';

/**
 * The content linter.
 *
 * Spec 18 is a list of content acceptance conditions, most of which read as
 * things a careful person would check. Careful people stop being careful at
 * 11pm on a deadline, so every one of them is a rule here and a build failure
 * there.
 *
 * The highest-leverage rule by a distance is the forbidden-phrase scan
 * (rule 6). "Never tell a child they were wrong" is otherwise untestable and
 * degrades the moment somebody writes a well-meaning error message.
 */

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  readonly severity: Severity;
  readonly rule: string;
  readonly file: string;
  readonly line: number | null;
  readonly message: string;
}

export interface ContentSources {
  readonly tasksCsv: string;
  readonly copyCsv: string;
  readonly wordsCsv: string;
  readonly letterSoundsCsv: string;
  readonly forbiddenPhrases: string;
  /** Audio/image files present on disk, for the asset-presence rule. */
  readonly availableAssets?: readonly string[];
  /**
   * Assert the full MVP mechanic set is present. The CLI turns this on; unit
   * fixtures leave it off so they can exercise one mechanic in isolation.
   */
  readonly requireAllMechanics?: boolean;
}

export interface LintResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly errorCount: number;
  readonly warningCount: number;
  readonly stats: {
    readonly tasks: number;
    readonly letters: number;
    readonly words: number;
    readonly combos: number;
    readonly copyLines: number;
    readonly voicedLines: number;
    readonly missingAudio: number;
  };
}

/**
 * Tokens that may appear inside a SPOKEN line. Each names a closed, known-in-
 * advance set, so one whole-sentence recording per value is possible.
 * `child_name` is deliberately absent — spec 1.6.
 */
const CLOSED_SET_TOKENS = new Set([
  'letter_name',
  'letter_glyph',
  'sound',
  'stretched_sound',
  'word',
  'combo',
]);

/**
 * Which tokens a target of each content kind can actually fill.
 *
 * Rule 6b only asks whether a token names a closed set. That is not the same
 * question as whether THIS task's target can supply it, and the gap between the
 * two shipped three broken lines: an opening-sound prompt that rendered as
 * "מצא את המילה שמתחילה בצליל " with nothing after it, a hint that printed a
 * literal {{stretched_sound}}, and a letter-sound hint that named the stretched
 * sound where the spec asks for an example word. All three linted clean and all
 * three were invisible, because no mechanic hosted those tasks yet.
 *
 * This table is the same one the web content pack builds its entries from. If
 * you add a token there, add it here, or the linter stops being evidence.
 */
const TOKENS_BY_CONTENT_KIND: Readonly<Record<string, ReadonlySet<string>>> = {
  letter: new Set(['letter_name', 'letter_glyph', 'sound']),
  letter_sound: new Set(['letter_name', 'letter_glyph', 'sound', 'stretched_sound', 'word']),
  word: new Set(['word', 'letter_name', 'letter_glyph', 'sound', 'stretched_sound']),
  niqqud_combo: new Set(['combo', 'letter_name', 'letter_glyph']),
};

const TASK_COPY_FIELDS = [
  'prompt_copy',
  'feedback_correct_copy',
  'feedback_retry_copy',
  'hint1_copy',
  'hint2_copy',
] as const;

export function lintContent(src: ContentSources): LintResult {
  const diagnostics: Diagnostic[] = [];
  const add = (
    severity: Severity,
    rule: string,
    file: string,
    row: CsvRow | null,
    message: string,
  ) => {
    diagnostics.push({
      severity,
      rule,
      file,
      line: row ? Number(row.__line) : null,
      message,
    });
  };

  const tasks = parseCsv(src.tasksCsv);
  const copy = parseCsv(src.copyCsv);
  const words = parseCsv(src.wordsCsv);
  const sounds = parseCsv(src.letterSoundsCsv);

  const copyById = new Map(copy.map((r) => [r.copy_id!, r]));
  // Widened to string: these ids arrive from a CSV a human edits, so the whole
  // point is to check membership of values the type system cannot vouch for.
  const letterIds = new Set<string>(LETTERS.map((l) => l.contentId));
  const comboById = new Map(NIQQUD_COMBOS.map((c) => [c.contentId, c]));
  const wordIds = new Set(words.map((r) => r.content_id!));
  const soundIds = new Set(sounds.map((r) => r.content_id!));

  const knownContent = new Set([...letterIds, ...comboById.keys(), ...wordIds, ...soundIds]);
  const taskIds = new Set(tasks.map((t) => t.task_id!));

  // ── Rule 1: referential integrity ───────────────────────────────────────
  for (const t of tasks) {
    if (!ALL_SKILL_IDS.includes(t.skill_id as never)) {
      add('error', 'ref-integrity', 'tasks.csv', t, `unknown skill_id "${t.skill_id}"`);
    }
    if (!ALL_MECHANIC_IDS.includes(t.mechanic_id as never)) {
      add('error', 'ref-integrity', 'tasks.csv', t, `unknown mechanic_id "${t.mechanic_id}"`);
    }
    if (!knownContent.has(t.target_content_id!)) {
      add('error', 'ref-integrity', 'tasks.csv', t, `unknown target "${t.target_content_id}"`);
    }
    for (const d of pipeList(t.distractors!)) {
      if (!knownContent.has(d)) {
        add('error', 'ref-integrity', 'tasks.csv', t, `unknown distractor "${d}"`);
      }
    }
    for (const key of ['prompt_copy', 'feedback_correct_copy', 'feedback_retry_copy', 'hint1_copy', 'hint2_copy']) {
      const id = t[key];
      if (id && !copyById.has(id)) {
        add('error', 'ref-integrity', 'tasks.csv', t, `${key} "${id}" not in copy.csv`);
      }
    }
    if (t.simpler_task_id && !taskIds.has(t.simpler_task_id)) {
      add('error', 'ref-integrity', 'tasks.csv', t, `simpler_task_id "${t.simpler_task_id}" does not exist`);
    }
  }

  // ── Rule 2a: spec 18 — a mechanic IN USE needs at least 5 tasks ─────────
  // Counts primary tasks only; the -S scaffolded variants are the ladder's
  // fallback, not content in their own right.
  //
  // Zero tasks means "this mechanic is not authored yet", which is a different
  // thing from "this mechanic is under-specified" — and only the second is a
  // content defect. Completeness of the MVP set is rule 2b, which runs only
  // against the real content.
  for (const m of ALL_MECHANIC_IDS) {
    if (m === 'trace_game') continue; // adventure-only, has no task rows
    const n = tasks.filter((t) => t.mechanic_id === m && !t.task_id!.endsWith('-S')).length;
    if (n > 0 && n < 5) {
      add('error', 'min-tasks-per-mechanic', 'tasks.csv', null, `${m} has ${n} tasks, spec 18 requires at least 5`);
    }
  }

  // ── Rule 2b: the MVP ships three mechanics (spec 1.2) ───────────────────
  if (src.requireAllMechanics) {
    for (const m of ['balloon_game', 'fishing_game', 'letter_train_game'] as const) {
      if (!tasks.some((t) => t.mechanic_id === m)) {
        add('error', 'mvp-mechanic-missing', 'tasks.csv', null, `${m} has no tasks — spec 1.2 requires all three`);
      }
    }
  }

  // ── Rules 3 & 4: spec 18 — every task is fully specified ────────────────
  for (const t of tasks) {
    const prompt = copyById.get(t.prompt_copy!);
    if (prompt && !prompt.audio_ref) {
      add('error', 'voice-instruction-required', 'tasks.csv', t, `prompt "${t.prompt_copy}" has no audio_ref`);
    }
    for (const key of ['feedback_correct_copy', 'feedback_retry_copy']) {
      if (!t[key]) add('error', 'task-completeness', 'tasks.csv', t, `missing ${key}`);
    }
    if (!t.hint1_copy) {
      add('error', 'task-completeness', 'tasks.csv', t, 'no hint defined (spec 18 requires at least one)');
    }
  }

  // ── Rule 5: every skill has a simpler fallback somewhere ────────────────
  for (const skill of ALL_SKILL_IDS) {
    const forSkill = tasks.filter((t) => t.skill_id === skill);
    if (forSkill.length === 0) continue;
    const hasFallback = forSkill.some((t) => t.simpler_task_id) ||
      forSkill.some((t) => Number(t.option_count) === 2);
    if (!hasFallback) {
      add('error', 'simpler-task-required', 'tasks.csv', null, `skill "${skill}" has no simpler task for ladder step 6`);
    }
  }

  // ── Rule 6: forbidden phrases. The reason this file exists. ─────────────
  const { general, parentOnly } = parseForbidden(src.forbiddenPhrases);
  for (const row of copy) {
    const text = row.text_he ?? '';
    const isParent = row.copy_id!.startsWith('parent.');
    const banned = isParent ? [...general, ...parentOnly] : general;
    for (const phrase of banned) {
      if (text.includes(phrase)) {
        add('error', 'forbidden-phrase', 'copy.csv', row,
          `"${row.copy_id}" contains banned phrase "${phrase}" (spec ${isParent ? '14.4' : '21'})`);
      }
    }
  }

  // ── Rule 6b: spec 1.6 — spoken lines must be pre-recordable ─────────────
  let voicedLines = 0;
  for (const row of copy) {
    if (!isTrue(row.voiced ?? '')) continue;
    voicedLines++;

    if (!row.audio_ref) {
      add('error', 'voiced-needs-audio', 'copy.csv', row, `"${row.copy_id}" is voiced but has no audio_ref`);
    }
    for (const token of extractTokens(row.text_he ?? '')) {
      if (!CLOSED_SET_TOKENS.has(token)) {
        add('error', 'open-set-token-in-speech', 'copy.csv', row,
          `"${row.copy_id}" speaks {{${token}}}, which is not a closed set — it cannot be pre-recorded (spec 1.6)`);
      }
    }
  }

  // ── Rule 6c: every token a task speaks must be fillable by its target ───
  for (const t of tasks) {
    const targetId = t.target_content_id ?? '';
    const kind = targetId.split(':')[0] ?? '';
    const available = TOKENS_BY_CONTENT_KIND[kind];
    if (!available) continue; // an unknown target is rule 1's problem, not this one

    // Alef is the one letter with no consonant sound (spec 1.5 lists it as
    // "ללא עיצור מלא"), so it cannot fill {{sound}} even though every other
    // letter can. A silent blank here would read as a finished sentence.
    const soundless = targetId === 'letter:alef';

    for (const field of TASK_COPY_FIELDS) {
      const copyId = t[field];
      if (!copyId) continue;
      const row = copyById.get(copyId);
      if (!row) continue; // rule 1 already reported the dangling reference

      for (const token of extractTokens(row.text_he ?? '')) {
        if (!available.has(token)) {
          add('error', 'token-not-resolvable', 'tasks.csv', t,
            `${field} "${copyId}" uses {{${token}}}, which a ${kind} target cannot fill`);
        } else if (token === 'sound' && soundless) {
          add('error', 'token-not-resolvable', 'tasks.csv', t,
            `${field} "${copyId}" uses {{sound}}, but "${targetId}" has no consonant sound (spec 1.5)`);
        }
      }
    }
  }

  // ── Rule 7: scope guard, spec 1.3 #7 and 1.2 #8 ─────────────────────────
  for (const t of tasks) {
    const all = [t.target_content_id!, ...pipeList(t.distractors!)];
    for (const id of all) {
      if (id.startsWith('letter:') && !letterIds.has(id)) {
        add('error', 'out-of-scope-letter', 'tasks.csv', t, `"${id}" is outside the 8 MVP letters`);
      }
    }
    // A task may not be target-eligible-only-by-vowel: the MVP explicitly does
    // NOT ask a child to tell patah from qamats by sound (spec 1.3 #7, 9.1).
    const target = comboById.get(t.target_content_id!);
    if (target) {
      if (!target.isTargetEligible) {
        add('error', 'distractor-as-target', 'tasks.csv', t,
          `"${t.target_content_id}" is a distractor-only combination and may not be a target`);
      }
      for (const d of pipeList(t.distractors!)) {
        const dc = comboById.get(d);
        if (!dc) continue;
        const pair = new Set([target.mark, dc.mark]);
        if (dc.letterId === target.letterId && pair.has('patah') && pair.has('qamats')) {
          add('error', 'patah-vs-qamats', 'tasks.csv', t,
            `distinguishing ${target.mark} from ${dc.mark} by sound alone is out of MVP scope (spec 1.3 #7)`);
        }
      }
    }
  }

  // ── Rule 8: option count within the allowed range (spec 1.3 content) ────
  for (const t of tasks) {
    const n = Number(t.option_count);
    if (!(n >= 2 && n <= 4)) {
      add('error', 'option-count', 'tasks.csv', t, `option_count ${t.option_count} is outside 2-4`);
    }
    if (pipeList(t.distractors!).length < n - 1) {
      add('error', 'option-count', 'tasks.csv', t, `needs ${n - 1} distractors, has ${pipeList(t.distractors!).length}`);
    }
  }

  // ── Rule 9: distractor sanity ───────────────────────────────────────────
  for (const t of tasks) {
    const ds = pipeList(t.distractors!);
    if (ds.includes(t.target_content_id!)) {
      add('error', 'distractor-sanity', 'tasks.csv', t, 'target appears among its own distractors');
    }
    if (new Set(ds).size !== ds.length) {
      add('error', 'distractor-sanity', 'tasks.csv', t, 'duplicate distractors');
    }
    // An opening-sound task whose distractor starts with the same sound has no
    // correct answer. This is the ambiguity that silently makes data worthless.
    if (t.skill_id === 'opening_sound_recognition') {
      const targetSound = words.find((w) => w.content_id === t.target_content_id)?.opening_sound_id;
      for (const d of ds) {
        const dSound = words.find((w) => w.content_id === d)?.opening_sound_id;
        if (targetSound && dSound === targetSound) {
          add('error', 'ambiguous-distractor', 'tasks.csv', t,
            `distractor "${d}" starts with the same sound as the target — the round has two right answers`);
        }
      }
    }
  }

  // ── Rule 10: asset presence — doubles as the recording work-order ───────
  let missingAudio = 0;
  if (src.availableAssets) {
    const have = new Set(src.availableAssets);
    for (const row of copy) {
      const ref = row.audio_ref;
      if (!ref || ref.includes('{{')) continue; // templated refs expand per value
      if (!have.has(ref)) {
        missingAudio++;
        add('warning', 'missing-audio', 'copy.csv', row, `recording not found: ${ref}`);
      }
    }
  }

  // ── Niqqud ordering in hand-authored Hebrew ─────────────────────────────
  // The CSVs are edited in Excel, where combining marks are invisible. A
  // mis-ordered vowel renders wrongly and nobody sees it in the spreadsheet.
  for (const [file, rows, field] of [
    ['words.csv', words, 'text_he'],
    ['copy.csv', copy, 'text_he'],
  ] as const) {
    for (const row of rows) {
      const bad = findMisorderedCluster(row[field] ?? '');
      if (bad) {
        add('error', 'niqqud-order', file, row, `mark order wrong in "${bad}" — expected [letter][dagesh/shin-dot][vowel]`);
      }
    }
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.length - errorCount;

  return {
    diagnostics,
    errorCount,
    warningCount,
    stats: {
      tasks: tasks.filter((t) => !t.task_id!.endsWith('-S')).length,
      letters: LETTERS.length,
      words: words.length,
      combos: NIQQUD_COMBOS.length,
      copyLines: copy.length,
      voicedLines,
      missingAudio,
    },
  };
}

function parseForbidden(text: string) {
  const general: string[] = [];
  const parentOnly: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('parent:')) parentOnly.push(line.slice('parent:'.length).trim());
    else general.push(line);
  }
  return { general, parentOnly };
}

const VOWELS = ['ִ', 'ֵ', 'ֶ', 'ַ', 'ָ', 'ֹ', 'ֻ'];
const BODY_POINTS = [DAGESH, SHIN_DOT, 'ׂ'];

/** Returns the first cluster whose vowel precedes a body point, or null. */
function findMisorderedCluster(text: string): string | null {
  for (const cluster of toClusters(text)) {
    const marks = [...cluster].filter(isCombiningMark);
    const firstVowel = marks.findIndex((m) => VOWELS.includes(m));
    const lastBody = marks.map((m) => BODY_POINTS.includes(m)).lastIndexOf(true);
    if (firstVowel !== -1 && lastBody !== -1 && lastBody > firstVowel) return cluster;
  }
  return null;
}
