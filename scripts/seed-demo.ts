/**
 * Kiorex Passport DEV-ONLY demo seed (synthetic data, see TEST_DATA.md).
 *   npx tsx scripts/seed-demo.ts            idempotent upsert (also (re)applies config/seed-users.json accounts + TOTP)
 *   npx tsx scripts/seed-demo.ts --reset    first removes ONLY the demo records (subs 01HZKXD*, demo_* ids, org_demo_*)
 * The running dev IdP reads config/seed-users.json at boot for the 000000 OTP test-number list: restart it after the first run.
 */
import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.NODE_ENV === 'production') throw new Error('refusing to seed demo data in production');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account';
const reset = process.argv.includes('--reset');
const users = JSON.parse(readFileSync(join(root, 'config/seed-users.json'), 'utf8')).users as any[];
const demo = JSON.parse(readFileSync(join(root, 'config/seed-demo.json'), 'utf8'));
const pool = new pg.Pool({ connectionString: url });
const q = (sql: string, p: any[] = []) => pool.query(sql, p);
const rel = (spec: string) => { // "-8y" => date 8 years ago (always fresh)
  const n = Number(spec.slice(1, -1)); const d = new Date(); d.setUTCFullYear(d.getUTCFullYear() - n); d.setUTCDate(d.getUTCDate() - 40); return d.toISOString().slice(0, 10);
};
const DEMO = `sub LIKE '01HZKXD%'`;

if (reset) {
  const subs = "(SELECT sub FROM accounts WHERE sub LIKE '01HZKXD%')";
  await q(`DELETE FROM memberships WHERE org_id LIKE 'org_demo_%'`);
  await q(`DELETE FROM invitations WHERE id LIKE 'demo_inv_%'`);
  await q(`DELETE FROM organizations WHERE org_id LIKE 'org_demo_%'`);
  await q(`DELETE FROM guardian_links WHERE id LIKE 'demo_gl_%'`);
  await q(`DELETE FROM link_requests WHERE id LIKE 'demo_lr_%'`);
  await q(`DELETE FROM totp_credentials WHERE sub IN ${subs}`);
  await q(`DELETE FROM session_meta WHERE sub IN ${subs}`);
  await q(`DELETE FROM accounts WHERE ${DEMO}`);
  console.log('passport demo: reset demo records');
}

for (const u of users) {
  await q(`INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles) VALUES ($1,$2,true,$3,$4,$5)
           ON CONFLICT (sub) DO UPDATE SET phone=$2, phone_verified=true, name=$3, locale=$4, roles=$5, status='active', deleted_at=NULL`,
    [u.sub, u.phone, u.name, u.locale, JSON.stringify(u.roles)]);
  if (u.totpSecret) await q(`INSERT INTO totp_credentials (sub, secret, confirmed_at) VALUES ($1,$2,now())
           ON CONFLICT (sub) DO UPDATE SET secret=$2, confirmed_at=COALESCE(totp_credentials.confirmed_at, now()), last_step=0`, [u.sub, u.totpSecret]);
}
for (const d of demo.dependants) {
  await q(`INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles, kind, dob, market) VALUES ($1,NULL,false,$2,$3,'["patient"]','dependant',$4,'EG')
           ON CONFLICT (sub) DO UPDATE SET name=$2, dob=$4, status='active', deleted_at=NULL`, [d.sub, d.name, d.locale, rel(d.dob)]);
}
for (const g of demo.guardianLinks) {
  await q(`INSERT INTO guardian_links (id, guardian_sub, dependant_sub, relationship, evidence, status, expires_at)
           VALUES ($1,$2,$3,$4,$5,'active', now() + interval '10 years') ON CONFLICT (id) DO UPDATE SET status='active', ended_at=NULL`,
    [g.id, g.guardian, g.dependant, g.relationship, JSON.stringify({ type: g.evidence, reference: g.evidence === 'self_declared' ? undefined : 'DEMO-REF-0001' })]);
}
for (const o of demo.organizations) {
  await q(`INSERT INTO organizations (org_id, legal_name, country, product_refs, created_by) VALUES ($1,$2,$3,'{}',$4)
           ON CONFLICT (org_id) DO UPDATE SET legal_name=$2, status='active'`, [o.orgId, o.legalName, o.country, o.owner]);
  for (const m of o.members) {
    const id = `demo_mem_${o.orgId}_${m.sub.slice(-4)}`;
    await q(`INSERT INTO memberships (id, org_id, sub, role_hint, invited_by) VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (id) DO UPDATE SET role_hint=$4, status='active', ended_at=NULL`, [id, o.orgId, m.sub, m.role, o.owner]);
  }
}
for (const i of demo.invitations) {
  const th = createHash('sha256').update(i.tokenPlain).digest('hex');
  await q(`INSERT INTO invitations (id, org_id, role_hint, invitee_phone, token_hash, invited_by, expires_at)
           VALUES ($1,$2,$3,$4,$5,$6, now() + interval '7 days') ON CONFLICT (id) DO UPDATE SET expires_at = now() + interval '7 days', consumed_at=NULL, revoked_at=NULL`,
    [i.id, i.orgId, i.role, i.phone, th, demo.organizations.find((o: any) => o.orgId === i.orgId).owner]);
}
for (const l of demo.linkRequests) {
  await q(`INSERT INTO link_requests (id, primary_sub, secondary_sub, secondary_phone, status, conflicts, verified_at)
           VALUES ($1,$2,$3,$4,$5,'[]', now()) ON CONFLICT (id) DO UPDATE SET status=$5`, [l.id, l.primary, l.secondary, l.phone, l.status]);
}
// a few sessions / security events so "Security" pages are not empty
for (const sub of ['01HZKXD0000000000000001001', '01HZKXD0000000000000001005']) {
  await q(`INSERT INTO session_meta (session_uid, sub, user_agent, ip) VALUES ($1,$2,$3,'127.0.0.1') ON CONFLICT (session_uid) DO NOTHING`,
    [`demo_sess_${sub.slice(-4)}`, sub, 'Mozilla/5.0 (iPhone; DEMO) Safari']);
}
const n = (await q(`SELECT count(*)::int c FROM accounts WHERE ${DEMO}`)).rows[0].c;
console.log(`passport demo: ${n} demo accounts, ${demo.guardianLinks.length} guardian links, ${demo.organizations.length} orgs`);
await pool.end();
