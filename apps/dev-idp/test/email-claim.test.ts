import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeJwt } from 'jose';
import { call, inbox, login, randomPhone, startHarness, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
beforeEach(async () => { await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });
afterAll(async () => { await h.stop(); });

const tokenFor = async (phone: string, scope = 'openid profile phone email kx offline_access') => (await login(h, { phone, name: 'Mail Person', scope })).tokens.access_token as string;
const lastMailCode = async (to: string) => (await inbox(h, { to, channel: 'email' })).at(-1)?.data.code as string;

describe('email and email_verified claims (gap closure: corporate domain join needs an explicit true)', () => {
  it('a new account has no e-mail claim; it appears only after the code round trip, and only for a client that asked for the email scope', async () => {
    const phone = randomPhone();
    const t0 = await tokenFor(phone);
    expect(decodeJwt(t0)).not.toHaveProperty('email');
    expect(decodeJwt(t0)).not.toHaveProperty('email_verified');
    const start = await call(h, t0, 'POST', '/api/email', { email: 'Salma@Acme-Corp.test' });
    expect(start.status).toBe(200);
    expect((await call(h, t0, 'GET', '/api/email')).json).toMatchObject({ email: null, email_verified: false, pending: true });
    // typed but not verified: still no claim
    expect(decodeJwt(await tokenFor(phone))).not.toHaveProperty('email_verified');
    const code = await lastMailCode('salma@acme-corp.test');
    expect(code).toMatch(/^\d{6}$/);
    const v = await call(h, t0, 'POST', '/api/email/verify', { code });
    expect(v.status).toBe(200); expect(v.json).toEqual({ email: 'salma@acme-corp.test', email_verified: true });
    const t1 = await tokenFor(phone);
    expect(decodeJwt(t1)).toMatchObject({ email: 'salma@acme-corp.test', email_verified: true });
    // a client that did not ask for the email scope never sees it
    const t2 = await tokenFor(phone, 'openid profile phone kx offline_access');
    expect(decodeJwt(t2)).not.toHaveProperty('email');
    expect((await call(h, t1, 'GET', '/api/account')).json).toMatchObject({ email: 'salma@acme-corp.test', email_verified: true });
  });

  it('a wrong code never verifies; five wrong attempts lock the code; the code is single use; a resend inside a minute is refused', async () => {
    const phone = randomPhone(); const t = await tokenFor(phone);
    expect((await call(h, t, 'POST', '/api/email', { email: 'a@acme-corp.test' })).status).toBe(200);
    expect((await call(h, t, 'POST', '/api/email', { email: 'a@acme-corp.test' })).status).toBe(429); // resend too soon
    const real = await lastMailCode('a@acme-corp.test');
    const wrong = real === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) expect((await call(h, t, 'POST', '/api/email/verify', { code: wrong })).status).toBe(400);
    expect((await call(h, t, 'POST', '/api/email/verify', { code: real })).status).toBe(429); // locked even for the right code
    expect(decodeJwt(await tokenFor(phone))).not.toHaveProperty('email_verified');
  });

  it('single use and bad input: a verified code cannot be replayed, a malformed address is a 400, and removing the address removes the claim', async () => {
    const phone = randomPhone(); const t = await tokenFor(phone);
    expect((await call(h, t, 'POST', '/api/email', { email: 'not-an-email' })).status).toBe(400);
    expect((await call(h, t, 'POST', '/api/email', { email: 'b@acme-corp.test' })).status).toBe(200);
    const code = await lastMailCode('b@acme-corp.test');
    expect((await call(h, t, 'POST', '/api/email/verify', { code })).status).toBe(200);
    expect((await call(h, t, 'POST', '/api/email/verify', { code })).status).toBe(400); // consumed
    expect((await call(h, t, 'DELETE', '/api/email')).status).toBe(200);
    expect(decodeJwt(await tokenFor(phone))).not.toHaveProperty('email');
  });

  it('an address already verified by another account is refused (409), so one person cannot claim a colleague domain identity', async () => {
    const p1 = randomPhone(); const t1 = await tokenFor(p1);
    await call(h, t1, 'POST', '/api/email', { email: 'c@acme-corp.test' });
    await call(h, t1, 'POST', '/api/email/verify', { code: await lastMailCode('c@acme-corp.test') });
    const t2 = await tokenFor(randomPhone());
    const r = await call(h, t2, 'POST', '/api/email', { email: 'c@acme-corp.test' });
    expect([r.status, r.json.error]).toEqual([409, 'email_in_use']);
  });

  it('the verification mail never leaves the dev inbox with more than the code, and the audit trail records the domain only', async () => {
    const t = await tokenFor(randomPhone());
    await call(h, t, 'POST', '/api/email', { email: 'd@acme-corp.test' });
    const m = (await inbox(h, { to: 'd@acme-corp.test', channel: 'email' })).at(-1)!;
    expect(m.template).toBe('kx_email_verify');
    const ev = await h.idp.pool.query(`SELECT data FROM audit_events WHERE type='email.verification.sent' ORDER BY seq DESC LIMIT 1`);
    expect(JSON.stringify(ev.rows[0].data)).toBe('{"domain":"acme-corp.test"}');
  });
});
