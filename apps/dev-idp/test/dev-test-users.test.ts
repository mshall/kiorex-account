import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, startAuth, seedOps, totpCode, type Harness } from './helpers.js';
import { devTestUsersEnabled, devUsers, groupOf } from '../src/dev-test-users.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

describe('dev-only "Test users (dev only)" quick-pick panel on the Passport sign-in', () => {
  it('is enabled by default outside production and off in production or with KX_DEV_TEST_USERS=false', () => {
    expect(devTestUsersEnabled({})).toBe(true);
    expect(devTestUsersEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(devTestUsersEnabled({ KX_ENV: 'prod' })).toBe(false);
    expect(devTestUsersEnabled({ KX_DEV_TEST_USERS: 'false' })).toBe(false);
  });

  it('groups every seeded persona and lists them on the phone page with the dev label', async () => {
    const a = await startAuth(h, { phone: '+201000001001' });
    const uid = new URL(a.url).pathname.split('/')[2];
    const page = await (await a.b.req(`${h.issuer}/interaction/${uid}`)).text();
    expect(page).toContain('Test users (dev only)');
    for (const u of devUsers()) expect(page).toContain(`data-dev-phone="${u.phone}"`);
    expect(page).toContain('+201000001001');
    expect(groupOf({ phone: '+201000000099', roles: ['ops_admin', 'super_admin'] })).toBe('ops');
    const ar = await (await a.b.req(`${h.issuer}/interaction/${uid}?lang=ar`)).text();
    expect(ar).toContain('مستخدمو الاختبار (للتطوير فقط)');
  });

  it('a quick-pick submission (dev_auto) reaches the code page that auto-fills 000000; the code is the fixed dev OTP', async () => {
    const a = await startAuth(h, { phone: '+201000001006' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    const r = await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: '+201000001006', dev_auto: '1' } });
    const html = await r.text();
    expect(html).toContain('id="dev-fill"');
    expect(html).toContain('Mariam Adel');
    expect(html).toContain('go();})();'); // auto submit
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: '000000' } });
    expect([200, 303]).toContain(v.status);
  });

  it('ops TOTP page shows the current dev code and seed for a seeded ops user', async () => {
    h.clock.totpOffset += 120;
    const ops = seedOps(h);
    const a = await startAuth(h, { phone: ops.phone, clientId: 'kiorex-ops' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: ops.phone } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: '000000' } });
    const html = await v.text();
    expect(html).toContain('id="dev-seed"');
    expect(html).toContain(ops.totpSecret!);
    expect(html).toContain(totpCode(h, ops.totpSecret!));
  });
});
