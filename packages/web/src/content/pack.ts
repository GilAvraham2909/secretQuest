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
}

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

/** Everything a content id can be, flattened for lookup. */
interface ContentEntry {
  kind: OptionKind;
  glyph?: string;
  imageRef?: string;
  audioRef?: string;
  label: string;
  /** The pointed letter NAME, used to fill {{letter_name}} in prompts. */
  letterName?: string;
  sound?: string;
}

function buildIndex(): Map<ContentId, ContentEntry> {
  const idx = new Map<ContentId, ContentEntry>();

  for (const l of LETTERS) {
    idx.set(l.contentId, {
      kind: 'glyph',
      glyph: l.glyph,
      label: l.nameHe,
      letterName: l.nameHe,
      sound: l.baseSound ?? undefined,
      audioRef: `name-${l.letterId}.mp3`,
    });
  }

  for (const c of NIQQUD_COMBOS) {
    idx.set(c.contentId, {
      kind: 'glyph',
      glyph: c.glyph,
      label: c.glyph,
      letterName: LETTERS_BY_ID[c.letterId].nameHe,
      audioRef: `combo-${c.letterId}-${c.mark}.mp3`,
    });
  }

  for (const row of parseCsv(wordsCsv)) {
    idx.set(row.content_id!, {
      kind: 'image',
      imageRef: row.image!,
      label: row.text_he!,
      audioRef: row.audio_word!,
    });
  }

  for (const row of parseCsv(soundsCsv)) {
    const letterId = row.root_letter_id!.replace('letter:', '') as keyof typeof LETTERS_BY_ID;
    idx.set(row.content_id!, {
      kind: 'glyph',
      glyph: LETTERS_BY_ID[letterId]?.glyph,
      label: row.stretched_he!,
      letterName: LETTERS_BY_ID[letterId]?.nameHe,
      sound: row.stretched_he,
      audioRef: row.audio_sound!,
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
      const textHe = row.textHe
        .replace(/\{\{\s*letter_name\s*\}\}/g, entry?.letterName ?? '')
        .replace(/\{\{\s*letter_glyph\s*\}\}/g, entry?.glyph ?? '')
        .replace(/\{\{\s*sound\s*\}\}/g, entry?.sound ?? '')
        .replace(/\{\{\s*word\s*\}\}/g, entry?.label ?? '')
        .replace(/\{\{\s*combo\s*\}\}/g, entry?.glyph ?? '')
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
  };
}
