import { defineConfig } from 'drizzle-kit';

/**
 * Migrations are GENERATED from schema.ts and checked in.
 *
 * Hand-written DDL alongside a schema module is two sources of truth that drift
 * silently — and the drift that matters here is an index: criterion 3.11's
 * group-by and §6.3's idempotent upsert are both fast-and-correct only because
 * of an index, and an index missing in production but present in the test
 * schema fails in exactly the place nobody looks.
 */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  // No credentials here. `generate` is offline; applying a migration is a
  // deploy step that reads DATABASE_URL from the environment.
  strict: true,
});
