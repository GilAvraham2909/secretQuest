/**
 * Content linter CLI.
 *
 * Run:  npm run content:lint
 *
 * Exits non-zero on any error, so it can sit inside `npm run verify` and stop a
 * release that would say the wrong thing to a child.
 *
 * The warning list doubles as the audio recording work-order: every missing
 * clip is printed by name, and the list shrinks as recordings land.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintContent } from '../packages/shared/src/content/lint.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'content', 'source');

function read(file: string): string {
  return readFileSync(join(src, file), 'utf8');
}

const audioDir = join(root, 'assets', 'audio');
const availableAssets = existsSync(audioDir)
  ? readdirSync(audioDir).filter((f) => f.endsWith('.mp3'))
  : [];

const result = lintContent({
  tasksCsv: read('tasks.csv'),
  copyCsv: read('copy.csv'),
  wordsCsv: read('words.csv'),
  letterSoundsCsv: read('letter-sounds.csv'),
  forbiddenPhrases: readFileSync(join(root, 'content', 'schema', 'forbidden-phrases.txt'), 'utf8'),
  availableAssets,
  // The real content must ship all three MVP mechanics (spec 1.2).
  requireAllMechanics: true,
});

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

const errors = result.diagnostics.filter((d) => d.severity === 'error');
const warnings = result.diagnostics.filter((d) => d.severity === 'warning');

for (const d of errors) {
  const loc = d.line ? `${d.file}:${d.line}` : d.file;
  console.log(`${RED}ERROR${RESET} ${loc}  ${DIM}[${d.rule}]${RESET}\n      ${d.message}`);
}

// Missing recordings are collapsed — there will be many, and listing each one
// individually would bury the real errors.
const missing = warnings.filter((w) => w.rule === 'missing-audio');
const otherWarnings = warnings.filter((w) => w.rule !== 'missing-audio');

for (const d of otherWarnings) {
  const loc = d.line ? `${d.file}:${d.line}` : d.file;
  console.log(`${YELLOW}WARN ${RESET} ${loc}  ${DIM}[${d.rule}]${RESET}\n      ${d.message}`);
}

console.log('');
const s = result.stats;
console.log(
  `${s.tasks} tasks · ${s.letters} letters · ${s.words} words · ${s.combos} combos · ${s.copyLines} copy lines (${s.voicedLines} voiced)`,
);

if (missing.length > 0) {
  console.log(`${YELLOW}${missing.length} recordings still to make${RESET} ${DIM}(run with --list-audio to see them)${RESET}`);
  if (process.argv.includes('--list-audio')) {
    for (const m of missing) console.log(`  ${DIM}-${RESET} ${m.message.replace('recording not found: ', '')}`);
  }
}

if (result.errorCount > 0) {
  console.log(`\n${RED}${result.errorCount} error${result.errorCount === 1 ? '' : 's'}${RESET}`);
  process.exit(1);
}

console.log(`\n${GREEN}0 errors${RESET}`);
