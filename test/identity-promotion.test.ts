import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { createPool, dropSchema, migrate } from '../apps/dev-idp/src/db.js';
import { DEFAULT_PROMOTION_MODE, PromotionRefusedError, assertCarryMode, parsePromotionMode } from '../apps/dev-idp/src/promotion-mode.js';
import { runtimeFromEnv, loadIdpConfig } from '../apps/dev-idp/src/config.js';
import { declaredEnv, exportIdentities, formatPromotionReport, importIdentities, manifestFrom, parseExport, rollbackImport } from '../scripts/lib/identity-promotion.js';

const URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account';
const src = `kx_test_promo_src_${process.pid}`;
const dst = `kx_test_promo_dst_${process.pid}`;
let a: pg.Pool; let b: pg.Pool;
const n = async (p: pg.Pool, t: string, w = 'true') => (await p.query(`SELECT count(*)::int c FROM ${t} WHERE ${w}`)).rows[0].c as number;

beforeAll(async () => {
  a = createPool(URL, src); b = createPool(URL, dst);
  await migrate(a, src); await migrate(b, dst);
  await a.query(`INSERT INTO accounts (sub, phone, phone_verified, name, email, email_verified) VALUES ('R1','+201666000001',true,'Real One','r1@example.org',true),('R2','+201666000002',true,'Real Two',NULL,false)`);
  await a.query(`INSERT INTO accounts (sub, phone, phone_verified, name, data_class) VALUES ('D1','+201666000009',true,'Demo One','DEMO')`);
  await a.query(`INSERT INTO accounts (sub, name, kind) VALUES ('R2KID','Real Kid','dependant')`);
  await a.query(`INSERT INTO organizations (org_id, legal_name, country, created_by) VALUES ('org_r','Real Org','EG','R1')`);
  await a.query(`INSERT INTO organizations (org_id, legal_name, country, created_by, data_class) VALUES ('org_d','Demo Org','EG','D1','DEMO')`);
  await a.query(`INSERT INTO memberships (id, org_id, sub, role_hint) VALUES ('mr','org_r','R1','owner'),('md','org_d','D1','owner'),('mx','org_d','R1','staff')`);
  await a.query(`INSERT INTO guardian_links (id, guardian_sub, dependant_sub, relationship, evidence, expires_at) VALUES ('gr','R2','R2KID','parent','{"type":"self_declared"}', now() + interval '5 years')`);
  await a.query(`INSERT INTO totp_credentials (sub, secret) VALUES ('R1','SECRET')`);
  await a.query(`INSERT INTO passkeys (credential_id, sub, public_key) VALUES ('pk1','R1','\\x00')`);
  await a.query(`INSERT INTO account_contacts (sub, type, value) VALUES ('R1','phone','+201666000111')`);
});
afterAll(async () => { await dropSchema(a, src); await dropSchema(b, dst); await a.end(); await b.end(); });

describe('IDENTITY_PROMOTION_MODE', () => {
  it('defaults to ask; carry and separate parse; anything else is an error', () => {
    expect(DEFAULT_PROMOTION_MODE).toBe('ask');
    expect(parsePromotionMode({})).toBe('ask');
    expect(parsePromotionMode({ IDENTITY_PROMOTION_MODE: ' Carry ' })).toBe('carry');
    expect(parsePromotionMode({ IDENTITY_PROMOTION_MODE: 'separate' })).toBe('separate');
    expect(() => parsePromotionMode({ IDENTITY_PROMOTION_MODE: 'yes' })).toThrow(/ask \| carry \| separate/);
  });
  it('only carry passes the gate; ask and separate refuse', () => {
    expect(() => assertCarryMode('carry')).not.toThrow();
    expect(() => assertCarryMode('ask')).toThrow(PromotionRefusedError);
    expect(() => assertCarryMode('separate')).toThrow(/separate/);
  });
  it('is part of the runtime options and a typo fails at start-up', () => {
    expect(runtimeFromEnv(loadIdpConfig(undefined, {}), {}).identityPromotionMode).toBe('ask');
    expect(() => runtimeFromEnv(loadIdpConfig(undefined, {}), { IDENTITY_PROMOTION_MODE: 'cary' })).toThrow();
  });
  it('declaredEnv reads KX_ENV, KIOREX_ENV or ENV_TAG (kx- prefix and kx-pro tolerated)', () => {
    expect(declaredEnv({})).toBeNull();
    expect(declaredEnv({ KX_ENV: 'Pilot' })).toBe('pilot');
    expect(declaredEnv({ ENV_TAG: 'kx-test' })).toBe('test');
    expect(declaredEnv({ ENV_TAG: 'kx-pro' })).toBe('prod');
  });
  it('the CLIs refuse with exit 3 under the default mode, before touching any database', () => {
    for (const script of ['scripts/identity-export.ts', 'scripts/identity-promote.ts']) {
      const r = spawnSync('npx', ['tsx', script, '--dry-run'], { env: { ...process.env, IDENTITY_PROMOTION_MODE: '', DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/none' }, encoding: 'utf8' });
      expect(r.status, script).toBe(3);
      expect(r.stderr).toMatch(/"ask"/);
    }
    const sep = spawnSync('npx', ['tsx', 'scripts/identity-promote.ts', '--from', 'x.json'], { env: { ...process.env, IDENTITY_PROMOTION_MODE: 'separate' }, encoding: 'utf8' });
    expect(sep.status).toBe(3);
  });
});

describe('identity export and import (carry)', () => {
  it('exports live identities only, without demo rows, secrets or passkeys', async () => {
    const e = await exportIdentities(a, { sourceEnv: 'test', includeDemo: false });
    expect(e.data.accounts.map((x) => x.sub).sort()).toEqual(['R1', 'R2', 'R2KID']);
    expect(e.data.organizations.map((x) => x.org_id)).toEqual(['org_r']);
    expect(e.data.memberships.map((x) => x.id)).toEqual(['mr']); // mx (real member of a demo org) and md go with the demo org
    expect(JSON.stringify(e)).not.toMatch(/SECRET|pk1/);
    expect(Object.keys(e.data)).not.toContain('totp_credentials');
    expect(parseExport(JSON.stringify(e)).checksum).toBe(e.checksum);
  });

  it('detects an edited file', async () => {
    const e = await exportIdentities(a, { sourceEnv: 'test', includeDemo: false });
    e.data.accounts[0]!.name = 'Tampered';
    expect(() => parseExport(JSON.stringify(e))).toThrow(/checksum/);
  });

  it('dry run is exact and writes nothing; confirm imports; a rerun inserts nothing', async () => {
    const file = parseExport(JSON.stringify(await exportIdentities(a, { sourceEnv: 'test', includeDemo: false })));
    const dry = await importIdentities(b, file, { targetEnv: 'pilot', includeDemo: false, confirm: false });
    expect(dry.mode).toBe('dry-run');
    expect(dry.inserted.accounts).toBe(3);
    expect(dry.inserted.guardian_links).toBe(1);
    expect(await n(b, 'accounts')).toBe(0);
    const done = await importIdentities(b, file, { targetEnv: 'pilot', includeDemo: false, confirm: true });
    expect(done.inserted).toMatchObject({ accounts: 3, organizations: 1, memberships: 1, guardian_links: 1, account_contacts: 1 });
    expect(await n(b, 'accounts')).toBe(3);
    expect((await b.query(`SELECT email, email_verified, roles FROM accounts WHERE sub='R1'`)).rows[0]).toMatchObject({ email: 'r1@example.org', email_verified: true, roles: ['patient'] });
    expect(await n(b, 'totp_credentials')).toBe(0);
    expect(await n(b, 'passkeys')).toBe(0);
    const again = await importIdentities(b, file, { targetEnv: 'pilot', includeDemo: false, confirm: true });
    expect(Object.values(again.inserted).reduce((x, y) => x + y, 0)).toBe(0);
    expect(again.existingKept.accounts).toBe(3);
    expect(formatPromotionReport(done)).toMatch(/CONFIRMED/);
  });

  it('refuses the same source and target environment', async () => {
    const file = parseExport(JSON.stringify(await exportIdentities(a, { sourceEnv: 'test', includeDemo: false })));
    await expect(importIdentities(b, file, { targetEnv: 'test', includeDemo: false, confirm: false })).rejects.toThrow(/nothing to promote/);
  });

  it('demo rows are excluded unless --include-demo, and a demo-containing file is filtered again on import', async () => {
    const full = parseExport(JSON.stringify(await exportIdentities(a, { sourceEnv: 'test', includeDemo: true })));
    expect(full.data.accounts.some((x) => x.sub === 'D1')).toBe(true);
    const c = createPool(URL, `kx_test_promo_c_${process.pid}`);
    try {
      await migrate(c, `kx_test_promo_c_${process.pid}`);
      const r = await importIdentities(c, full, { targetEnv: 'pilot', includeDemo: false, confirm: true });
      expect(r.excludedDemo).toBeGreaterThan(0);
      expect(await n(c, 'accounts', `sub = 'D1'`)).toBe(0);
      const r2 = await importIdentities(c, full, { targetEnv: 'pilot', includeDemo: true, confirm: true });
      expect(await n(c, 'accounts', `sub = 'D1' AND data_class = 'DEMO'`)).toBe(1); // stays tagged DEMO so it can be removed later
      expect(r2.excludedDemo).toBe(0);
    } finally { await dropSchema(c, `kx_test_promo_c_${process.pid}`); await c.end(); }
  });

  it('never overwrites: an existing sub is kept and a phone owned by another sub is a reported conflict', async () => {
    const d = createPool(URL, `kx_test_promo_d_${process.pid}`);
    try {
      await migrate(d, `kx_test_promo_d_${process.pid}`);
      await d.query(`INSERT INTO accounts (sub, phone, name) VALUES ('R1','+201666000001','Target name'),('OTHER','+201666000002','Someone else')`);
      const file = parseExport(JSON.stringify(await exportIdentities(a, { sourceEnv: 'test', includeDemo: false })));
      const r = await importIdentities(d, file, { targetEnv: 'prod', includeDemo: false, confirm: true });
      expect((await d.query(`SELECT name FROM accounts WHERE sub='R1'`)).rows[0].name).toBe('Target name');
      expect(r.existingKept.accounts).toBe(1);
      expect(r.conflicts).toHaveLength(1);
      expect(r.conflicts[0]).toMatchObject({ sub: 'R2' });
      expect(r.conflicts[0]!.phoneMasked).not.toContain('666000002');
      expect(await n(d, 'accounts', `sub = 'R2'`)).toBe(0);
      expect(await n(d, 'guardian_links')).toBe(0); // the guardian is missing, so the link is not carried
      expect(r.orphansSkipped).toBeGreaterThan(0);
    } finally { await dropSchema(d, `kx_test_promo_d_${process.pid}`); await d.end(); }
  });

  it('rollback removes exactly what a confirmed import created (dry run first)', async () => {
    const e = createPool(URL, `kx_test_promo_e_${process.pid}`);
    try {
      await migrate(e, `kx_test_promo_e_${process.pid}`);
      await e.query(`INSERT INTO accounts (sub, phone, name) VALUES ('KEEP','+201666000555','Pre-existing')`);
      const file = parseExport(JSON.stringify(await exportIdentities(a, { sourceEnv: 'test', includeDemo: false })));
      const r = await importIdentities(e, file, { targetEnv: 'prod', includeDemo: false, confirm: true });
      const manifest = JSON.parse(JSON.stringify(manifestFrom(r)));
      await e.query(`INSERT INTO totp_credentials (sub, secret) VALUES ('R1','new-enrolment')`); // activity after the import goes too
      expect(await rollbackImport(e, manifest, { confirm: false })).toMatchObject({ accounts: 3 });
      expect(await n(e, 'accounts')).toBe(4);
      await rollbackImport(e, manifest, { confirm: true });
      expect((await e.query(`SELECT sub FROM accounts`)).rows.map((x) => x.sub)).toEqual(['KEEP']);
      expect(await n(e, 'organizations')).toBe(0);
      expect(await n(e, 'totp_credentials')).toBe(0);
    } finally { await dropSchema(e, `kx_test_promo_e_${process.pid}`); await e.end(); }
  });
});
