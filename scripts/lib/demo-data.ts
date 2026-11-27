/**
 * Demo-data tagging and removal for Passport (Kiorex identity).
 *
 * Every seeded demo person, dependant and organisation carries data_class = 'DEMO' (apps/dev-idp/src/db.ts, seed-demo.ts, Accounts.seed).
 * Real sign-ups, SCIM provisioning and API-created organisations keep the default 'REAL'. The removal below deletes ONLY rows that belong to a
 * DEMO account or a DEMO organisation, in one transaction, and is idempotent (a second run finds nothing). It never deletes a REAL account or
 * REAL organisation; rows of a REAL account that merely point at demo data (a membership in a demo org, a guardian link to a demo dependant)
 * are dangling once the demo side is gone and are removed with it, and reported as `crossLinksWithReal` so a person can see them first.
 * audit_events is a hash-chained append-only log and is never rewritten (its demo rows are counted in `retained`).
 */
import type pg from 'pg';

type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

const DEMO_SUBS = `(SELECT sub FROM accounts WHERE data_class = 'DEMO')`;
const DEMO_ORGS = `(SELECT org_id FROM organizations WHERE data_class = 'DEMO')`;

/** Dependency order: children first. `where` may only select rows owned by a DEMO account or DEMO organisation. */
export const REMOVAL_STEPS: Array<{ table: string; where: string }> = [
  { table: 'scim_tokens', where: `org_id IN ${DEMO_ORGS}` },
  { table: 'scim_users', where: `org_id IN ${DEMO_ORGS} OR sub IN ${DEMO_SUBS}` },
  { table: 'invitations', where: `org_id IN ${DEMO_ORGS}` },
  { table: 'memberships', where: `org_id IN ${DEMO_ORGS} OR sub IN ${DEMO_SUBS}` },
  { table: 'organizations', where: `data_class = 'DEMO'` },
  { table: 'guardian_links', where: `guardian_sub IN ${DEMO_SUBS} OR dependant_sub IN ${DEMO_SUBS}` },
  { table: 'link_requests', where: `primary_sub IN ${DEMO_SUBS} OR secondary_sub IN ${DEMO_SUBS}` },
  { table: 'passkeys', where: `sub IN ${DEMO_SUBS}` },
  { table: 'totp_credentials', where: `sub IN ${DEMO_SUBS}` },
  { table: 'session_meta', where: `sub IN ${DEMO_SUBS}` },
  { table: 'email_verifications', where: `sub IN ${DEMO_SUBS}` },
  { table: 'interaction_state', where: `sub IN ${DEMO_SUBS}` },
  { table: 'account_contacts', where: `sub IN ${DEMO_SUBS}` },
  { table: 'federated_identities', where: `sub IN ${DEMO_SUBS}` },
  { table: 'dev_inbox', where: `recipient IN (SELECT phone FROM accounts WHERE data_class = 'DEMO' AND phone IS NOT NULL)` },
  { table: 'accounts', where: `data_class = 'DEMO'` },
];

export interface DemoRemovalReport {
  mode: 'dry-run' | 'confirmed';
  /** rows removed (or that would be removed in a dry run) per table */
  rows: Record<string, number>;
  total: number;
  /** REAL accounts that are never touched: how many exist and are untouched by this run */
  realAccountsKept: number;
  /** rows that connect a REAL account to demo data and go away with the demo side (listed so nobody is surprised) */
  crossLinksWithReal: { memberships: number; guardianLinks: number; linkRequests: number };
  /** rows deliberately kept */
  retained: { auditEventsForDemoSubs: number };
  /** accounts that look like seed rows (legacy sub pattern) but are not tagged DEMO: never deleted, re-run the seed to tag them */
  untaggedLegacySeedAccounts: number;
}

async function count(db: Queryable, sql: string): Promise<number> {
  return (await db.query(sql)).rows[0].c as number;
}

export async function planDemoRemoval(db: Queryable): Promise<DemoRemovalReport> {
  const rows: Record<string, number> = {};
  for (const s of REMOVAL_STEPS) rows[s.table] = await count(db, `SELECT count(*)::int c FROM ${s.table} WHERE ${s.where}`);
  const realSubs = `(SELECT sub FROM accounts WHERE data_class <> 'DEMO')`;
  return {
    mode: 'dry-run', rows, total: Object.values(rows).reduce((a, b) => a + b, 0),
    realAccountsKept: await count(db, `SELECT count(*)::int c FROM accounts WHERE data_class <> 'DEMO'`),
    crossLinksWithReal: {
      memberships: await count(db, `SELECT count(*)::int c FROM memberships WHERE (org_id IN ${DEMO_ORGS} AND sub IN ${realSubs}) OR (sub IN ${DEMO_SUBS} AND org_id NOT IN ${DEMO_ORGS})`),
      guardianLinks: await count(db, `SELECT count(*)::int c FROM guardian_links WHERE (guardian_sub IN ${DEMO_SUBS} AND dependant_sub IN ${realSubs}) OR (dependant_sub IN ${DEMO_SUBS} AND guardian_sub IN ${realSubs})`),
      linkRequests: await count(db, `SELECT count(*)::int c FROM link_requests WHERE (primary_sub IN ${DEMO_SUBS} AND secondary_sub IN ${realSubs}) OR (secondary_sub IN ${DEMO_SUBS} AND primary_sub IN ${realSubs})`),
    },
    retained: { auditEventsForDemoSubs: await count(db, `SELECT count(*)::int c FROM audit_events WHERE sub IN ${DEMO_SUBS}`) },
    untaggedLegacySeedAccounts: await count(db, `SELECT count(*)::int c FROM accounts WHERE data_class <> 'DEMO' AND (sub LIKE '01HZKX0%' OR sub LIKE '01HZKXD%')`),
  };
}

/** Plans, then (confirm only) deletes in ONE transaction. Dry run changes nothing. */
export async function removeDemoData(pool: pg.Pool, opts: { confirm: boolean }): Promise<DemoRemovalReport> {
  if (!opts.confirm) return planDemoRemoval(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const report = await planDemoRemoval(client);
    for (const s of REMOVAL_STEPS) await client.query(`DELETE FROM ${s.table} WHERE ${s.where}`);
    await client.query('COMMIT');
    return { ...report, mode: 'confirmed' };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export function formatDemoReport(r: DemoRemovalReport): string {
  const lines = [`demo-data:remove (${r.mode === 'confirmed' ? 'CONFIRMED: rows deleted' : 'DRY RUN: nothing deleted, pass --confirm to delete'})`];
  for (const [t, n] of Object.entries(r.rows)) lines.push(`  ${t.padEnd(22)} ${n}`);
  lines.push(`  total ${r.total}; real accounts kept untouched: ${r.realAccountsKept}`);
  const x = r.crossLinksWithReal;
  if (x.memberships + x.guardianLinks + x.linkRequests) lines.push(`  note: rows linking a real account to demo data go with the demo side (memberships ${x.memberships}, guardian links ${x.guardianLinks}, link requests ${x.linkRequests})`);
  lines.push(`  audit events kept (append-only hash chain): ${r.retained.auditEventsForDemoSubs}`);
  if (r.untaggedLegacySeedAccounts) lines.push(`  warning: ${r.untaggedLegacySeedAccounts} account(s) match the seed pattern but are not tagged DEMO and are NOT removed; re-run the seed (it tags them) if they are demo`);
  return lines.join('\n');
}
