import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, startAuth, seedOps, totpCode, type Harness } from './helpers.js';
import { devTestUsersEnabled } from '../src/dev-test-users.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

const LEAKS = /Test users|dev only|dev-test-users|data-dev|dev-fill|dev-seed|dev-code|مستخدمو الاختبار|(?<!\d)000000(?!\d)|Dev seed/i;

describe('Passport sign-in pages render no demo or test-user content (every build)', () => {
  it('the fixed dev OTP gate is on by default outside production and off in production or with KX_DEV_TEST_USERS=false (server side only)', () => {
    expect(devTestUsersEnabled({})).toBe(true);
    expect(devTestUsersEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(devTestUsersEnabled({ KX_ENV: 'prod' })).toBe(false);
    expect(devTestUsersEnabled({ KX_DEV_TEST_USERS: 'false' })).toBe(false);
  });

  it('the phone page lists no seeded persona, no quick-pick and no hint, in English and Arabic, even with a seeded login_hint', async () => {
    const a = await startAuth(h, { phone: '+201000001001' });
    const uid = new URL(a.url).pathname.split('/')[2];
    for (const q of ['', '?lang=ar']) {
      const page = await (await a.b.req(`${h.issuer}/interaction/${uid}${q}`)).text();
      expect(page).not.toMatch(LEAKS);
      expect(page).not.toContain('+201000001001');
      expect(page).not.toContain('Mariam Adel');
    }
  });

  it('typing a seeded number reaches the code page with no OTP hint or auto-fill; the server still accepts the fixed dev code 000000 when the bypass is on', async () => {
    const a = await startAuth(h, { phone: '+201000001006' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    const r = await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: '+201000001006' } });
    const html = await r.text();
    expect(html).not.toMatch(LEAKS);
    expect(html).not.toContain('Mariam Adel');
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: '000000' } });
    expect([200, 303]).toContain(v.status);
  });

  it('the ops authenticator page shows neither the current code nor the seed of a seeded ops user', async () => {
    h.clock.totpOffset += 120;
    const ops = seedOps(h);
    const a = await startAuth(h, { phone: ops.phone, clientId: 'kiorex-ops' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: ops.phone } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: '000000' } });
    const html = await v.text();
    expect(html).not.toMatch(LEAKS);
    expect(html).not.toContain(ops.totpSecret!);
    expect(html).not.toContain(totpCode(h, ops.totpSecret!));
  });
});
