import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, startAuth, completeLogin, randomPhone, call, seedOps, totpCode, type Harness } from './helpers.js';
import { VirtualAuthenticator } from './webauthn.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
const MFA = cfg.stepUp.acr.mfa; const BASIC = cfg.stepUp.acr.basic;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

async function registerPasskey(token: string, va: VirtualAuthenticator, uv = true) {
  const o = await call(h, token, 'POST', '/api/passkeys/register/options');
  return call(h, token, 'POST', '/api/passkeys/register/verify', va.register(o.json.challenge, { uv }));
}

async function startPasskeyLogin(clientId = 'kiorex-web') {
  const a = await startAuth(h, { phone: '+201000000000', clientId });
  const uid = new URL(a.url).pathname.split('/')[2];
  const page = await (await a.b.req(`${h.issuer}/interaction/${uid}`)).text();
  const opts = await (await a.b.req(`${h.issuer}/interaction/${uid}/passkey/login/options`, { method: 'POST' })).json();
  return { a, uid, page, opts };
}

describe('KA-03 passkey LOGIN (WebAuthn assertion)', () => {
  it('registers a passkey over the API, then signs in with it and no phone OTP (amr swk/hwk+user+mfa, acr mfa)', async () => {
    const phone = randomPhone();
    const first = await login(h, { phone });
    const va = new VirtualAuthenticator(h.issuer);
    const reg = await registerPasskey(first.tokens.access_token, va);
    expect(reg.json.verified).toBe(true);
    const before = h.channel.sent.length;

    const { a, uid, page, opts } = await startPasskeyLogin();
    expect(page).toContain('id="pk-login"'); // login page offers the passkey button
    expect(opts.rpId).toBe('localhost');
    expect(opts.allowCredentials).toBeUndefined(); // discoverable-credential login: no username typed
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/passkey/login/verify`, { method: 'POST', json: va.assert(opts.challenge) });
    expect(v.status).toBe(200);
    expect(await v.json()).toEqual({ verified: true, user_verified: true });
    const fin = await a.b.req(`${h.issuer}/interaction/${uid}/passkey/login/finish`, { method: 'POST', form: {} });
    const tokens = await completeLogin(h, a, fin);

    const c = decodeJwt(tokens.access_token);
    expect(c.sub).toBe(decodeJwt(first.tokens.access_token).sub);
    expect(c.acr).toBe(MFA);
    expect(c.amr).toEqual(['hwk', 'user', 'mfa']);
    expect(decodeJwt(tokens.id_token)).toMatchObject({ acr: MFA, amr: ['hwk', 'user', 'mfa'] });
    expect(h.channel.sent.length).toBe(before); // no OTP was sent
    expect((await call(h, tokens.access_token, 'GET', '/api/sessions')).status).toBe(200);
  });

  it('assertion without user verification signs in at acr=basic (single factor)', async () => {
    const first = await login(h, { phone: randomPhone() });
    const va = new VirtualAuthenticator(h.issuer);
    await registerPasskey(first.tokens.access_token, va);
    const { a, uid, opts } = await startPasskeyLogin();
    expect((await a.b.req(`${h.issuer}/interaction/${uid}/passkey/login/verify`, { method: 'POST', json: va.assert(opts.challenge, { uv: false }) })).status).toBe(200);
    const tokens = await completeLogin(h, a, await a.b.req(`${h.issuer}/interaction/${uid}/passkey/login/finish`, { method: 'POST', form: {} }));
    const c = decodeJwt(tokens.access_token);
    expect(c.acr).toBe(BASIC);
    expect(c.amr).toEqual(['hwk']);
  });

  it('rejects bad signature, wrong origin, unknown credential, replayed challenge and counter rollback', async () => {
    const first = await login(h, { phone: randomPhone() });
    const va = new VirtualAuthenticator(h.issuer);
    await registerPasskey(first.tokens.access_token, va);
    const evil = new VirtualAuthenticator(h.issuer);

    let s = await startPasskeyLogin();
    const post = (x: typeof s, body: unknown) => x.a.b.req(`${h.issuer}/interaction/${x.uid}/passkey/login/verify`, { method: 'POST', json: body });
    // 1 wrong origin
    expect((await post(s, va.assert(s.opts.challenge, { origin: 'http://evil.example' }))).status).toBe(401);
    // challenge is single-use: even a correct assertion over the consumed challenge fails
    expect((await post(s, va.assert(s.opts.challenge))).status).toBe(401);
    // 2 unknown credential
    s = await startPasskeyLogin();
    expect((await post(s, evil.assert(s.opts.challenge))).status).toBe(401);
    // 3 signature by another key under the right credential id
    s = await startPasskeyLogin();
    const forged = evil.assert(s.opts.challenge);
    forged.id = va.id; forged.rawId = va.id;
    expect((await post(s, forged)).status).toBe(401);
    // 4 stale challenge from another interaction
    const s1 = await startPasskeyLogin(); const s2 = await startPasskeyLogin();
    expect((await post(s2, va.assert(s1.opts.challenge))).status).toBe(401);
    // 5 counter rollback (cloned authenticator)
    s = await startPasskeyLogin();
    expect((await post(s, va.assert(s.opts.challenge, { counter: 5 }))).status).toBe(200);
    s = await startPasskeyLogin();
    expect((await post(s, va.assert(s.opts.challenge, { counter: 3 }))).status).toBe(401);
    // no session without a verified assertion
    const s3 = await startPasskeyLogin();
    const fin = await s3.a.b.req(`${h.issuer}/interaction/${s3.uid}/passkey/login/finish`, { method: 'POST', form: {} });
    expect(fin.headers.get('location')).toContain(`/interaction/${s3.uid}`);
  });

  it('a privileged account with a UV passkey skips TOTP; without UV it still must pass TOTP', async () => {
    const ops = seedOps(h);
    const first = await login(h, { clientId: 'kiorex-ops', phone: ops.phone, code: '000000' });
    const va = new VirtualAuthenticator(h.issuer);
    expect((await registerPasskey(first.tokens.access_token, va)).json.verified).toBe(true);

    let s = await startPasskeyLogin('kiorex-ops');
    await s.a.b.req(`${h.issuer}/interaction/${s.uid}/passkey/login/verify`, { method: 'POST', json: va.assert(s.opts.challenge, { uv: true }) });
    const t1 = await completeLogin(h, s.a, await s.a.b.req(`${h.issuer}/interaction/${s.uid}/passkey/login/finish`, { method: 'POST', form: {} }));
    expect(decodeJwt(t1.access_token)).toMatchObject({ acr: MFA, kx_roles: ['ops_admin', 'super_admin'] });

    s = await startPasskeyLogin('kiorex-ops');
    await s.a.b.req(`${h.issuer}/interaction/${s.uid}/passkey/login/verify`, { method: 'POST', json: va.assert(s.opts.challenge, { uv: false }) });
    const fin = await s.a.b.req(`${h.issuer}/interaction/${s.uid}/passkey/login/finish`, { method: 'POST', form: {} });
    expect(fin.headers.get('location')).toContain(`/interaction/${s.uid}`); // bounced: TOTP still required
    const totpPage = await (await s.a.b.req(`${h.issuer}/interaction/${s.uid}`)).text();
    expect(totpPage).toContain('id="totp"');
    h.clock.totpOffset += 30;
    const ok = await s.a.b.req(`${h.issuer}/interaction/${s.uid}/totp`, { method: 'POST', form: { totp: totpCode(h, ops.totpSecret!) } });
    expect(ok.status).toBe(303); // TOTP satisfied the second factor: the passkey session completes without the add-passkey step
    const t2 = await completeLogin(h, s.a, ok);
    expect(decodeJwt(t2.access_token).amr).toEqual(['hwk', 'totp', 'mfa']);
    h.clock.totpOffset += 30;
  });

  it('is behind flag account.passkeys', async () => {
    const off = await startHarness({ passkeys: false });
    try {
      const a = await startAuth(off, { phone: randomPhone() });
      const uid = new URL(a.url).pathname.split('/')[2];
      expect(await (await a.b.req(`${off.issuer}/interaction/${uid}`)).text()).not.toContain('pk-login');
      expect((await a.b.req(`${off.issuer}/interaction/${uid}/passkey/login/options`, { method: 'POST' })).status).toBe(404);
      expect((await a.b.req(`${off.issuer}/interaction/${uid}/passkey/login/verify`, { method: 'POST', json: {} })).status).toBe(404);
    } finally { await off.stop(); }
  });

  it('a deleted account cannot sign in with its old passkey', async () => {
    const first = await login(h, { phone: randomPhone() });
    const va = new VirtualAuthenticator(h.issuer);
    await registerPasskey(first.tokens.access_token, va);
    expect((await call(h, first.tokens.access_token, 'DELETE', '/api/account')).status).toBe(202);
    const s = await startPasskeyLogin();
    expect((await s.a.b.req(`${h.issuer}/interaction/${s.uid}/passkey/login/verify`, { method: 'POST', json: va.assert(s.opts.challenge) })).status).toBe(401);
  });
});
