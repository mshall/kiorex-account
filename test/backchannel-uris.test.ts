import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { domainsFor, type Tier } from '../config/domains.js';

type Env = { redirectUris: string[]; postLogoutRedirectUris: string[]; backchannelLogoutUri?: string };
const idp = JSON.parse(readFileSync(new URL('../config/idp.json', import.meta.url), 'utf8')) as { issuer: Record<string, string>; clients: Array<{ clientId: string; type: string; environments: Record<Tier, Env> }> };
const client = (id: string) => idp.clients.find((c) => c.clientId === id)!;

/** Where each web client's product API receives OIDC back-channel logout (BCL 1.0). The host comes from the domain table. */
const BCL: Array<{ id: string; api: 'clinic' | 'pharmacy' | 'lab'; path: string; local: string }> = [
  { id: 'kiorly-clinic', api: 'clinic', path: '/api/v1/auth/kiorex/backchannel-logout', local: 'http://localhost:3010' },
  { id: 'kiorly-pharmacy-web', api: 'pharmacy', path: '/api/v1/auth/oidc/backchannel-logout', local: 'http://localhost:3100' },
  { id: 'kiorly-lab-web', api: 'lab', path: '/api/v1/auth/oidc/backchannel-logout', local: 'http://localhost:3200' },
];

describe('back-channel logout registration (staff webs)', () => {
  for (const b of BCL) {
    it(`${b.id}: every environment has a back-channel logout URI on the product API host from the domain table`, () => {
      expect(client(b.id).environments.local.backchannelLogoutUri).toBe(`${b.local}${b.path}`);
      for (const tier of ['staging', 'production'] as const) {
        expect(client(b.id).environments[tier].backchannelLogoutUri).toBe(`${domainsFor(tier).api[b.api]}${b.path}`);
      }
      expect(client(b.id).environments.staging.backchannelLogoutUri).toMatch(/^https:\/\/api\.[a-z]+\.staging\.kiorly\.com\//);
      expect(client(b.id).environments.production.backchannelLogoutUri).toMatch(/^https:\/\/api\.[a-z]+\.kiorly\.com\//);
    });
  }
  it('Kiorly Home (no server session) and the staff app clients register no back-channel URI', () => {
    for (const id of ['kiorly-home', 'kiorly', 'kiorly']) for (const tier of ['local', 'staging', 'production'] as const) expect(client(id).environments[tier].backchannelLogoutUri, `${id} ${tier}`).toBeUndefined();
  });
});

describe('staging and production registrations are complete (config only)', () => {
  it('no TODO_NEEDS_HUMAN is left in the clients the founder listed, nor in the issuers', () => {
    for (const id of ['kiorly', 'kiorly', 'kiorly-home', 'kiorly-pharmacy-web', 'kiorly-lab-web', 'kiorly-clinic']) {
      for (const tier of ['staging', 'production'] as const) expect(JSON.stringify(client(id).environments[tier]), `${id} ${tier}`).not.toContain('TODO_NEEDS_HUMAN');
    }
    expect(idp.issuer.staging).toBe(domainsFor('staging').passport);
    expect(idp.issuer.production).toBe(domainsFor('production').passport);
  });
  it('the staff app registers the native scheme in staging and production, nothing http', () => {
    for (const tier of ['staging', 'production'] as const) {
      const e = client('kiorly').environments[tier];
      expect(e.redirectUris).toEqual(['kiorly://auth/callback']);
      expect(e.postLogoutRedirectUris).toEqual(['kiorly://auth/logout']);
      expect(client('kiorly').environments[tier].redirectUris).toEqual(['kiorlyteam://auth/callback']);
    }
  });
  it('web clients on the five product hosts only use https in staging/production', () => {
    for (const id of ['kiorly-home', 'kiorly-pharmacy-web', 'kiorly-lab-web', 'kiorly-clinic']) for (const tier of ['staging', 'production'] as const) {
      const e = client(id).environments[tier];
      for (const u of [...e.redirectUris, ...e.postLogoutRedirectUris, ...(e.backchannelLogoutUri ? [e.backchannelLogoutUri] : [])]) expect(u, `${id} ${tier}`).toMatch(/^https:\/\//);
    }
  });
});
