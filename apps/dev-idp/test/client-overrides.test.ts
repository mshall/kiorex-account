import { describe, it, expect } from 'vitest';
import { applyClientOverrides, isAllowedClientUri, loadIdpConfig, parseClientOverrides } from '../src/config.js';
import { buildClients } from '../src/provider.js';
import { LogoutDispatcher } from '../src/logout.js';

const base = () => loadIdpConfig(undefined, {});
const env = (o: unknown) => ({ KX_CLIENT_OVERRIDES_JSON: JSON.stringify(o) });
const SECRET = 'a-generated-secret-of-32-characters';

describe('KX_CLIENT_OVERRIDES_JSON', () => {
  it('unset or blank leaves the committed localhost registrations unchanged', () => {
    const before = JSON.stringify(base().clients);
    expect(JSON.stringify(loadIdpConfig(undefined, { KX_CLIENT_OVERRIDES_JSON: '' }).clients)).toBe(before);
    expect(JSON.stringify(loadIdpConfig(undefined, {}).clients)).toBe(before);
    expect(parseClientOverrides({})).toEqual({});
  });

  it('replaces redirect, post-logout and back-channel URIs and the confidential secret for the named clients only', () => {
    const cfg = loadIdpConfig(undefined, env({
      'kiorly-clinic': { redirectUris: ['https://clinic.dev.example.com/auth/kiorex/callback'], postLogoutRedirectUris: ['https://clinic.dev.example.com/'], backchannelLogoutUri: 'https://api.clinic.dev.example.com/api/v1/auth/kiorex/backchannel-logout', clientSecret: SECRET },
      kiorly: { redirectUris: ['kiorly://auth/callback'] },
    }));
    const local = base();
    const clients = buildClients(cfg);
    const clinic = clients.find((c) => c.client_id === 'kiorly-clinic')!;
    expect(clinic.redirect_uris).toEqual(['https://clinic.dev.example.com/auth/kiorex/callback']);
    expect(clinic.post_logout_redirect_uris).toEqual(['https://clinic.dev.example.com/']);
    expect(clinic.backchannel_logout_uri).toBe('https://api.clinic.dev.example.com/api/v1/auth/kiorex/backchannel-logout');
    expect(clinic.client_secret).toBe(SECRET);
    // untouched fields and other clients keep their committed values
    expect(cfg.clients.find((c) => c.clientId === 'kiorly')!.environments.local.postLogoutRedirectUris).toEqual(local.clients.find((c) => c.clientId === 'kiorly')!.environments.local.postLogoutRedirectUris);
    expect(JSON.stringify(cfg.clients.find((c) => c.clientId === 'kiorly-lab-web'))).toBe(JSON.stringify(local.clients.find((c) => c.clientId === 'kiorly-lab-web')));
    expect(cfg.clients.find((c) => c.clientId === 'kiorly-clinic')!.environments.staging).toEqual(local.clients.find((c) => c.clientId === 'kiorly-clinic')!.environments.staging);
  });

  it('the back-channel dispatcher uses the overridden URI', () => {
    const cfg = loadIdpConfig(undefined, env({ 'kiorly-lab-web': { backchannelLogoutUri: 'https://api.lab.dev.example.com/api/v1/auth/oidc/backchannel-logout' } }));
    const d = new LogoutDispatcher('https://account.dev.example.com', {} as never, cfg);
    expect(d.uriFor('kiorly-lab-web')).toBe('https://api.lab.dev.example.com/api/v1/auth/oidc/backchannel-logout');
    expect(d.uriFor('kiorly-pharmacy-web')).toBe('http://localhost:3100/api/v1/auth/oidc/backchannel-logout');
  });

  it('rejects bad input at start-up: invalid JSON, unknown client, unknown key, wildcard, plain http, fragment, secret on a public client, short secret', () => {
    const bad = (o: unknown, re: RegExp) => expect(() => loadIdpConfig(undefined, env(o))).toThrow(re);
    expect(() => loadIdpConfig(undefined, { KX_CLIENT_OVERRIDES_JSON: '{nope' })).toThrow(/not valid JSON/);
    bad({ nope: { redirectUris: ['https://a.example.com/cb'] } }, /unknown client "nope"/);
    bad({ kiorly: { redirect_uri: ['https://a.example.com/cb'] } }, /invalid/);
    bad({ kiorly: { redirectUris: ['https://*.example.com/cb'] } }, /redirect URI must be https/);
    bad({ kiorly: { redirectUris: ['http://clinic.dev.example.com/cb'] } }, /redirect URI must be https/);
    bad({ kiorly: { redirectUris: ['https://a.example.com/cb#x'] } }, /redirect URI must be https/);
    bad({ kiorly: { redirectUris: ['javascript:alert(1)'] } }, /redirect URI must be https/);
    bad({ kiorly: { clientSecret: SECRET } }, /public client/);
    bad({ 'kiorly-clinic': { clientSecret: 'short' } }, /invalid/);
    bad({ 'kiorly-clinic': { backchannelLogoutUri: 'kiorly://x' } }, /back-channel/);
  });

  it('URI policy: https anywhere, http only on loopback, custom app schemes', () => {
    for (const ok of ['https://clinic.dev.example.com/cb', 'http://localhost:5174/cb', 'http://127.0.0.1:1/cb', 'kiorly://auth/callback', 'exp+kiorly://auth/callback', 'com.kiorly.app:/cb']) expect(isAllowedClientUri(ok), ok).toBe(true);
    for (const no of ['http://example.com/cb', 'https://', 'https://a.example.com/c b', 'data:text/html,x', 'file:///etc/passwd', 'https://user:pw@a.example.com/', 'not a url']) expect(isAllowedClientUri(no), no).toBe(false);
  });

  it('applyClientOverrides reads process env by default and is idempotent', () => {
    const cfg = base();
    expect(applyClientOverrides(cfg, {})).toBe(cfg);
  });
});
