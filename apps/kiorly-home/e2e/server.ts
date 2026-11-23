/**
 * Throwaway dev IdP for the Kiorly Home E2E: own port + own Postgres schema (dropped and recreated), real dev-idp code, the real
 * persona seed (config/seed-users.json + the organisations/memberships of config/seed-demo.json, incl. product refs). Messaging is
 * mocked (dev inbox). Never touches the shared dev IdP on :4400.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createApp } from '../../dev-idp/src/app.js';
import { loadIdpConfig, runtimeFromEnv } from '../../dev-idp/src/config.js';
import { createPool, dropSchema } from '../../dev-idp/src/db.js';

const port = Number(process.env.KX_HOME_E2E_IDP_PORT ?? 4455);
const schema = `kx_e2e_home_${port}`;
const issuer = `http://localhost:${port}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cfg = structuredClone(loadIdpConfig());
for (const c of cfg.clients) delete c.environments.local.backchannelLogoutUri;
const runtime = { ...runtimeFromEnv(cfg, { PORT: String(port), ISSUER: issuer, KX_DB_SCHEMA: schema, NODE_ENV: 'test', KX_FAKE_UPSTREAM_PORT: '0' }), passkeysEnabled: false, providerSsoEnabled: false };
const pool = createPool(runtime.databaseUrl, schema);
await dropSchema(pool, schema).catch(() => undefined);
await pool.end();
const idp = await createApp({ runtime, cfg, quiet: true });

const users = JSON.parse(readFileSync(path.join(root, 'config/seed-users.json'), 'utf8')).users as Array<{ sub: string; phone: string; name: string; locale: string; roles: string[] }>;
const demo = JSON.parse(readFileSync(path.join(root, 'config/seed-demo.json'), 'utf8')).organizations as Array<{ orgId: string; legalName: string; country: string; owner: string; edition?: string; productRefs?: object; members: Array<{ sub: string; role: string }> }>;
const q = (sql: string, p: unknown[] = []) => idp.pool.query(sql, p);
for (const u of users) {
  await q(`INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles) VALUES ($1,$2,true,$3,$4,$5) ON CONFLICT (sub) DO NOTHING`, [u.sub, u.phone, u.name, u.locale, JSON.stringify(u.roles)]);
}
for (const o of demo) {
  await q(`INSERT INTO organizations (org_id, legal_name, country, product_refs, edition, created_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (org_id) DO NOTHING`, [o.orgId, o.legalName, o.country, JSON.stringify(o.productRefs ?? {}), o.edition ?? 'CLINIC', o.owner]);
  for (const m of o.members) await q(`INSERT INTO memberships (id, org_id, sub, role_hint, invited_by) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`, [`demo_mem_${o.orgId}_${m.sub.slice(-4)}`, o.orgId, m.sub, m.role, o.owner]);
}
console.log(`[e2e] Passport dev IdP for Kiorly Home on ${issuer} (schema ${schema})`);
const stop = async () => { try { await dropSchema(idp.pool, schema); } catch { /* ignore */ } await idp.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
