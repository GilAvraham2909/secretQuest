/**
 * Regenerates content/source/words.csv with provably correct mark ordering.
 *
 * Run once to seed the file; after that a human edits it in Excel and the
 * content linter guards the ordering.
 *
 * This exists because typing pointed Hebrew by hand tends to produce NFC order
 * (vowel before dagesh), which renders wrongly and is invisible in a
 * spreadsheet. The linter caught exactly that on the first authoring pass.
 */

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Base letters
const ALEF = 'א', BET = 'ב', GIMEL = 'ג', DALET = 'ד';
const HE = 'ה', VAV = 'ו', TET = 'ט', KAF = 'כ';
const LAMED = 'ל', MEM = 'מ', FINAL_NUN = 'ן';
const RESH = 'ר', SHIN = 'ש';

// Body points — ALWAYS before the vowel
const DAGESH = 'ּ', SHIN_DOT = 'ׁ';

// Vowels — ALWAYS last in the cluster
const TSERE = 'ֵ', SEGOL = 'ֶ', PATAH = 'ַ';
const QAMATS = 'ָ', HOLAM = 'ֹ';

void ALEF; // kept for reference; not used by the current bank

const WORDS = [
  {
    id: 'word:matara',
    // מַ טָּ רָ ה
    text: MEM + PATAH + TET + DAGESH + QAMATS + RESH + QAMATS + HE,
    letter: 'letter:mem', sound: 'letter_sound:m', slug: 'matara',
  },
  {
    id: 'word:shemesh',
    // שֶׁ מֶ שׁ — shin-dot precedes the segol
    text: SHIN + SHIN_DOT + SEGOL + MEM + SEGOL + SHIN + SHIN_DOT,
    letter: 'letter:shin', sound: 'letter_sound:sh', slug: 'shemesh',
  },
  {
    id: 'word:dag',
    text: DALET + GIMEL, // דג — spec 8.3 gives it unpointed
    letter: 'letter:dalet', sound: 'letter_sound:d', slug: 'dag',
  },
  {
    id: 'word:rekhev',
    text: RESH + SEGOL + KAF + SEGOL + BET, // רֶכֶב
    letter: 'letter:resh', sound: 'letter_sound:r', slug: 'rekhev',
  },
  {
    id: 'word:balon',
    text: BET + DAGESH + PATAH + LAMED + VAV + HOLAM + FINAL_NUN, // בַּלוֹן
    letter: 'letter:bet', sound: 'letter_sound:b', slug: 'balon',
  },
  {
    id: 'word:gamal',
    text: GIMEL + DAGESH + QAMATS + MEM + QAMATS + LAMED, // גָּמָל
    letter: 'letter:gimel', sound: 'letter_sound:g', slug: 'gamal',
  },
  {
    id: 'word:lev',
    text: LAMED + TSERE + BET, // לֵב
    letter: 'letter:lamed', sound: 'letter_sound:l', slug: 'lev',
  },
  {
    id: 'word:shablul',
    text: SHIN + BET + LAMED + VAV + LAMED, // שבלול — distractor only
    letter: 'letter:shin', sound: 'letter_sound:sh', slug: 'shablul',
  },
];

const header =
  'content_id,text_he,root_letter_id,opening_sound_id,image,audio_word,audio_stretched,in_mvp,spec_ref';

const lines = [
  header,
  ...WORDS.map(
    (w) =>
      `${w.id},${w.text},${w.letter},${w.sound},${w.slug}.png,w-${w.slug}.mp3,s-${w.slug}.mp3,TRUE,8.3`,
  ),
];

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'source', 'words.csv');
// BOM so Excel opens the Hebrew correctly.
writeFileSync(out, '﻿' + lines.join('\r\n') + '\r\n', 'utf8');

console.log(`wrote ${WORDS.length} words to content/source/words.csv`);
for (const w of WORDS) {
  const cps = [...w.text].map((c) => c.codePointAt(0)!.toString(16).padStart(4, '0')).join(' ');
  console.log(`  ${w.id.padEnd(16)} ${w.text}   ${cps}`);
}
