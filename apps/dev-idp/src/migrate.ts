import { assertNotProduction } from './guard.js';

/**
 * Container entrypoint step: create/upgrade the Passport schema (idempotent CREATE ... IF NOT EXISTS) and exit.
 * Exits non-zero on ANY failure so a bad database never ends up as a "healthy" container (the server then does not start).
 */
try { assertNotProduction(); } catch { process.exit(1); }
const { loadIdpConfig, runtimeFromEnv } = await import('./config.js');
const { createPool, migrate } = await import('./db.js');
const rt = runtimeFromEnv(loadIdpConfig());
const pool = createPool(rt.databaseUrl, rt.schema);
try {
  await migrate(pool, rt.schema);
  console.log(`[migrate] schema "${rt.schema}" is up to date`);
} catch (e) {
  console.error('[migrate] FAILED', e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await pool.end();
}
