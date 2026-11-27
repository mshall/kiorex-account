import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assertNotProduction } from '../src/guard.js';
import { devTestUsersEnabled } from '../src/dev-test-users.js';
import { loadIdpConfig, runtimeFromEnv } from '../src/config.js';
import { isPublicDeployment, publicModeProblems } from '../src/public-mode.js';
import { createApp, type DevIdp } from '../src/app.js';
import { dropSchema } from '../src/db.js';
import { Accounts } from '../src/accounts.js';

const cfg = loadIdpConfig(undefined, {});
const GOOD = {
  ISSUER: 'https://account.dev.example.com', DATABASE_URL: 'postgresql://u:p@db.example.com/kx', NODE_ENV: 'development',
  KX_COOKIE_KEYS: 'k'.repeat(32), KX_WORKSPACE_URL_CLINIC: 'https://clinic.dev.example.com', KX_WORKSPACE_URL_PHARMACY: 'https://pharmacy.dev.example.com', KX_WORKSPACE_URL_LAB: 'https://lab.dev.example.com',
};
const problems = (env: NodeJS.ProcessEnv, conf = [{ clientId: 'kiorly-clinic', secretOverridden: true }]) => publicModeProblems({ env, issuer: env.ISSUER ?? '', confidentialClients: conf });

describe('the production refusal is unchanged', () => {
  it('refuses production in every spelling, with or without the public flag', () => {
    for (const k of ['NODE_ENV', 'KX_ENV', 'APP_ENV']) for (const v of ['production', 'PROD']) {
      expect(() => assertNotProduction({ [k]: v } as never)).toThrow();
      expect(() => assertNotProduction({ [k]: v, DEV_IDP_PUBLIC: 'true', KX_DEV_OTP_BYPASS: 'true' } as never)).toThrow();
    }
    expect(() => assertNotProduction({ NODE_ENV: 'development', DEV_IDP_PUBLIC: 'true' } as never)).not.toThrow();
  });
});

describe('public mode detection', () => {
  it('local defaults are untouched: localhost issuer, no flag', () => {
    expect(isPublicDeployment({}, 'http://localhost:4400')).toBe(false);
    expect(isPublicDeployment({}, undefined)).toBe(false);
    const rt = runtimeFromEnv(cfg, { PORT: '4499' });
    expect(rt).toMatchObject({ host: '127.0.0.1', publicMode: false, devOtpBypass: true, devEndpoints: true, issuer: 'http://localhost:4499' });
    expect(rt.cookieKeys).toBeUndefined();
    expect(devTestUsersEnabled({ NODE_ENV: 'development' })).toBe(true);
  });
  it('is on with DEV_IDP_PUBLIC=true or any non-loopback issuer (a forgotten flag cannot leave a public host permissive)', () => {
    expect(isPublicDeployment({ DEV_IDP_PUBLIC: 'true' }, 'http://localhost:4400')).toBe(true);
    expect(isPublicDeployment({}, 'https://account.dev.example.com')).toBe(true);
    expect(isPublicDeployment({ ISSUER: 'http://10.0.0.5:4400' })).toBe(true);
  });
  it('public mode turns the demo OTP, the /dev routes and the quick-pick users OFF unless each is enabled explicitly', () => {
    const off = runtimeFromEnv(cfg, { ...GOOD });
    expect(off).toMatchObject({ publicMode: true, devOtpBypass: false, devEndpoints: false, cookieKeys: ['k'.repeat(32)] });
    expect(devTestUsersEnabled({ ...GOOD })).toBe(false);
    const on = runtimeFromEnv(cfg, { ...GOOD, KX_DEV_OTP_BYPASS: 'true', KX_DEV_ENDPOINTS: 'true', HOST: '0.0.0.0' });
    expect(on).toMatchObject({ devOtpBypass: true, devEndpoints: true, host: '0.0.0.0' });
    expect(devTestUsersEnabled({ ...GOOD, KX_DEV_OTP_BYPASS: 'true' })).toBe(true);
    expect(devTestUsersEnabled({ ...GOOD, KX_DEV_OTP_BYPASS: 'true', KX_DEV_TEST_USERS: 'false' })).toBe(false);
  });
});

describe('public mode start-up checks', () => {
  it('a complete configuration has no problems', () => { expect(problems(GOOD)).toEqual([]); });
  it('rejects each missing or unsafe value', () => {
    expect(problems({ ...GOOD, ISSUER: 'http://account.dev.example.com' }).join()).toMatch(/ISSUER must be the final public https/);
    expect(problems({ ...GOOD, ISSUER: 'https://localhost:4400' }).join()).toMatch(/ISSUER must be the final public https/);
    expect(problems({ ...GOOD, ISSUER: 'https://account.dev.example.com/idp' }).join()).toMatch(/origin only/);
    expect(problems({ ...GOOD, DATABASE_URL: undefined }).join()).toMatch(/DATABASE_URL/);
    expect(problems({ ...GOOD, KX_COOKIE_KEYS: undefined }).join()).toMatch(/KX_COOKIE_KEYS/);
    expect(problems({ ...GOOD, KX_COOKIE_KEYS: 'short' }).join()).toMatch(/KX_COOKIE_KEYS/);
    expect(problems({ ...GOOD, KX_WORKSPACE_URL_LAB: undefined }).join()).toMatch(/KX_WORKSPACE_URL_LAB/);
    expect(problems({ ...GOOD, KX_WORKSPACE_URL_CLINIC: 'http://localhost:5174' }).join()).toMatch(/KX_WORKSPACE_URL_CLINIC/);
    expect(problems(GOOD, [{ clientId: 'kiorly-clinic', secretOverridden: false }]).join()).toMatch(/kiorly-clinic still has the committed dev secret/);
  });
});

describe('a public-mode server', () => {
  let idp: DevIdp; const port = 4700 + (process.pid % 150); const schema = `kx_test_pub_${process.pid}_${port}`;
  beforeAll(async () => {
    const runtime = { ...runtimeFromEnv(cfg, { PORT: String(port), ISSUER: `http://localhost:${port}`, KX_DB_SCHEMA: schema, KX_TRUST_PROXY: 'true', DEV_IDP_PUBLIC: 'true', KX_COOKIE_KEYS: 'c'.repeat(40), KX_FAKE_UPSTREAM_PORT: '0' }), providerSsoEnabled: false };
    idp = await createApp({ runtime, cfg: structuredClone(cfg), quiet: true, env: {} });
  });
  afterAll(async () => { await dropSchema(idp.pool, schema).catch(() => undefined); await idp.close(); });
  it('hides every /dev route and keeps health and discovery', async () => {
    for (const p of ['/dev/inbox', '/dev/events', '/dev/delivery-status']) expect((await fetch(`${idp.issuer}${p}`)).status, p).toBe(404);
    expect((await fetch(`${idp.issuer}/dev/reset-rate-limits`, { method: 'POST' })).status).toBe(404);
    expect((await fetch(`${idp.issuer}/healthz`)).status).toBe(200);
    expect((await fetch(`${idp.issuer}/.well-known/openid-configuration`)).status).toBe(200);
  });
  it('registers no demo-OTP numbers, so 000000 is never accepted', () => { expect(idp.testNumbers).toEqual([]); });
  it('never writes the published dev TOTP secrets, and a restart never reverts what an operator provisioned', async () => {
    const withTotp = idp.seedUsers.filter((u) => u.totpSecret);
    expect(withTotp.length).toBeGreaterThan(0); // the published seed does carry them, which is why a hosted database must not receive them
    expect((await idp.pool.query(`SELECT count(*)::int AS n FROM totp_credentials`)).rows[0].n).toBe(0);
    const sub = withTotp[0]!.sub;
    await idp.pool.query(`UPDATE accounts SET roles = roles || '["owner"]'::jsonb, name = 'Operator edit' WHERE sub = $1`, [sub]);
    await idp.pool.query(`INSERT INTO totp_credentials (sub, secret, confirmed_at) VALUES ($1, 'GENERATEDOUTSIDEGIT', now())`, [sub]);
    await new Accounts(idp.pool).seed(idp.seedUsers, { hosted: true }); // what every container start does
    const a = (await idp.pool.query(`SELECT roles, name FROM accounts WHERE sub = $1`, [sub])).rows[0];
    expect(a.roles).toContain('owner'); expect(a.name).toBe('Operator edit');
    expect((await idp.pool.query(`SELECT secret FROM totp_credentials WHERE sub = $1`, [sub])).rows[0].secret).toBe('GENERATEDOUTSIDEGIT');
  });
});
