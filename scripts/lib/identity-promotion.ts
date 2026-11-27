/**
 * Identity carry-over between environments (export from one, import into another). Gated by IDENTITY_PROMOTION_MODE = carry
 * (apps/dev-idp/src/promotion-mode.ts). Library only: the CLIs are scripts/identity-export.ts and scripts/identity-promote.ts.
 *
 * Carried: accounts (persons and dependants, subs preserved), account_contacts, federated_identities, organizations, memberships, guardian_links.
 * NEVER carried: passkeys (bound to the origin they were created on), TOTP secrets (people re-enrol), sessions, OTP state, invitations and SCIM tokens
 * (bearer secrets), link requests, audit events (append-only per environment), mock inbox, deleted accounts.
 * Demo-tagged rows (data_class = 'DEMO') are excluded unless includeDemo.
 * The import never overwrites: a row that already exists in the target (same key) is left as it is, and a phone that is already used by another sub
 * is reported as a conflict and that identity (with its dependants) is skipped. Dry run executes the whole import inside a transaction and rolls it back,
 * so its counts are exactly what a confirmed run would do.
 */
import { createHash } from 'node:crypto';
import type pg from 'pg';

export const EXPORT_FORMAT = 'kiorex-passport-identity-export';
export const EXPORT_VERSION = 1;

export interface IdentityData {
  accounts: Record<string, unknown>[];
  account_contacts: Record<string, unknown>[];
  federated_identities: Record<string, unknown>[];
  organizations: Record<string, unknown>[];
  memberships: Record<string, unknown>[];
  guardian_links: Record<string, unknown>[];
}
export interface IdentityExport {
  format: typeof EXPORT_FORMAT;
  version: typeof EXPORT_VERSION;
  sourceEnv: string;
  exportedAt: string;
  includesDemo: boolean;
  counts: Record<keyof IdentityData, number>;
  /** sha256 over the canonical JSON of `data`: detects a damaged or edited file */
  checksum: string;
  data: IdentityData;
}

const TABLES = ['accounts', 'account_contacts', 'federated_identities', 'organizations', 'memberships', 'guardian_links'] as const;
type Table = (typeof TABLES)[number];
/** natural keys, used for conflict handling and the rollback manifest */
const KEYS: Record<Table, string[]> = {
  accounts: ['sub'], account_contacts: ['type', 'value'], federated_identities: ['upstream_id', 'upstream_sub'],
  organizations: ['org_id'], memberships: ['id'], guardian_links: ['id'],
};
/** import order: parents first */
const ORDER: Table[] = ['accounts', 'organizations', 'account_contacts', 'federated_identities', 'memberships', 'guardian_links'];

export const checksumOf = (data: IdentityData): string => createHash('sha256').update(JSON.stringify(data)).digest('hex');

export async function exportIdentities(db: Pick<pg.Pool, 'query'>, o: { sourceEnv: string; includeDemo: boolean; now?: Date }): Promise<IdentityExport> {
  const demo = o.includeDemo ? '' : `AND data_class <> 'DEMO'`;
  const accounts = (await db.query(`SELECT * FROM accounts WHERE deleted_at IS NULL ${demo} ORDER BY sub`)).rows;
  const subs = accounts.map((a) => a.sub as string);
  const organizations = (await db.query(`SELECT * FROM organizations WHERE true ${demo} ORDER BY org_id`)).rows;
  const orgIds = organizations.map((x) => x.org_id as string);
  const data: IdentityData = {
    accounts,
    account_contacts: (await db.query(`SELECT * FROM account_contacts WHERE sub = ANY($1) ORDER BY type, value`, [subs])).rows,
    federated_identities: (await db.query(`SELECT * FROM federated_identities WHERE sub = ANY($1) ORDER BY upstream_id, upstream_sub`, [subs])).rows,
    organizations,
    memberships: (await db.query(`SELECT * FROM memberships WHERE org_id = ANY($1) AND sub = ANY($2) ORDER BY id`, [orgIds, subs])).rows,
    guardian_links: (await db.query(`SELECT * FROM guardian_links WHERE guardian_sub = ANY($1) AND dependant_sub = ANY($1) ORDER BY id`, [subs])).rows,
  };
  // JSON round trip so the checksum is over exactly what a file reader will see (dates become ISO strings)
  const plain = JSON.parse(JSON.stringify(data)) as IdentityData;
  return {
    format: EXPORT_FORMAT, version: EXPORT_VERSION, sourceEnv: o.sourceEnv, exportedAt: (o.now ?? new Date()).toISOString(), includesDemo: o.includeDemo,
    counts: Object.fromEntries(TABLES.map((t) => [t, plain[t].length])) as IdentityExport['counts'], checksum: checksumOf(plain), data: plain,
  };
}

export function parseExport(text: string): IdentityExport {
  let j: IdentityExport;
  try { j = JSON.parse(text) as IdentityExport; } catch { throw new Error('the export file is not valid JSON'); }
  if (j?.format !== EXPORT_FORMAT || j.version !== EXPORT_VERSION) throw new Error(`not a ${EXPORT_FORMAT} v${EXPORT_VERSION} file`);
  for (const t of TABLES) if (!Array.isArray(j.data?.[t])) throw new Error(`export file is missing data.${t}`);
  if (checksumOf(j.data) !== j.checksum) throw new Error('export file checksum mismatch (the file was edited or damaged); export again');
  if (!j.sourceEnv) throw new Error('export file does not name its source environment');
  return j;
}

export interface PromotionReport {
  mode: 'dry-run' | 'confirmed';
  sourceEnv: string; targetEnv: string; exportedAt: string;
  includeDemo: boolean;
  /** rows in the file that were dropped because they are demo-tagged (and --include-demo was not given) */
  excludedDemo: number;
  inserted: Record<Table, number>;
  existingKept: Record<Table, number>;
  /** accounts whose phone belongs to a different sub in the target: skipped, with their dependants */
  conflicts: Array<{ sub: string; phoneMasked: string; reason: string }>;
  /** rows skipped because their parent account or organisation is not in the target */
  orphansSkipped: number;
  /** keys of the rows this run created, for rollback (written to a file by the CLI on a confirmed run) */
  rollback: Record<Table, Array<Record<string, string>>>;
}

const zero = (): Record<Table, number> => Object.fromEntries(TABLES.map((t) => [t, 0])) as Record<Table, number>;
const maskPhone = (p: unknown): string => (typeof p === 'string' && p.length > 6 ? `${p.slice(0, 4)}***${p.slice(-2)}` : '***');
const isDemo = (r: Record<string, unknown>): boolean => r.data_class === 'DEMO';

/** Inserts a row with every column of the export (columns are validated against the target) and ON CONFLICT DO NOTHING. Returns true when inserted. */
async function insertRow(c: pg.PoolClient, table: Table, row: Record<string, unknown>, cols: Set<string>): Promise<boolean> {
  const keys = Object.keys(row).filter((k) => cols.has(k));
  if (!keys.length) return false;
  const jsonCols = new Set(['roles', 'product_refs', 'evidence', 'transports']);
  const vals = keys.map((k) => (jsonCols.has(k) && row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k]));
  const r = await c.query(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`, vals);
  return (r.rowCount ?? 0) > 0;
}

export async function importIdentities(pool: pg.Pool, file: IdentityExport, o: { targetEnv: string; includeDemo: boolean; confirm: boolean }): Promise<PromotionReport> {
  if (o.targetEnv.toLowerCase() === file.sourceEnv.toLowerCase()) throw new Error(`source and target environment are both "${o.targetEnv}": nothing to promote`);
  const data: IdentityData = structuredClone(file.data);
  let excludedDemo = 0;
  const keepSubs = new Set<string>();
  for (const t of TABLES) {
    if (o.includeDemo) continue;
    const before = data[t].length;
    data[t] = data[t].filter((r) => !isDemo(r));
    excludedDemo += before - data[t].length;
  }
  for (const a of data.accounts) keepSubs.add(a.sub as string);

  const report: PromotionReport = {
    mode: o.confirm ? 'confirmed' : 'dry-run', sourceEnv: file.sourceEnv, targetEnv: o.targetEnv, exportedAt: file.exportedAt, includeDemo: o.includeDemo,
    excludedDemo, inserted: zero(), existingKept: zero(), conflicts: [], orphansSkipped: 0,
    rollback: Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as PromotionReport['rollback'],
  };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cols = new Map<Table, Set<string>>();
    for (const t of TABLES) {
      const r = await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`, [t]);
      if (!r.rowCount) throw new Error(`target database has no table ${t} (run the Passport migration first)`);
      cols.set(t, new Set(r.rows.map((x) => x.column_name as string)));
    }
    const presentSubs = new Set<string>(); // accounts that exist in the target after this run (existing or inserted)
    const presentOrgs = new Set<string>();
    for (const t of ORDER) {
      for (const row of data[t]) {
        if (t === 'account_contacts' || t === 'federated_identities') { if (!presentSubs.has(row.sub as string)) { report.orphansSkipped++; continue; } }
        if (t === 'memberships' && (!presentSubs.has(row.sub as string) || !presentOrgs.has(row.org_id as string))) { report.orphansSkipped++; continue; }
        if (t === 'guardian_links' && (!presentSubs.has(row.guardian_sub as string) || !presentSubs.has(row.dependant_sub as string))) { report.orphansSkipped++; continue; }
        const ok = await insertRow(client, t, row, cols.get(t)!);
        if (ok) {
          report.inserted[t]++;
          report.rollback[t].push(Object.fromEntries(KEYS[t].map((k) => [k, String(row[k])])));
        } else {
          const key = KEYS[t].map((k) => row[k]);
          const exists = (await client.query(`SELECT 1 FROM ${t} WHERE ${KEYS[t].map((k, i) => `${k} = $${i + 1}`).join(' AND ')}`, key)).rowCount;
          if (exists) report.existingKept[t]++;
          else if (t === 'accounts') report.conflicts.push({ sub: row.sub as string, phoneMasked: maskPhone(row.phone), reason: 'phone is already used by another account in the target' });
          else report.orphansSkipped++;
        }
        if (t === 'accounts' && (await accountPresent(client, row.sub as string))) presentSubs.add(row.sub as string);
        if (t === 'organizations' && (await client.query(`SELECT 1 FROM organizations WHERE org_id = $1`, [row.org_id])).rowCount) presentOrgs.add(row.org_id as string);
      }
    }
    await client.query(o.confirm ? 'COMMIT' : 'ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return report;
}

async function accountPresent(c: pg.PoolClient, sub: string): Promise<boolean> {
  return ((await c.query(`SELECT 1 FROM accounts WHERE sub = $1`, [sub])).rowCount ?? 0) > 0;
}

export interface RollbackManifest { format: 'kiorex-passport-identity-rollback'; version: 1; targetEnv: string; sourceEnv: string; createdAt: string; rows: PromotionReport['rollback'] }
export const manifestFrom = (r: PromotionReport, now = new Date()): RollbackManifest => ({ format: 'kiorex-passport-identity-rollback', version: 1, targetEnv: r.targetEnv, sourceEnv: r.sourceEnv, createdAt: now.toISOString(), rows: r.rollback });

/** Removes exactly the rows a confirmed import created (by key), plus the per-person state created for those subs since (passkeys, TOTP, sessions, OTP-free state). Dry run rolls back. */
export async function rollbackImport(pool: pg.Pool, m: RollbackManifest, o: { confirm: boolean }): Promise<Record<string, number>> {
  if (m?.format !== 'kiorex-passport-identity-rollback' || m.version !== 1) throw new Error('not a rollback manifest');
  const client = await pool.connect();
  const removed: Record<string, number> = {};
  try {
    await client.query('BEGIN');
    const del = async (table: string, where: string, params: unknown[]) => { removed[table] = (removed[table] ?? 0) + ((await client.query(`DELETE FROM ${table} WHERE ${where}`, params)).rowCount ?? 0); };
    for (const t of [...ORDER].reverse()) {
      for (const k of m.rows[t] ?? []) {
        if (t === 'accounts') for (const child of ['passkeys', 'totp_credentials', 'session_meta', 'email_verifications', 'interaction_state']) await del(child, 'sub = $1', [k.sub]);
        await del(t, KEYS[t].map((c, i) => `${c} = $${i + 1}`).join(' AND '), KEYS[t].map((c) => k[c]));
      }
    }
    await client.query(o.confirm ? 'COMMIT' : 'ROLLBACK');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return removed;
}

export function formatPromotionReport(r: PromotionReport): string {
  const L = [`identity:promote ${r.sourceEnv} -> ${r.targetEnv} (${r.mode === 'confirmed' ? 'CONFIRMED: rows written' : 'DRY RUN: nothing written, pass --confirm to import'}); export taken ${r.exportedAt}`];
  for (const t of TABLES) L.push(`  ${t.padEnd(22)} insert ${String(r.inserted[t]).padStart(5)}   already there ${String(r.existingKept[t]).padStart(5)}`);
  L.push(`  demo-tagged rows excluded: ${r.excludedDemo}${r.includeDemo ? ' (--include-demo given: none excluded)' : ''}; orphan rows skipped: ${r.orphansSkipped}`);
  for (const c of r.conflicts) L.push(`  CONFLICT ${c.sub} ${c.phoneMasked}: ${c.reason}`);
  L.push('  rollback: a confirmed run writes a manifest; `identity:promote -- --rollback <manifest> --confirm` removes exactly those rows (see Docs/IDENTITY_PROMOTION.md)');
  return L.join('\n');
}

/** The declared environment id of the process (KX_ENV, then KIOREX_ENV, ENV_TAG with a `kx-` prefix removed), or null. */
export function declaredEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = (env.KX_ENV ?? env.KIOREX_ENV ?? env.ENV_TAG ?? '').trim().toLowerCase().replace(/^kx-/, '');
  return v === '' ? null : v === 'pro' ? 'prod' : v;
}
