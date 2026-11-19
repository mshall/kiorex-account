import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt, createRemoteJWKSet, jwtVerify } from 'jose';
import { startHarness, login, startAuth, randomPhone, call, totpCode, seedOps, opsLogin, events, type Harness } from './helpers.js';
import { VirtualAuthenticator } from './webauthn.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
const MFA = cfg.stepUp.acr.mfa; const BASIC = cfg.stepUp.acr.basic;
beforeAll(async () => { h = await startHarness(); });
beforeEach(async () => { h.clock.offset = 0; h.clock.totpOffset += 30; await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });
afterAll(async () => { await h.stop(); });

async function otpUntilTotpPage(phone: string, clientId = 'kiorex-ops') {
  const a = await startAuth(h, { phone, clientId });
  const uid = new URL(a.url).pathname.split('/')[2];
  await a.b.req(`${h.issuer}/interaction/${uid}`);
  await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
  const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: '000000' } });
  return { a, uid, v };
}

describe('KA-10 local TOTP enforcement for privileged roles (otplib)', () => {
  it('ops cannot obtain a token with phone OTP alone: TOTP page, /finish refuses to issue a code', async () => {
    const ops = seedOps(h);
    const { a, uid, v } = await otpUntilTotpPage(ops.phone);
    expect(v.status).toBe(200);
    expect(await v.text()).toContain('id="totp"');
    const fin = await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} });
    expect(fin.status).toBe(303);
    expect(fin.headers.get('location')).toContain(`/interaction/${uid}`); // bounced back to the TOTP step, no redirect to the client
    expect(fin.headers.get('location')).not.toContain('code=');
  });

  it('wrong TOTP is rejected; 5 wrong attempts lock the account for the window', async () => {
    const ops = seedOps(h);
    const { a, uid } = await otpUntilTotpPage(ops.phone);
    for (let i = 0; i < 4; i++) {
      const r = await a.b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: '123456' } });
      expect(r.status).toBe(400);
    }
    const locked = await a.b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: '123456' } });
    expect(locked.status).toBe(429);
    // even the correct code is refused while locked
    const good = await a.b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: totpCode(h, ops.totpSecret!) } });
    expect(good.status).toBe(429);
    h.clock.totpOffset += 6 * 60; // lockout window (5 min) passes
  });

  it('a TOTP code is single-use (replay of the same time-step fails), correct code logs in with acr=mfa', async () => {
    const ops = seedOps(h);
    h.clock.totpOffset += 60;
    const code = totpCode(h, ops.totpSecret!);
    const first = await login(h, { clientId: 'kiorex-ops', phone: ops.phone, code: '000000' });
    const claims = decodeJwt(first.tokens.access_token);
    expect(claims.acr).toBe(MFA);
    expect(claims.amr).toEqual(['otp', 'totp', 'mfa']);
    expect(decodeJwt(first.tokens.id_token)).toMatchObject({ acr: MFA, amr: ['otp', 'totp', 'mfa'] });
    // the login helper advanced the clock by one window; the code used at login is now in the past and its step is spent
    h.clock.totpOffset -= 30;
    const { a, uid } = await otpUntilTotpPage(ops.phone);
    const replay = await a.b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: totpCode(h, ops.totpSecret!) } });
    expect(replay.status).toBe(400);
    h.clock.totpOffset += 30;
    expect(code).toHaveLength(6);
  });

  it('patients are not forced into TOTP and get acr=basic, amr=[otp]', async () => {
    const r = await login(h, { phone: randomPhone() });
    const c = decodeJwt(r.tokens.access_token);
    expect(c.acr).toBe(BASIC);
    expect(c.amr).toEqual(['otp']);
    expect(typeof c.auth_time).toBe('number');
  });

  it('first-time enrolment for a privileged account without a TOTP secret shows the setup key and confirms it', async () => {
    const phone = randomPhone();
    await login(h, { phone }); // creates the account
    await h.idp.pool.query(`UPDATE accounts SET roles='["finance"]' WHERE phone=$1`, [phone]);
    const a = await startAuth(h, { phone, clientId: 'kiorly-clinic' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)! } });
    const html = await v.text();
    const secret = html.match(/id="totp-secret"><code>([A-Z2-7]+)<\/code>/)![1];
    expect(html).toContain('otpauth://totp/');
    const ok = await a.b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: totpCode(h, secret) } });
    expect([200, 303]).toContain(ok.status);
    const fin = await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} });
    expect(fin.headers.get('location')).not.toContain(`/interaction/${uid}?`);
    const row = await h.idp.pool.query(`SELECT confirmed_at FROM totp_credentials WHERE sub=(SELECT sub FROM accounts WHERE phone=$1)`, [phone]);
    expect(row.rows[0].confirmed_at).toBeTruthy();
  });
});

describe('KA-10 step-up endpoint and acr/amr signal', () => {
  it('patient: policy says step-up needed, TOTP enrol + step-up yields an acr=mfa token, which expires after the freshness window', async () => {
    const r = await login(h, { phone: randomPhone() });
    const t = r.tokens.access_token;
    expect((await call(h, t, 'GET', '/api/step-up/policy?action=money')).json).toMatchObject({ step_up_required: true, satisfied: false, acr_values: MFA, max_age: 300 });
    expect((await call(h, t, 'GET', '/api/step-up/policy?action=browse')).json).toMatchObject({ step_up_required: false, satisfied: true });
    expect((await call(h, t, 'POST', '/api/step-up', { method: 'totp', code: '123456' })).status).toBe(409); // not enrolled

    const enrol = await call(h, t, 'POST', '/api/totp/enroll');
    expect(enrol.status).toBe(200);
    expect(enrol.json.otpauth_uri).toContain('otpauth://totp/');
    h.clock.totpOffset += 30;
    const secret = enrol.json.secret as string;
    expect((await call(h, t, 'POST', '/api/totp/confirm', { code: '000000' })).status).toBe(400);
    expect((await call(h, t, 'POST', '/api/totp/confirm', { code: totpCode(h, secret) })).status).toBe(200);
    expect((await call(h, t, 'POST', '/api/totp/enroll')).status).toBe(409);

    h.clock.totpOffset += 30;
    const su = await call(h, t, 'POST', '/api/step-up', { method: 'totp', code: totpCode(h, secret) });
    expect(su.status).toBe(200);
    expect(su.json).toMatchObject({ token_type: 'Bearer', acr: MFA });
    expect(su.json.amr).toEqual(['otp', 'totp', 'mfa']);
    const claims = decodeJwt(su.json.access_token);
    expect(claims).toMatchObject({ acr: MFA, aud: 'kiorex-api', kx_roles: ['patient'] });
    // signed by the IdP key, same audience, usable against the account API
    await jwtVerify(su.json.access_token, createRemoteJWKSet(new URL(`${h.issuer}/jwks`)), { issuer: h.issuer, audience: 'kiorex-api' });
    const pol = await call(h, su.json.access_token, 'GET', '/api/step-up/policy?action=clinical');
    expect(pol.json).toMatchObject({ satisfied: true });
    // replay of the same TOTP code does not mint another token
    expect((await call(h, t, 'POST', '/api/step-up', { method: 'totp', code: totpCode(h, secret) })).status).toBe(400);
    // the step-up token lives exactly as long as the freshness window (300 s); after that it is simply expired
    h.clock.offset += 250;
    expect((await call(h, su.json.access_token, 'GET', '/api/step-up/policy?action=money')).json).toMatchObject({ satisfied: true });
    h.clock.offset += 60;
    expect((await call(h, su.json.access_token, 'GET', '/api/step-up/policy?action=money')).status).toBe(401);
    h.clock.offset = 0;
  });

  it('step-up wrong code is audited and rate limited (5 attempts)', async () => {
    const r = await login(h, { phone: randomPhone() });
    const t = r.tokens.access_token;
    const enrol = await call(h, t, 'POST', '/api/totp/enroll');
    h.clock.totpOffset += 30;
    await call(h, t, 'POST', '/api/totp/confirm', { code: totpCode(h, enrol.json.secret) });
    h.clock.totpOffset += 30;
    for (let i = 0; i < 4; i++) expect((await call(h, t, 'POST', '/api/step-up', { method: 'totp', code: '111111' })).status).toBe(400);
    expect((await call(h, t, 'POST', '/api/step-up', { method: 'totp', code: '111111' })).status).toBe(429);
    const audit = await h.idp.pool.query(`SELECT count(*)::int AS n FROM audit_events WHERE type='step_up.failed'`);
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(5);
    h.clock.totpOffset += 6 * 60;
  });

  it('step-up with a user-verifying passkey; non-UV assertion is refused', async () => {
    const r = await login(h, { phone: randomPhone() });
    const t = r.tokens.access_token;
    const va = new VirtualAuthenticator(h.issuer);
    const opts = await call(h, t, 'POST', '/api/passkeys/register/options');
    expect((await call(h, t, 'POST', '/api/passkeys/register/verify', va.register(opts.json.challenge))).json.verified).toBe(true);

    const o1 = await call(h, t, 'POST', '/api/step-up/passkey/options');
    expect(o1.json.allowCredentials[0].id).toBe(va.id);
    const noUv = await call(h, t, 'POST', '/api/step-up', { method: 'passkey', response: va.assert(o1.json.challenge, { uv: false }) });
    expect(noUv.status).toBe(400);
    expect(noUv.json.error).toBe('user_verification_required');

    const o2 = await call(h, t, 'POST', '/api/step-up/passkey/options');
    const ok = await call(h, t, 'POST', '/api/step-up', { method: 'passkey', response: va.assert(o2.json.challenge, { uv: true }) });
    expect(ok.status).toBe(200);
    expect(ok.json.acr).toBe(MFA);
    expect(ok.json.amr).toEqual(expect.arrayContaining(['otp', 'user', 'mfa']));
    // another user's passkey cannot be used
    const other = await login(h, { phone: randomPhone() });
    const o3 = await call(h, other.tokens.access_token, 'POST', '/api/step-up/passkey/options');
    expect((await call(h, other.tokens.access_token, 'POST', '/api/step-up', { method: 'passkey', response: va.assert(o3.json.challenge) })).status).toBe(400);
  });

  it('ops-only endpoints demand acr=mfa + fresh auth_time (RFC 9470 challenge); a plain-OTP token is refused', async () => {
    const amira = await login(h, { phone: h.idp.seedUsers[0].phone, code: '000000' });
    const forbidden = await call(h, amira.tokens.access_token, 'GET', '/api/ops/links');
    expect(forbidden.status).toBe(403); // not an ops account at all
    expect(forbidden.json.error).toBe('ops_role_required');

    const ops = await opsLogin(h);
    expect((await call(h, ops.tokens.access_token, 'GET', '/api/ops/links')).status).toBe(200);
    // stale: after the freshness window the same token must step up again
    h.clock.offset += 301; h.clock.totpOffset += 301;
    const stale = await call(h, ops.tokens.access_token, 'GET', '/api/ops/links');
    expect(stale.status).toBe(403);
    expect(stale.json).toMatchObject({ error: 'step_up_required', acr_values: MFA, max_age: 300 });
    expect(stale.headers.get('www-authenticate')).toContain('insufficient_user_authentication');
    const secret = seedOps(h).totpSecret!;
    const su = await call(h, ops.tokens.access_token, 'POST', '/api/step-up', { method: 'totp', code: totpCode(h, secret) });
    expect(su.status).toBe(200);
    expect((await call(h, su.json.access_token, 'GET', '/api/ops/links')).status).toBe(200);
    h.clock.offset = 0;
  });

  it('an ops login whose session is revoked loses its step-up token too (sid-bound)', async () => {
    const ops = await opsLogin(h);
    const secret = seedOps(h).totpSecret!;
    const su = await call(h, ops.tokens.access_token, 'POST', '/api/step-up', { method: 'totp', code: totpCode(h, secret) });
    const sid = decodeJwt(su.json.access_token).sid;
    expect(sid).toBe(decodeJwt(ops.tokens.access_token).sid);
    const sessions = await call(h, su.json.access_token, 'GET', '/api/sessions');
    const mine = sessions.json.sessions.find((s: { current: boolean }) => s.current);
    // revoke through the user's other session: simulate by deleting the session row
    await h.idp.pool.query(`DELETE FROM oidc_payloads WHERE model='Session' AND uid=$1`, [mine.session_id]);
    expect((await call(h, su.json.access_token, 'GET', '/api/sessions')).status).toBe(401);
  });

  it('ADR-013: step-up and login tokens carry no clinical or unexpected claims', async () => {
    const ops = await opsLogin(h);
    const su = await call(h, ops.tokens.access_token, 'POST', '/api/step-up', { method: 'totp', code: totpCode(h, seedOps(h).totpSecret!) });
    const standard = new Set(['iss', 'aud', 'exp', 'iat', 'jti', 'client_id', 'scope', 'sub', 'sid', 'auth_time', 'nonce', 'at_hash', 'azp', 'amr', 'acr', 'rat', 'c_hash', 'gty']);
    const allowed = new Set([...standard, ...cfg.accessTokenClaims]);
    for (const tok of [ops.tokens.access_token, su.json.access_token]) {
      for (const k of Object.keys(decodeJwt(tok))) {
        expect(allowed.has(k), `unexpected claim ${k}`).toBe(true);
        expect(cfg.forbiddenClaims).not.toContain(k);
      }
    }
    expect(events).toBeTypeOf('function');
  });
});
