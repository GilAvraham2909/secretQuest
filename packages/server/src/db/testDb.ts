import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema.js';
import type { Db } from './client.js';

/**
 * A real PostgreSQL, in this process, from the checked-in migrations.
 *
 * NOT a mock and NOT SQLite. Everything M4 depends on is a Postgres behaviour:
 * ON CONFLICT DO NOTHING is the whole idempotency story (§6.3 rule 5), JSONB is
 * how payloads are stored, and the composite primary key on skill_states is
 * what stops the parent screen listing a skill twice. A test double would agree
 * with whatever the code does, which is the opposite of what these tests are
 * for.
 *
 * Running the same migration files the deploy runs means a missing index or a
 * mistyped column fails here, rather than in production where the schema is the
 * one thing that cannot be hot-fixed casually.
 */
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });

  const here = dirname(fileURLToPath(import.meta.url));
  const migrationsDir = join(here, '..', '..', 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    // Drizzle separates statements with this marker rather than a bare
    // semicolon, which is what makes a function body or a quoted string
    // containing a semicolon safe to split on.
    for (const statement of sql.split('--> statement-breakpoint')) {
      const trimmed = statement.trim();
      if (trimmed) await pg.exec(trimmed);
    }
  }

  return { db: db as unknown as Db, close: () => pg.close() };
}
