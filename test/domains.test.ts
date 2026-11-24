import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DOMAINS, TIERS, domainsFor, allOrigins } from '../config/domains.js';

const idp = JSON.parse(readFileSync(new URL('../config/idp.json', import.meta.url), 'utf8')) as { clients: Array<{ clientId: string; environments: Record<string, { redirectUris: string[]; postLogoutRedirectUris: string[]; backchannelLogoutUri?: string }> }> };
const ALLOWED_HOSTS = /^(www|clinic|nurse|pharmacy|lab|app|api\.clinic|api\.pharmacy|api\.lab)\.(staging\.)?kiorly\.com$|^kiorly\.com$|^account\.(staging\.)?kiorex\.com$|^(www\.)?(staging\.)?kiorex\.com$|^book\.(staging\.)?kiorex\.com$|^(staging\.)?kiorly\.link$/;
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

  // GRW-P1-H: patient, link and widget hosts and the patient app-link association
  it('patient, link and widget hosts exist in every environment, are unique per environment and HTTPS outside local', () => {
    for (const tier of TIERS) {
      const d = domainsFor(tier);
      const hosts = [d.patient, d.link, d.widget];
      for (const h of hosts) { expect(typeof h).toBe('string'); if (tier !== 'local') expect(h).toMatch(/^https:\/\//); }
      expect(new Set(hosts).size).toBe(3);
      if (tier !== 'local') expect(new Set(allOrigins(tier)).size, `${tier} origins unique`).toBe(allOrigins(tier).length); // local clinic and nurse share a dev server
    }
    expect(domainsFor('production')).toMatchObject({ patient: 'https://kiorex.com', link: 'https://kiorly.link', widget: 'https://book.kiorex.com' });
  });
  it('patient app-link templates carry placeholders, the patient bundle id and only allow-listed paths', () => {
    const dir = new URL('../config/app-links/', import.meta.url);
    const aasaRaw = readFileSync(new URL('apple-app-site-association.kiorex.json', dir), 'utf8');
    const aasa = JSON.parse(aasaRaw) as { applinks: { details: Array<{ appIDs: string[]; components: Array<{ '/': string }> }> } };
    expect(aasa.applinks.details[0]!.appIDs).toEqual(['TODO_NEEDS_HUMAN_APPLE_TEAM_ID.com.kiorex.app']);
    const paths = aasa.applinks.details[0]!.components.map((c) => c['/']);
    expect(paths).toEqual(DOMAINS.appLinks.patient.iosPaths);
    expect(paths).not.toContain('/*'); // never claim the whole host (the app would swallow every web page)
    // GRW-P2-B3: the referral invite link (https://kiorex.com/{locale}/{cc}/invite/<code>, and the short /invite/<code>) opens the app; nothing broader
    expect(paths).toEqual(expect.arrayContaining(['/ar/*/invite/*', '/en/*/invite/*', '/invite/*']));
    expect(DOMAINS.appLinks.patient.androidPathPatterns).toEqual(expect.arrayContaining(['/ar/..*/invite/.*', '/en/..*/invite/.*', '/invite/.*']));
    expect(DOMAINS.appLinks.patient.paths).toEqual(expect.arrayContaining(['/{locale}/{cc}/invite/*', '/invite/*']));
    const al = JSON.parse(readFileSync(new URL('assetlinks.kiorex.json', dir), 'utf8')) as Array<{ target: { package_name: string; sha256_cert_fingerprints: string[] } }>;
    expect(al[0]!.target.package_name).toBe(DOMAINS.appLinks.patient.androidPackage);
    expect(al[0]!.target.sha256_cert_fingerprints).toEqual(['TODO_NEEDS_HUMAN_SHA256_CERT_FINGERPRINT']);
    expect(DOMAINS.appLinks.patient.host).toBe('patient');
    expect(DOMAINS.appLinks.patient.androidPathPatterns.length).toBe(DOMAINS.appLinks.patient.iosPaths.length);
    // the staff app association claims /open/* ONLY: a Passport redirect to the web callback /signin/callback must never be captured by the app on a phone
    expect(DOMAINS.appLinks).toMatchObject({ host: 'home', iosBundleId: 'com.kiorly.app', paths: ['/open/*'] });
    expect(JSON.stringify(DOMAINS.appLinks.paths)).not.toContain('signin');
    const staffAasa = JSON.parse(readFileSync(new URL('../config/app-links/apple-app-site-association.json', import.meta.url), 'utf8'));
    const comps = (staffAasa.applinks.details as Array<{ components: Array<{ '/': string }> }>).flatMap((d) => d.components.map((c) => c['/']));
    expect(comps).toEqual(['/open/*']);
  });
});
