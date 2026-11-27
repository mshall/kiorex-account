import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadIdpConfig } from '../apps/dev-idp/src/config.js';
import { buildClients } from '../apps/dev-idp/src/provider.js';
import { buildClientOverrides, secretEnvName, type RedirectRow } from '../scripts/lib/client-overrides.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureRows = JSON.parse(readFileSync(path.join(here, 'fixtures/redirect-rows.json'), 'utf8')) as RedirectRow[];
const REGISTRY = process.env.KX_REGISTRY_FILE || path.resolve(here, '../../_docs/registry/service-url-registry.yaml');
const hasRegistry = existsSync(REGISTRY) && existsSync(path.join(path.dirname(REGISTRY), 'validate-registry.mjs'));
const SECRET = 'a-generated-secret-of-32-characters';
const natives = [{ id: 'kiorly', schemes: ['kiorly'], redirect_paths: ['kiorly://auth/callback'] }, { id: 'kiorex', schemes: ['kiorex'], redirect_paths: ['kiorex://auth/callback'] }];

describe('buildClientOverrides (pure)', () => {
  const o = buildClientOverrides(fixtureRows, { env: 'test', issuerEnv: 'test', nativeClients: natives });
  it('maps registry clients to Passport clients; Nurse shares the Clinic client; the Passport SPA client is skipped', () => {
    expect(Object.keys(o).sort()).toEqual(['kiorex-mobile', 'kiorex-web', 'kiorly', 'kiorly-clinic', 'kiorly-home']);
    expect(o['kiorly-clinic']!.redirectUris).toEqual([
      'https://clinic.test.example.org/auth/kiorex/callback', 'https://legacy-cdn.example.net/auth/kiorex/callback', 'https://nurse.test.example.org/auth/kiorex/callback',
    ]);
  });
  it('lets a product sign out back to Kiorly Home and keeps the Home sign-in page for Home itself', () => {
    expect(o['kiorly-clinic']!.postLogoutRedirectUris).toContain('https://home.test.example.org/signin');
    expect(o['kiorly-home']!.postLogoutRedirectUris).toEqual(['https://home.test.example.org/signin']);
  });
  it('uses the registry gateway back-channel URI by default and the client origin without the product prefix in same-origin mode', () => {
    expect(o['kiorly-clinic']!.backchannelLogoutUri).toBe('https://gw.test.example.org/clinics/api/v1/auth/kiorex/backchannel-logout');
    expect(o['kiorly-home']!.backchannelLogoutUri).toBeUndefined();
    const s = buildClientOverrides(fixtureRows, { env: 'test', issuerEnv: 'test', backchannel: 'same-origin' });
    expect(s['kiorly-clinic']!.backchannelLogoutUri).toBe('https://clinic.test.example.org/api/v1/auth/kiorex/backchannel-logout');
    expect(s['kiorex-web']!.backchannelLogoutUri).toBe('https://site.test.example.org/api/v1/auth/backchannel-logout');
  });
  it('--origin-map adds another origin next to the registry one (and same-origin back-channel follows it)', () => {
    const m = buildClientOverrides(fixtureRows, { env: 'test', issuerEnv: 'test', originMap: { 'https://home.test.example.org': 'https://d111.cdn.example.net' }, backchannel: 'same-origin' });
    expect(m['kiorly-home']!.redirectUris).toEqual(['https://home.test.example.org/signin/callback', 'https://d111.cdn.example.net/signin/callback']);
  });
  it('native clients: production-class environments register the plain scheme only, others also <scheme>-<env>', () => {
    expect(o.kiorly).toEqual({ redirectUris: ['kiorly://auth/callback', 'kiorly-test://auth/callback'], postLogoutRedirectUris: ['kiorly://auth/logout', 'kiorly-test://auth/logout'] });
    const prod = buildClientOverrides(fixtureRows.map((r) => ({ ...r, env: 'prod' })), { env: 'prod', issuerEnv: 'prod', nativeClients: natives });
    expect(prod.kiorly!.redirectUris).toEqual(['kiorly://auth/callback']);
  });
  it('secrets only for clients that have an override; an unknown registry client or environment is an error', () => {
    expect(buildClientOverrides(fixtureRows, { env: 'test', issuerEnv: 'test', secrets: { 'kiorly-clinic': SECRET } })['kiorly-clinic']!.clientSecret).toBe(SECRET);
    expect(() => buildClientOverrides(fixtureRows, { env: 'test', issuerEnv: 'test', secrets: { nope: SECRET } })).toThrow(/no override/);
    expect(() => buildClientOverrides([{ ...fixtureRows[0]!, client: 'brand-new' }], { env: 'test', issuerEnv: 'test' })).toThrow(/no Passport client mapping/);
    expect(() => buildClientOverrides(fixtureRows, { env: 'staging', issuerEnv: 'staging' })).toThrow(/no registry rows/);
  });
  it('the output is accepted by the IdP start-up parser and reaches the registered clients', () => {
    const cfg = loadIdpConfig(undefined, { KX_CLIENT_OVERRIDES_JSON: JSON.stringify(buildClientOverrides(fixtureRows, { env: 'test', issuerEnv: 'test', nativeClients: natives, secrets: { 'kiorly-clinic': SECRET } })) });
    const c = buildClients(cfg).find((x) => x.client_id === 'kiorly-clinic')!;
    expect(c.redirect_uris).toContain('https://clinic.test.example.org/auth/kiorex/callback');
    expect(c.redirect_uris?.some((u) => u.includes('localhost'))).toBe(false);
    expect(c.client_secret).toBe(SECRET);
  });
  it('secretEnvName', () => { expect(secretEnvName('kiorly-clinic')).toBe('KX_CLIENT_SECRET_KIORLY_CLINIC'); });
});

const run = (extra: string[], env: Record<string, string> = {}) => spawnSync('npx', ['tsx', 'scripts/emit-client-overrides.ts', ...extra], { encoding: 'utf8', env: { ...process.env, KX_REGISTRY_FILE: '', ...env } });

describe('emit-client-overrides CLI', () => {
  const rows = path.join(here, 'fixtures/redirect-rows.json');
  it('--rows works without the registry; --format env quotes the JSON', () => {
    const r = run(['--env', 'test', '--rows', rows]);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout)['kiorly-home'].redirectUris).toEqual(['https://home.test.example.org/signin/callback']);
    const e = run(['--env', 'test', '--rows', rows, '--format', 'env']);
    expect(e.stdout.startsWith("KX_CLIENT_OVERRIDES_JSON='{")).toBe(true);
  });
  it('--with-secrets fails when a confidential secret is missing, and passes the value through when present', () => {
    const miss = run(['--env', 'test', '--rows', rows, '--with-secrets']);
    expect(miss.status).toBe(2);
    expect(miss.stderr).toContain('KX_CLIENT_SECRET_KIORLY_CLINIC');
    const ok = run(['--env', 'test', '--rows', rows, '--with-secrets'], { KX_CLIENT_SECRET_KIORLY_CLINIC: SECRET });
    expect(ok.status, ok.stderr).toBe(0);
    expect(JSON.parse(ok.stdout)['kiorly-clinic'].clientSecret).toBe(SECRET);
    expect(run(['--env', 'test', '--rows', rows]).stdout).not.toContain(SECRET);
  });
  it('rejects unknown arguments, a missing --env, a malformed --origin-map and a short secret', () => {
    expect(run(['--nope']).status).toBe(2);
    expect(run(['--rows', rows]).status).toBe(2);
    expect(run(['--env', 'test', '--rows', rows, '--origin-map', 'http://a=b']).status).toBe(2);
    expect(run(['--env', 'test', '--rows', rows, '--with-secrets'], { KX_CLIENT_SECRET_KIORLY_CLINIC: 'short' }).status).toBe(2);
  });
});

describe.skipIf(!hasRegistry)('against the real registry (workspace checkout)', () => {
  const load = async () => { const m = await import(pathToFileURL(path.join(path.dirname(REGISTRY), 'validate-registry.mjs')).href); return { m, reg: m.load(REGISTRY) }; };
  for (const env of ['dev', 'test', 'staging', 'pilot', 'prod']) {
    it(`${env}: emits valid overrides for every product client, every https host is a registry host`, async () => {
      const r = run(['--env', env]);
      expect(r.status, r.stderr).toBe(0);
      const out = JSON.parse(r.stdout) as Record<string, { redirectUris: string[]; postLogoutRedirectUris: string[]; backchannelLogoutUri?: string }>;
      // the booking widget host exists only in test, pilot and prod (registry envs)
      for (const id of [...(['test', 'pilot', 'prod'].includes(env) ? ['kiorex-widget'] : []), 'kiorex-web', 'kiorex-ops', 'kiorly-home', 'kiorly-clinic', 'kiorly-pharmacy-web', 'kiorly-lab-web', 'kiorly', 'kiorex-mobile']) expect(out[id], id).toBeTruthy();
      const { m, reg } = await load();
      const hosts = new Set<string>([...m.expand(reg).map((h: { host: string }) => h.host), ...(reg.legacy_hosts ?? []).map((l: { host: string }) => l.host)]);
      for (const e of Object.values(out)) for (const u of [...e.redirectUris, ...e.postLogoutRedirectUris, ...(e.backchannelLogoutUri ? [e.backchannelLogoutUri] : [])]) {
        if (u.startsWith('https://')) expect(hosts.has(new URL(u).host), u).toBe(true);
        else expect(u).toMatch(/^[a-z][a-z0-9+.-]*:\/\//);
      }
      loadIdpConfig(undefined, { KX_CLIENT_OVERRIDES_JSON: r.stdout.trim() }); // the IdP accepts it
    });
  }
  it('test: Clinic also registers the live default CloudFront host (legacy_hosts); Home is app.<env>', async () => {
    const out = JSON.parse(run(['--env', 'test']).stdout);
    const { reg } = await load();
    const legacy = reg.legacy_hosts.find((l: { env: string; service: string }) => l.env === 'test' && l.service === 'kiorly.clinics').host;
    expect(out['kiorly-clinic'].redirectUris).toContain(`https://${legacy}/auth/kiorex/callback`);
    expect(out['kiorly-home'].redirectUris.every((u: string) => /^https:\/\/app\.test\./.test(u))).toBe(true);
    expect(out.kiorly.redirectUris).toContain('kiorly-test://auth/callback');
  });
  it('pilot is served by the production IdP: both pilot and prod URIs, the prod back-channel, and no -pilot native scheme', async () => {
    const out = JSON.parse(run(['--env', 'pilot']).stdout);
    const uris: string[] = out['kiorly-home'].redirectUris;
    expect(uris.some((u) => /^https:\/\/app\.pilot\./.test(u))).toBe(true);
    expect(uris.some((u) => /^https:\/\/app\.kiorly\./.test(u))).toBe(true);
    expect(out['kiorly-clinic'].backchannelLogoutUri).toMatch(/^https:\/\/api\.kiorly\./);
    expect(out.kiorly.redirectUris).toEqual(['kiorly://auth/callback']);
  });
  it('first stand-up on default CDN hostnames: --origin-map adds them and --backchannel same-origin targets them', async () => {
    const { m, reg } = await load();
    const home = `https://${m.hostOf(reg, 'kiorly.app', 'test')}`;
    const r = run(['--env', 'test', '--origin-map', `${home}=https://d1111111111.cloudfront.net`, '--backchannel', 'same-origin']);
    expect(r.status, r.stderr).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out['kiorly-home'].redirectUris).toContain('https://d1111111111.cloudfront.net/signin/callback');
    expect(out['kiorly-clinic'].backchannelLogoutUri).toMatch(/\/api\/v1\/auth\/kiorex\/backchannel-logout$/);
    expect(out['kiorly-clinic'].backchannelLogoutUri).not.toContain('/clinics/');
  });
});
