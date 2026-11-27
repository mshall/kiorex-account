import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createPool, dropSchema, migrate } from '../apps/dev-idp/src/db.js';
import { Accounts } from '../apps/dev-idp/src/accounts.js';
import { loadSeedUsers } from '../apps/dev-idp/src/config.js';
import { REMOVAL_STEPS, planDemoRemoval, removeDemoData } from '../scripts/lib/demo-data.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account';
const schema = `kx_test_demo_${process.pid}`;
let pool: pg.Pool;
const q = (sql: string, p: unknown[] = []) => pool.query(sql, p);
const n = async (table: string, where = 'true') => (await q(`SELECT count(*)::int c FROM ${table} WHERE ${where}`)).rows[0].c as number;

beforeAll(async () => {
  pool = createPool(URL, schema);
  await migrate(pool, schema);
  await new Accounts(pool).seed(loadSeedUsers()); // the real dev seed path: tags DEMO
  // a demo organisation with a demo member and one REAL member, a demo dependant guarded by a REAL guardian, and REAL data of its own
  await q(`INSERT INTO accounts (sub, phone, phone_verified, name) VALUES ('REAL01','+201555000001',true,'Real Person'),('REAL02','+201555000002',true,'Real Guardian')`);
  await q(`INSERT INTO accounts (sub, name, kind, data_class) VALUES ('DEMOKID',  'Demo Kid', 'dependant', 'DEMO')`);
  await q(`INSERT INTO organizations (org_id, legal_name, country, created_by, data_class) VALUES ('org_demo_x','Demo Clinic','EG','01HZKX00000000000000000099','DEMO'),('org_real_y','Real Clinic','EG','REAL01','REAL')`);
  await q(`INSERT INTO memberships (id, org_id, sub, role_hint) VALUES ('m1','org_demo_x','01HZKX00000000000000000099','owner'),('m2','org_demo_x','REAL01','staff'),('m3','org_real_y','REAL01','owner')`);
  await q(`INSERT INTO guardian_links (id, guardian_sub, dependant_sub, relationship, evidence, expires_at) VALUES ('g1','REAL02','DEMOKID','parent','{}', now() + interval '1 year')`);
  await q(`INSERT INTO totp_credentials (sub, secret) VALUES ('REAL01','R')`);
});
afterAll(async () => { await dropSchema(pool, schema); await pool.end(); });

describe('demo data tagging and removal (Passport)', () => {
  it('the seed marks its users DEMO and real rows default to REAL', async () => {
    expect(await n('accounts', `data_class = 'DEMO'`)).toBe(loadSeedUsers().length + 1);
    expect((await q(`SELECT data_class FROM accounts WHERE sub = 'REAL01'`)).rows[0].data_class).toBe('REAL');
    expect((await q(`SELECT data_class FROM organizations WHERE org_id = 'org_real_y'`)).rows[0].data_class).toBe('REAL');
  });

  it('dry run reports and changes nothing', async () => {
    const before = await n('accounts');
    const r = await removeDemoData(pool, { confirm: false });
    expect(r.mode).toBe('dry-run');
    expect(r.rows.accounts).toBe(loadSeedUsers().length + 1);
    expect(r.rows.organizations).toBe(1);
    expect(r.realAccountsKept).toBe(2);
    expect(r.crossLinksWithReal).toEqual({ memberships: 1, guardianLinks: 1, linkRequests: 0 });
    expect(await n('accounts')).toBe(before);
    expect(await n('totp_credentials')).toBeGreaterThan(1); // demo TOTP secrets are still there after a dry run
  });

  it('every removal step selects only demo-owned rows (static guard against a widened WHERE)', () => {
    for (const s of REMOVAL_STEPS) expect(s.where, s.table).toMatch(/DEMO|data_class|demo/i);
  });

  it('confirm removes demo rows only: real accounts, real orgs, their memberships and secrets survive', async () => {
    const r = await removeDemoData(pool, { confirm: true });
    expect(r.mode).toBe('confirmed');
    expect(await n('accounts', `data_class = 'DEMO'`)).toBe(0);
    expect(await n('accounts')).toBe(2);
    expect((await q(`SELECT sub FROM accounts ORDER BY sub`)).rows.map((x) => x.sub)).toEqual(['REAL01', 'REAL02']);
    expect(await n('organizations')).toBe(1);
    expect(await n('memberships')).toBe(1);
    expect((await q(`SELECT id FROM memberships`)).rows[0].id).toBe('m3');
    expect(await n('guardian_links')).toBe(0); // dangling link to the removed demo dependant goes with it
    expect((await q(`SELECT sub FROM totp_credentials`)).rows.map((x) => x.sub)).toEqual(['REAL01']);
  });

  it('is idempotent: a second confirmed run removes nothing', async () => {
    const r = await removeDemoData(pool, { confirm: true });
    expect(r.total).toBe(0);
    expect((await planDemoRemoval(pool)).total).toBe(0);
    expect(await n('accounts')).toBe(2);
  });

  it('untagged rows that look like old seed rows are reported and never deleted', async () => {
    await q(`INSERT INTO accounts (sub, phone, name) VALUES ('01HZKX00000000000000000777','+201555000777','Legacy untagged')`);
    const r = await removeDemoData(pool, { confirm: true });
    expect(r.untaggedLegacySeedAccounts).toBe(1);
    expect(await n('accounts', `sub = '01HZKX00000000000000000777'`)).toBe(1);
  });
});
