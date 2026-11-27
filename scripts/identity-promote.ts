/**
 *   IDENTITY_PROMOTION_MODE=carry KX_ENV=pilot DATABASE_URL=<TARGET> npm run identity:promote -- --from test-identities.json --dry-run
 *   ... -- --from test-identities.json --confirm [--include-demo] [--report r.json] [--rollback-out rollback.json]
 *   ... -- --rollback rollback.json [--confirm]
 * DRY RUN is the default and runs the full import inside a transaction that is rolled back, so the counts are exact. --confirm is required to write.
 * Refuses unless IDENTITY_PROMOTION_MODE=carry (default "ask"; "separate" also refuses). The target environment must be declared (KX_ENV) and differ
 * from the file's source environment. Never overwrites an existing row. Demo-tagged rows are excluded unless --include-demo. See Docs/IDENTITY_PROMOTION.md.
 */
import pg from 'pg';
import { readFileSync, writeFileSync } from 'node:fs';
import { assertCarryMode, parsePromotionMode, PromotionRefusedError } from '../apps/dev-idp/src/promotion-mode.js';
import { declaredEnv, formatPromotionReport, importIdentities, manifestFrom, parseExport, rollbackImport, type RollbackManifest } from './lib/identity-promotion.js';

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
try {
  assertCarryMode(parsePromotionMode());
  const flags = new Set(['--dry-run', '--confirm', '--include-demo']);
  const withValue = new Set(['--from', '--report', '--rollback-out', '--rollback', '--target-env']);
  const bad = args.filter((a, i) => (a.startsWith('--') ? !flags.has(a) && !withValue.has(a) : !withValue.has(args[i - 1] ?? '')));
  if (bad.length) throw new Error(`unknown argument(s): ${bad.join(' ')}`);
  const confirm = args.includes('--confirm');
  if (confirm && args.includes('--dry-run')) throw new Error('--dry-run and --confirm are mutually exclusive');
  const targetEnv = val('--target-env')?.toLowerCase() ?? declaredEnv();
  if (!targetEnv) throw new Error('declare the target environment: KX_ENV=pilot (or --target-env pilot)');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL (the TARGET database) is required');
  const schema = process.env.KX_DB_SCHEMA ?? 'public';
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`invalid KX_DB_SCHEMA: ${schema}`);
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
  try {
    const rollbackFile = val('--rollback');
    if (rollbackFile) {
      const removed = await rollbackImport(pool, JSON.parse(readFileSync(rollbackFile, 'utf8')) as RollbackManifest, { confirm });
      console.log(`identity:promote --rollback (${confirm ? 'CONFIRMED' : 'DRY RUN, pass --confirm'}): ${JSON.stringify(removed)}`);
    } else {
      const from = val('--from');
      if (!from) throw new Error('--from <export file> is required');
      const file = parseExport(readFileSync(from, 'utf8'));
      const report = await importIdentities(pool, file, { targetEnv, includeDemo: args.includes('--include-demo'), confirm });
      console.log(formatPromotionReport(report));
      if (val('--report')) writeFileSync(val('--report')!, JSON.stringify({ ...report, rollback: undefined }, null, 2));
      if (confirm) {
        const out = val('--rollback-out') ?? `identity-rollback-${targetEnv}-${Date.now()}.json`;
        writeFileSync(out, JSON.stringify(manifestFrom(report), null, 2), { mode: 0o600 });
        console.log(`rollback manifest written: ${out}`);
      }
    }
  } finally { await pool.end(); }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(e instanceof PromotionRefusedError ? 3 : 2);
}
