/**
 * The three independent axes.
 *
 * The client spec demands, in four separate sections, that skill, mechanic and
 * content each be replaceable without touching the other two (1.2 AC, 1.10 AC,
 * 18 AC, 1.6 AC). The previous build failed this because each station file was
 * simultaneously its own skill definition, mechanic, content bank and
 * wrong-answer handler — seven stations, seven copies of everything.
 *
 * These three id types never reference each other. Their only meeting point is
 * TaskTemplate, which is a data row, not code.
 */

/** AXIS 1 — what is being assessed. Spec 1.3. */
export type SkillId =
  | 'visual_letter_recognition' // 1.3 #1  זיהוי חזותי של אותיות
  | 'letter_name_recognition' // 1.3 #2  הכרת שם האות
  | 'letter_sound_correspondence' // 1.3 #3  קשר בסיסי אות–צליל
  | 'opening_sound_recognition' // 1.3 #4  זיהוי צליל פותח
  | 'niqqud_combination_recognition'; // 1.3 #5+#6

/** AXIS 2 — how the child interacts. Spec 1.2. */
export type MechanicId =
  | 'balloon_game' // פיצוץ בלונים
  | 'fishing_game' // דיג אותיות — TAP, not drag (client decision)
  | 'letter_train_game' // רכבת האותיות
  | 'match_game' // the "התאמה" / "תמונות" / "ניקוד" rows of spec 15
  | 'trace_game'; // spec 10.5, remedial step 3 only

/**
 * AXIS 3 — which letter / sound / word / combination.
 *
 * One namespaced string space so spec 17's single `target_content_id` field
 * carries every content kind without needing a discriminator column:
 *   letter:mem · letter_sound:m · word:matara · niqqud_combo:mem_patah
 */
export type ContentId = string;

export type ContentKind = 'letter' | 'letter_sound' | 'niqqud_combo' | 'word';

/** Stable ids for copy strings. No Hebrew literal may live outside content. */
export type CopyId = string;

export const ALL_SKILL_IDS: readonly SkillId[] = [
  'visual_letter_recognition',
  'letter_name_recognition',
  'letter_sound_correspondence',
  'opening_sound_recognition',
  'niqqud_combination_recognition',
] as const;

export const ALL_MECHANIC_IDS: readonly MechanicId[] = [
  'balloon_game',
  'fishing_game',
  'letter_train_game',
  'match_game',
  'trace_game',
] as const;

/** Hebrew labels for the parent screen (spec 14.3). */
export const SKILL_LABEL_HE: Readonly<Record<SkillId, string>> = {
  visual_letter_recognition: 'זיהוי חזותי של אותיות',
  letter_name_recognition: 'הכרת שם האות',
  letter_sound_correspondence: 'קשר אות–צליל',
  opening_sound_recognition: 'צליל פותח',
  niqqud_combination_recognition: 'אות עם קמץ או פתח',
};

export const MECHANIC_LABEL_HE: Readonly<Record<MechanicId, string>> = {
  balloon_game: 'פיצוץ בלונים',
  fishing_game: 'דיג אותיות',
  letter_train_game: 'רכבת האותיות',
  match_game: 'משחק התאמה',
  trace_game: 'ציור האות',
};
