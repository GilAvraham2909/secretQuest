/**
 * A small RFC-4180 CSV reader.
 *
 * Deliberately dependency-free and deliberately strict: content is authored by
 * a person in Excel, and the failure mode we care about is a quietly mangled
 * Hebrew string, not a clever edge case. Anything ambiguous should throw where
 * the author can see it.
 */

export type CsvRow = Readonly<Record<string, string>>;

/** Strips a UTF-8 BOM. Excel writes one; leaving it corrupts the first header. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

export function parseCsv(text: string): CsvRow[] {
  const clean = stripBom(text).replace(/\r\n/g, '\n').trimEnd();
  const lines = clean.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitLine(lines[0]!).map((h) => h.trim());
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]!);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').trim();
    });
    // Carry the source line number so a diagnostic can point at the row the
    // author actually edited.
    row.__line = String(i + 1);
    rows.push(row);
  }
  return rows;
}

/** Splits a pipe-delimited cell, the convention for multi-value fields. */
export function pipeList(value: string): string[] {
  return value
    .split('|')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function isTrue(value: string): boolean {
  return value.toUpperCase() === 'TRUE';
}

/** Extracts {{token}} names from a template string. */
export function extractTokens(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1]!);
}
