import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DOMAINS, TIERS, domainsFor, allOrigins } from '../config/domains.js';

const idp = JSON.parse(readFileSync(new URL('../config/idp.json', import.meta.url), 'utf8')) as { clients: Array<{ clientId: string; environments: Record<string, { redirectUris: string[]; postLogoutRedirectUris: string[]; backchannelLogoutUri?: string }> }> };
const ALLOWED_HOSTS = /^(www|clinic|nurse|pharmacy|lab|app|api\.clinic|api\.pharmacy|api\.lab)\.(staging\.)?kiorly\.com$|^kiorly\.com$|^account\.(staging\.)?kiorex\.com$/;
const host = (u: string) => new URL(u).hostname;

describe('ADR-038 domain table (config/domains.json)', () => {
  for (const tier of ['staging', 'production'] as const) {
    it(`${tier}: https only, no localhost, only listed hosts`, () => {
      for (const o of allOrigins(tier)) {
        expect(o, o).toMatch(/^https:\/\//);
        expect(o).not.toMatch(/localhost|127\.0\.0\.1|\[::1\]|\.test\b/);
        expect(host(o), o).toMatch(ALLOWED_HOSTS);
      }
      expect(domainsFor(tier).secureCookies).toBe(true);
      expect(domainsFor(tier).cookieDomain).toBeNull(); // host-only cookies, never Domain=.kiorly.com
    });
  }
  it('founder production hosts', () => {
    const p = domainsFor('production');
    expect(p).toMatchObject({ home: 'https://www.kiorly.com', apexRedirect: 'https://kiorly.com', clinic: 'https://clinic.kiorly.com', nurse: 'https://nurse.kiorly.com', pharmacy: 'https://pharmacy.kiorly.com', lab: 'https://lab.kiorly.com', passport: 'https://account.kiorex.com' });
    expect(p.aliases.clinic).toContain('https://app.kiorly.com');
  });
  it('local keeps the documented ports', () => {
    const l = domainsFor('local');
    expect([l.passport, l.home, l.clinic, l.pharmacy, l.lab]).toEqual(['http://localhost:4400', 'http://localhost:5194', 'http://localhost:5174', 'http://localhost:5192', 'http://localhost:5193']);
  });

  const expected = (tier: (typeof TIERS)[number], id: string) => {
    const d = domainsFor(tier);
    const a = (k: 'home' | 'clinic' | 'pharmacy' | 'lab') => [d[k], ...(d.aliases[k] ?? [])];
    switch (id) {
      case 'kiorly-home': return { cb: a('home').map((h) => `${h}/signin/callback`), lo: a('home').map((h) => `${h}/signin`) };
      case 'kiorly-clinic': { const hs = [...new Set([...a('clinic'), d.nurse])]; return { cb: hs.map((h) => `${h}/auth/kiorex/callback`), lo: [...hs.map((h) => `${h}/`), `${d.home}/signin`] }; }
      case 'kiorly-pharmacy-web': return { cb: a('pharmacy').map((h) => `${h}/auth/callback`), lo: [...a('pharmacy').map((h) => `${h}/`), `${d.home}/signin`] };
      default: return { cb: a('lab').map((h) => `${h}/auth/callback`), lo: [...a('lab').map((h) => `${h}/`), `${d.home}/signin`] };
    }
  };
  for (const id of ['kiorly-home', 'kiorly-clinic', 'kiorly-pharmacy-web', 'kiorly-lab-web']) {
    for (const tier of ['staging', 'production'] as const) {
      it(`Passport client ${id} ${tier} URIs equal the domain table (no TODO, no localhost)`, () => {
        const env = idp.clients.find((c) => c.clientId === id)!.environments[tier]!;
        const e = expected(tier, id);
        expect([...env.redirectUris].sort()).toEqual([...e.cb].sort());
        expect([...env.postLogoutRedirectUris].sort()).toEqual([...e.lo].sort());
        expect(JSON.stringify(env)).not.toMatch(/localhost|TODO_NEEDS_HUMAN\s*:?\s*http/);
      });
    }
    it(`Passport client ${id} local URIs use only local origins`, () => {
      const local = idp.clients.find((c) => c.clientId === id)!.environments.local!;
      for (const u of [...local.redirectUris, ...local.postLogoutRedirectUris]) expect(u).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+\//);
    });
  }
  it('every kiorly.com production redirect host is in the domain table', () => {
    const all = new Set(allOrigins('production').map(host));
    for (const c of idp.clients) for (const u of (c.environments.production?.redirectUris ?? []).filter((x) => /^https:\/\/[^/]*kiorly\.com\//.test(x))) expect(all.has(host(u)), `${c.clientId} ${u}`).toBe(true);
  });
  it('app-link association templates exist for the home host with placeholders for team id and fingerprint', () => {
    const dir = new URL('../config/app-links/', import.meta.url);
    expect(existsSync(new URL('apple-app-site-association.json', dir))).toBe(true);
    const aasa = readFileSync(new URL('apple-app-site-association.json', dir), 'utf8');
    expect(aasa).toContain('TODO_NEEDS_HUMAN_APPLE_TEAM_ID.com.kiorly.app');
    const al = readFileSync(new URL('assetlinks.json', dir), 'utf8');
    expect(al).toContain('com.kiorly.app'); expect(al).toContain('TODO_NEEDS_HUMAN_SHA256_CERT_FINGERPRINT');
    expect(DOMAINS.appLinks.host).toBe('home');
  });
});
