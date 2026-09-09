import tasksCsv from '../../../../content/source/tasks.csv?raw';
import copyCsv from '../../../../content/source/copy.csv?raw';
import wordsCsv from '../../../../content/source/words.csv?raw';
import soundsCsv from '../../../../content/source/letter-sounds.csv?raw';
import {
  parseCsv,
  pipeList,
  LETTERS_BY_ID,
  LETTERS,
  NIQQUD_COMBOS,
  type TaskTemplate,
  type ContentResolver,
  type SkillId,
  type MechanicId,
  type ContentId,
  type OptionKind,
} from '@secret-journey/shared';

/**
 * Loads the authored CSVs into memory and exposes them as a content pack.
 *
 * Imported with ?raw so the CSVs stay the single source of truth — nobody has
 * to remember to re-export them into a TS file, and a content edit is picked up
 * by hot reload like any other change.
 *
 * The architecture calls for a compiled, hashed pack served as a static asset.
 * That matters for cache control and for pinning what a child actually saw; it
 * does not change the shape of anything here, so it is deferred until there is
 * a server to serve it from.
 */

export interface ContentPack {
  readonly tasks: readonly TaskTemplate[];
  readonly resolver: ContentResolver;
  readonly taskById: ReadonlyMap<string, TaskTemplate>;
  /**
   * The copy line as authored, tokens unsubstituted. Exists so a test can
   * compare a rendered line against its own template and catch a token that
   * resolved to nothing — a blank reads as finished copy on screen, which is
   * how three broken lines survived review.
   */
  rawCopyText(copyId: string): string | undefined;
}

/**
 * The word pictures, bundled.
 *
 * Resolved HERE rather than in the mechanic, for the same reason OptionView
 * carries no audioRef: "matara.png" would hand a mechanic the content identity
 * that the opaque optionId exists to hide, and a mechanic that can read which
 * picture is which can special-case it. What reaches the mechanic is a built
 * asset URL, hashed in a production build.
 *
 * Eager, because a round must draw all of its options in the same frame — a
 * lazily-fetched picture would pop in after the others and draw the eye to
 * whichever option happened to load last.
 */
const WORD_IMAGE_URLS = import.meta.glob('../../../../assets/images/words/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const wordImageByFile = new Map(
  Object.entries(WORD_IMAGE_URLS).map(([path, url]) => [path.split('/').pop()!, url]),
);

interface CopyRow {
  textHe: string;
  audioRef: string;
  voiced: boolean;
}

function loadCopy(): Map<string, CopyRow> {
  const out = new Map<string, CopyRow>();
  for (const row of parseCsv(copyCsv)) {
    out.set(row.copy_id!, {
      textHe: row.text_he ?? '',
      audioRef: row.audio_ref ?? '',
      voiced: (row.voiced ?? '').toUpperCase() === 'TRUE',
    });
  }
  return out;
}

function loadTasks(): TaskTemplate[] {
  return parseCsv(tasksCsv).map((row) => ({
    taskId: row.task_id!,
    skillId: row.skill_id as SkillId,
    alsoEvidences: pipeList(row.also_evidences ?? '') as SkillId[],
    mechanicId: row.mechanic_id as MechanicId,
    targetContentId: row.target_content_id!,
    distractorContentIds: pipeList(row.distractors ?? ''),
    defaultOptionCount: Number(row.option_count) as 2 | 3 | 4,
    promptCopyId: row.prompt_copy!,
    feedbackCorrectCopyId: row.feedback_correct_copy!,
    feedbackRetryCopyId: row.feedback_retry_copy!,
    hintCopyIds: [row.hint1_copy!, row.hint2_copy!],
    simplerTaskId: row.simpler_task_id || null,
  }));
}

/**
 * The values a copy template may interpolate, per spec 1.6's closed-set rule.
 * The names match the {{tokens}} in copy.csv exactly, and the content linter
 * checks the same table — see the token-resolvable rule in lint.ts.
 *
 * These used to be two loose optional fields with {{word}} reading whatever
 * happened to be in `label`. That silently produced "הצליל מתחיל כמו במילה
 * ממממ" for a letter-sound hint (the stretched sound, not the example word),
 * an empty "מצא את המילה שמתחילה בצליל " for every opening-sound prompt, and a
 * literal "{{stretched_sound}}" on screen — none of which anything caught,
 * because no mechanic hosted those tasks yet.
 */
interface CopyTokens {
  letter_name?: string;
  letter_glyph?: string;
  /** The bare consonant sound: מ. */
  sound?: string;
  /** The stretched sound a child hears: ממממ. */
  stretched_sound?: string;
  /** A word from the approved §8.3 bank, and only from there. */
  word?: string;
  combo?: string;
}

/** Everything a content id can be, flattened for lookup. */
interface ContentEntry {
  kind: OptionKind;
  glyph?: string;
  imageRef?: string;
  audioRef?: string;
  label: string;
  tokens: CopyTokens;
}

function buildIndex(): Map<ContentId, ContentEntry> {
  const idx = new Map<ContentId, ContentEntry>();

  // Words and letter-sounds reference each other — a sound names its example
  // word, a word names its opening sound — so both tables are read before
  // either is turned into an entry.
  const wordRows = parseCsv(wordsCsv);
  const soundRows = parseCsv(soundsCsv);
  const stretchedBySoundId = new Map(soundRows.map((r) => [r.content_id!, r.stretched_he!]));
  const wordTextById = new Map(wordRows.map((r) => [r.content_id!, r.text_he!]));

  const letterOf = (contentId: string) =>
    LETTERS_BY_ID[contentId.replace('letter:', '') as keyof typeof LETTERS_BY_ID];

  for (const l of LETTERS) {
    idx.set(l.contentId, {
      kind: 'glyph',
      glyph: l.glyph,
      label: l.nameHe,
      audioRef: `name-${l.letterId}.mp3`,
      tokens: {
        letter_name: l.nameHe,
        letter_glyph: l.glyph,
        sound: l.baseSound ?? undefined,
      },
    });
  }

  for (const c of NIQQUD_COMBOS) {
    const letter = LETTERS_BY_ID[c.letterId];
    idx.set(c.contentId, {
      kind: 'glyph',
      glyph: c.glyph,
      label: c.glyph,
      audioRef: `combo-${c.letterId}-${c.mark}.mp3`,
      tokens: {
        combo: c.glyph,
        letter_name: letter.nameHe,
        letter_glyph: letter.glyph,
      },
    });
  }

  for (const row of wordRows) {
    const letter = letterOf(row.root_letter_id!);
    idx.set(row.content_id!, {
      kind: 'image',
      imageRef: wordImageByFile.get(row.image!),
      label: row.text_he!,
      audioRef: row.audio_word!,
      tokens: {
        word: row.text_he!,
        letter_name: letter?.nameHe,
        letter_glyph: letter?.glyph,
        // The opening SOUND, not the word's own text — this is what spec 8.2's
        // "מצא את המילה שמתחילה בצליל [צליל]" is asking about.
        sound: letter?.baseSound ?? undefined,
        stretched_sound: stretchedBySoundId.get(row.opening_sound_id!),
      },
    });
  }

  for (const row of soundRows) {
    const letter = letterOf(row.root_letter_id!);
    idx.set(row.content_id!, {
      kind: 'glyph',
      glyph: letter?.glyph,
      label: row.stretched_he!,
      audioRef: row.audio_sound!,
      tokens: {
        letter_name: letter?.nameHe,
        letter_glyph: letter?.glyph,
        sound: letter?.baseSound ?? undefined,
        stretched_sound: row.stretched_he!,
        // Spec 7.4's hint is "הצליל מתחיל כמו במילה [מילה מוכרת]", and the
        // spec is explicit that only bank words may appear there.
        word: wordTextById.get(row.example_word_id!),
      },
    });
  }

  return idx;
}

export function loadContentPack(): ContentPack {
  const copy = loadCopy();
  const index = buildIndex();
  const tasks = loadTasks();

  const resolver: ContentResolver = {
    optionKind: (id) => index.get(id)?.kind ?? 'glyph',
    glyph: (id) => index.get(id)?.glyph,
    imageRef: (id) => index.get(id)?.imageRef,
    audioRef: (id) => index.get(id)?.audioRef,
    label: (id) => index.get(id)?.label ?? id,

    copy: (copyId, targetContentId) => {
      const row = copy.get(copyId);
      if (!row) return { textHe: copyId, audioRef: null };
      const entry = index.get(targetContentId);

      // Closed-set substitution only — spec 1.6. Every value here comes from a
      // known, finite table, so one whole-sentence recording per value exists.
      //
      // An unresolvable token is left VISIBLE rather than replaced with an
      // empty string. A blank is indistinguishable from correct copy on screen,
      // which is how "מצא את המילה שמתחילה בצליל " survived; the raw {{token}}
      // is impossible to miss, and the content linter fails the build before it
      // can reach a child anyway.
      const textHe = row.textHe
        .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, token: string) => {
          const value = entry?.tokens[token as keyof CopyTokens];
          return value ?? whole;
        })
        .trim();

      // A templated audio ref names one recording per value, never a splice.
      const audioRef = row.audioRef
        ? row.audioRef.replace(/\{\{[^}]+\}\}/g, targetContentId.split(':')[1] ?? '')
        : null;

      return { textHe, audioRef };
    },
  };

  return {
    tasks,
    resolver,
    taskById: new Map(tasks.map((t) => [t.taskId, t])),
    rawCopyText: (copyId) => copy.get(copyId)?.textHe,
  };
}
