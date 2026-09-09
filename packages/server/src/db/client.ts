import type { PgDatabase } from 'drizzle-orm/pg-core';
import * as schema from './schema.js';

/**
 * The database handle.
 *
 * Typed structurally rather than against one driver, so the repository layer
 * compiles once and runs against either: PGlite in tests and local dev,
 * node-postgres against managed Postgres in production. Both are real
 * PostgreSQL — the test database is not a SQLite impersonation, so a unique
 * index, an ON CONFLICT and a JSONB column behave in a test exactly as they
 * behave in production. That matters more here than usual, because the entire
 * offline story rests on one ON CONFLICT DO NOTHING (§6.3 rule 5).
 *
 * It also satisfies seam S7 — single-command dev and test on Windows
 * PowerShell, no bash, no Docker — which is a hard environment constraint here,
 * not a preference.
 */
export type Db = PgDatabase<any, typeof schema, any>;

export { schema };
