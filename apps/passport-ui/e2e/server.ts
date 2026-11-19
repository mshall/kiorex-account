/**
 * Throwaway dev IdP for the Playwright E2E suite: own port + own Postgres schema, dropped and recreated on start.
 * Messaging is mocked (dev inbox); back-channel logout targets are removed so nothing leaves the machine.
 */
import { createApp } from '../../dev-idp/src/app.js';
import { loadIdpConfig, runtimeFromEnv } from '../../dev-idp/src/config.js';
import { createPool, dropSchema } from '../../dev-idp/src/db.js';

const port = Number(process.env.KX_E2E_PORT ?? 4450);
const schema = `kx_e2e_${port}`;
const issuer = `http://localhost:${port}`;
const cfg = structuredClone(loadIdpConfig());
for (const c of cfg.clients) delete c.environments.local.backchannelLogoutUri;
const runtime = {
  ...runtimeFromEnv(cfg, { PORT: String(port), ISSUER: issuer, KX_DB_SCHEMA: schema, NODE_ENV: 'test', KX_FAKE_UPSTREAM_PORT: '0' }),
  passkeysEnabled: true, providerSsoEnabled: false,
};
const pool = createPool(runtime.databaseUrl, schema);
await dropSchema(pool, schema).catch(() => undefined);
await pool.end();
const idp = await createApp({ runtime, cfg, quiet: true });
console.log(`[e2e] Passport dev IdP on ${issuer}/account (schema ${schema})`);
const stop = async () => { try { await dropSchema(idp.pool, schema); } catch { /* ignore */ } await idp.close(); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
