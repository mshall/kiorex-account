/**
 *   IDENTITY_PROMOTION_MODE=carry KX_ENV=test DATABASE_URL=... npm run identity:export -- --out test-identities.json [--include-demo]
 * Read-only on the source database. Refuses unless IDENTITY_PROMOTION_MODE=carry (default "ask"). The file holds personal data (phones, names, e-mails):
 * it is written with mode 0600, never commit it, delete it after the import. Demo-tagged rows are left out unless --include-demo.
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { assertCarryMode, parsePromotionMode, PromotionRefusedError } from '../apps/dev-idp/src/promotion-mode.js';
import { declaredEnv, exportIdentities } from './lib/identity-promotion.js';

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
try {
  assertCarryMode(parsePromotionMode());
  const known = new Set(['--out', '--include-demo', '--source-env']);
  const bad = args.filter((a, i) => a.startsWith('--') ? !known.has(a) : !['--out', '--source-env'].includes(args[i - 1] ?? ''));
  if (bad.length) throw new Error(`unknown argument(s): ${bad.join(' ')}`);
  const out = val('--out');
  if (!out) throw new Error('--out <file> is required');
  const sourceEnv = val('--source-env')?.toLowerCase() ?? declaredEnv();
  if (!sourceEnv) throw new Error('declare the source environment: KX_ENV=test (or --source-env test)');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL (the SOURCE database) is required');
  const schema = process.env.KX_DB_SCHEMA ?? 'public';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`invalid KX_DB_SCHEMA: ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
  try {
    const file = await exportIdentities(pool, { sourceEnv, includeDemo: args.includes('--include-demo') });
    writeFileSync(out, JSON.stringify(file, null, 2), { mode: 0o600 });
    console.log(`identity:export ${sourceEnv}: ${Object.entries(file.counts).map(([t, n]) => `${t} ${n}`).join(', ')}${file.includesDemo ? ' (demo included)' : ' (demo excluded)'} -> ${out} (mode 0600, personal data)`);
  } finally { await pool.end(); }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(e instanceof PromotionRefusedError ? 3 : 2);
}
