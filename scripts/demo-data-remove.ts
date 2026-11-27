/**
 *   npm run demo-data:remove -- --dry-run     (default) report what would be removed
 *   npm run demo-data:remove -- --confirm     delete demo-tagged rows (data_class = 'DEMO') in one transaction; idempotent
 * Env: DATABASE_URL (required with --confirm), KX_DB_SCHEMA (default public). Never touches REAL accounts or organisations.
 */
import pg from 'pg';
import { formatDemoReport, removeDemoData } from './lib/demo-data.js';

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
if (confirm && args.includes('--dry-run')) { console.error('--dry-run and --confirm are mutually exclusive'); process.exit(2); }
const unknown = args.filter((a) => !['--confirm', '--dry-run', '--json'].includes(a));
if (unknown.length) { console.error(`unknown argument(s): ${unknown.join(' ')}`); process.exit(2); }
if (confirm && !process.env.DATABASE_URL) { console.error('--confirm needs an explicit DATABASE_URL (no default database is used for a destructive run)'); process.exit(2); }
const schema = process.env.KX_DB_SCHEMA ?? 'public';
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) { console.error(`invalid KX_DB_SCHEMA: ${schema}`); process.exit(2); }
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account';
const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` });
try {
  const report = await removeDemoData(pool, { confirm });
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatDemoReport(report));
} finally {
  await pool.end();
}
