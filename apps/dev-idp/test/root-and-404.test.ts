import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

describe('Passport root and 404', () => {
  it('the bare root goes to the account site', async () => {
    const r = await fetch(`${h.issuer}/`, { redirect: 'manual' });
    expect(r.status).toBe(302);
    expect(r.headers.get('location')).toBe('/account');
  });
  it('an unknown path answers a branded page for browsers (language from the cookie, then Accept-Language) and keeps the status 404', async () => {
    const ar = await fetch(`${h.issuer}/nothing-here`, { headers: { accept: 'text/html', 'accept-language': 'ar-EG,ar;q=0.9' } });
    expect(ar.status).toBe(404);
    const body = await ar.text();
    expect(body).toContain('<html lang="ar"');
    expect(body).toContain('href="/account"');
    const en = await fetch(`${h.issuer}/nothing-here`, { headers: { accept: 'text/html', cookie: 'kx-lang=en' } });
    expect(en.status).toBe(404);
    expect(await en.text()).toContain('We could not find that page');
  });
  it('non-browser clients still get the provider answer', async () => {
    const r = await fetch(`${h.issuer}/nothing-here`, { headers: { accept: 'application/json' } });
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain('<html');
  });
});
