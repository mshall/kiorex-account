import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from 'jose';
import { startHarness, login, startAuth, randomPhone, Browser, pkce, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

const jwks = () => createRemoteJWKSet(new URL(`${h.issuer}/jwks`));
const STANDARD = new Set(['iss', 'aud', 'exp', 'iat', 'jti', 'client_id', 'scope', 'sub', 'sid', 'auth_time', 'nonce', 'at_hash', 'azp', 'amr', 'acr', 'rat', 'c_hash', 'gty']);

describe('discovery and clients (KA-01)', () => {
  it('publishes OIDC discovery with S256 PKCE and JWKS', async () => {
    const d = await (await fetch(`${h.issuer}/.well-known/openid-configuration`)).json();
    expect(d.issuer).toBe(h.issuer);
    expect(d.code_challenge_methods_supported).toEqual(['S256']);
    expect(d.jwks_uri).toBe(`${h.issuer}/jwks`);
    const keys = await (await fetch(d.jwks_uri)).json();
    expect(keys.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig' });
    expect(keys.keys[0].d).toBeUndefined();
  });
  it('rejects authorization without PKCE and with unregistered redirect URI', async () => {
    const b = new Browser();
    const base = { client_id: 'kiorex-web', response_type: 'code', scope: 'openid', state: 's' };
    let r = await b.req(`${h.issuer}/auth?${new URLSearchParams({ ...base, redirect_uri: 'http://localhost:5180/auth/callback' })}`);
    const loc = r.headers.get('location') ?? '';
    expect(loc).toContain('error=invalid_request'); // code_challenge required
    r = await b.req(`${h.issuer}/auth?${new URLSearchParams({ ...base, redirect_uri: 'http://evil.example/cb', code_challenge: 'x'.repeat(43), code_challenge_method: 'S256' })}`);
    expect(r.status).toBeGreaterThanOrEqual(400); // exact redirect URIs: no redirect to attacker
    expect(r.headers.get('location') ?? '').not.toContain('evil.example');
  });
  it('rejects plain code_challenge_method', async () => {
    const b = new Browser();
    const r = await b.req(`${h.issuer}/auth?${new URLSearchParams({ client_id: 'kiorex-web', response_type: 'code', scope: 'openid', redirect_uri: 'http://localhost:5180/auth/callback', code_challenge: 'x'.repeat(43), code_challenge_method: 'plain' })}`);
    expect(r.headers.get('location') ?? '').toMatch(/error=invalid_request/);
  });
});

describe('phone OTP login: every registered client', () => {
  for (const clientId of ['kiorex-web', 'kiorex-ops', 'kiorex-mobile', 'kiorly', 'kiorly-team', 'kiorly-clinic']) {
    it(`${clientId}: auth code + PKCE + OTP -> tokens`, async () => {
      const phone = randomPhone();
      const r = await login(h, { clientId, phone, name: 'Test User' });
      expect(r.tokens.token_type).toBe('Bearer');
      expect(r.tokens.expires_in).toBeLessThanOrEqual(900);
      expect(r.tokens.refresh_token).toBeTruthy();
      expect(r.tokens.id_token).toBeTruthy();
      const { payload } = await jwtVerify(r.tokens.access_token, jwks(), { issuer: h.issuer, audience: 'kiorex-api' });
      expect(payload.client_id).toBe(clientId);
    });
  }

  it('PKCE: wrong verifier is rejected, code is single use', async () => {
    const phone = randomPhone();
    const a = await startAuth(h, { phone });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
    let r = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)! } });
    r = await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} });
    const { url } = await a.b.follow(r, h.issuer, [a.redirectUri]);
    const code = new URL(url).searchParams.get('code')!;
    const bad = await fetch(`${h.issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'kiorex-web', code, redirect_uri: a.redirectUri, code_verifier: 'A'.repeat(50) }) });
    expect(bad.status).toBe(400);
    const mk = (verifier: string) => fetch(`${h.issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'kiorex-web', code, redirect_uri: a.redirectUri, code_verifier: verifier }) });
    expect((await mk(a.verifier)).status).toBe(200);
    expect((await mk(a.verifier)).status).toBe(400); // authorization codes are single-use
  });

  it('seeded numbers accept 000000 (dev), other numbers do not', async () => {
    const seeded = h.idp.seedUsers[0].phone;
    const r = await login(h, { phone: seeded, code: '000000' });
    expect(decodeJwt(r.tokens.access_token).sub).toBe(h.idp.seedUsers[0].sub);

    const other = randomPhone();
    const a = await startAuth(h, { phone: other });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: other } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: '000000' } });
    expect(v.status).toBe(400);
  });

  it('serves AR (RTL) and EN pages with Kiorex branding', async () => {
    const a = await startAuth(h, { phone: randomPhone(), lang: 'ar' });
    const uid = new URL(a.url).pathname.split('/')[2];
    const html = await (await a.b.req(`${h.issuer}/interaction/${uid}`)).text();
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('#3730A3');
    expect(html).toContain('#E8735E');
    expect(html).toContain('/static/brand/passport-lockup.svg');
    const en = await (await a.b.req(`${h.issuer}/interaction/${uid}?lang=en`)).text();
    expect(en).toContain('dir="ltr"');
    expect(en).toContain('Sign in with Kiorex Passport');
    const svg = await fetch(`${h.issuer}/static/brand/kiorex-mark.svg`);
    expect(svg.headers.get('content-type')).toContain('image/svg+xml');
  });
});

describe('token claims (INTEGRATION.md, KA-04, ADR-013)', () => {
  it('access token: RS256 JWT, aud kiorex-api, required claims, <=15 min, seeded patient', async () => {
    const amira = h.idp.seedUsers.find((u) => u.name === 'Amira')!;
    const r = await login(h, { phone: amira.phone, code: '000000', lang: 'ar' });
    expect(decodeProtectedHeader(r.tokens.access_token)).toMatchObject({ alg: 'RS256', typ: 'at+jwt' });
    const { payload } = await jwtVerify(r.tokens.access_token, jwks(), { issuer: h.issuer, audience: 'kiorex-api', algorithms: ['RS256'] });
    expect(payload).toMatchObject({
      sub: amira.sub, phone_number: amira.phone, phone_number_verified: true, name: 'Amira', locale: 'ar', kx_roles: ['patient'], aud: 'kiorex-api',
    });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(900);
    expect(payload.sub).not.toContain(amira.phone.slice(1)); // opaque subject, not derived from phone
  });

  it('ops super admin carries role hints only', async () => {
    const ops = h.idp.seedUsers.find((u) => u.roles.includes('super_admin'))!;
    const r = await login(h, { clientId: 'kiorex-ops', phone: ops.phone, code: '000000' });
    expect(decodeJwt(r.tokens.access_token).kx_roles).toEqual(['ops_admin', 'super_admin']);
  });

  it('no clinical or unexpected claims in access, ID tokens or userinfo (ADR-013)', async () => {
    const r = await login(h, { phone: h.idp.seedUsers[1].phone, code: '000000' });
    const allowed = new Set([...STANDARD, ...cfg.accessTokenClaims]);
    for (const tok of [r.tokens.access_token, r.tokens.id_token]) {
      const claims = decodeJwt(tok);
      for (const k of Object.keys(claims)) {
        expect(allowed.has(k), `unexpected claim ${k}`).toBe(true);
        expect(cfg.forbiddenClaims).not.toContain(k);
      }
      expect(JSON.stringify(claims)).not.toMatch(/diagnos|medic|allerg|prescri|national_id|patient_id|encounter/i);
    }
    const id = decodeJwt(r.tokens.id_token);
    expect(id).toMatchObject({ aud: 'kiorex-web', phone_number_verified: true, kx_roles: ['patient'] });
    expect(id.sid).toBeTruthy();
  });

  it('refresh rotation with reuse detection (KA-04)', async () => {
    const r = await login(h, { phone: randomPhone() });
    const rt1 = r.tokens.refresh_token!;
    const refresh = (rt: string) => fetch(`${h.issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: 'kiorex-web', refresh_token: rt }) });
    const a = await refresh(rt1);
    expect(a.status).toBe(200);
    const t2 = await a.json();
    expect(t2.refresh_token).toBeTruthy();
    expect(t2.refresh_token).not.toBe(rt1);
    expect(decodeJwt(t2.access_token).aud).toBe('kiorex-api');
    // replaying the rotated token must fail AND revoke the descendant
    expect((await refresh(rt1)).status).toBe(400);
    expect((await refresh(t2.refresh_token)).status).toBe(400);
  });

  it('confidential client must authenticate', async () => {
    const phone = randomPhone();
    const a = await startAuth(h, { phone, clientId: 'kiorly-clinic' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
    let r = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)! } });
    r = await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} });
    const { url } = await a.b.follow(r, h.issuer, [a.redirectUri]);
    const code = new URL(url).searchParams.get('code')!;
    const noAuth = await fetch(`${h.issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: 'kiorly-clinic', code, redirect_uri: a.redirectUri, code_verifier: a.verifier }) });
    expect(noAuth.status).toBe(401);
  });
});

describe('RP-initiated logout and passkey flag', () => {
  it('end_session with id_token_hint logs out and delivers a back-channel logout', async () => {
    const r = await login(h, { phone: randomPhone(), clientId: 'kiorex-web' });
    const before = h.received.length;
    const q = new URLSearchParams({ id_token_hint: r.tokens.id_token, post_logout_redirect_uri: 'http://localhost:5180/', state: 'x' });
    let res = await r.b.req(`${h.issuer}/session/end?${q}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('xsrf');
    const xsrf = html.match(/name="xsrf" value="([^"]+)"/)![1];
    const sessionPath = html.match(/action="([^"]+)"/)![1];
    res = await r.b.req(sessionPath.startsWith('http') ? sessionPath : `${h.issuer}${sessionPath}`, { method: 'POST', form: { xsrf, logout: 'yes' } });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('http://localhost:5180/');
    expect(h.received.length).toBeGreaterThan(before);
    const got = h.received[h.received.length - 1];
    expect(got).toMatchObject({ clientId: 'kiorex-web', event: 'session.revoked' });
    expect(got.sid).toBe(decodeJwt(r.tokens.id_token).sid);
  });

  for (const [clientId, origin] of [['kiorly-pharmacy-web', 'http://localhost:5192/'], ['kiorly-lab-web', 'http://localhost:5193/'], ['kiorly-clinic', 'http://localhost:5174/']] as const) {
    it(`${clientId}: product web sign-out (id_token_hint + registered post-logout URI) ends the Passport session, so no silent re-sign-in`, async () => {
      const scope = clientId === 'kiorly-clinic' ? undefined : 'openid profile phone';
      const r = await login(h, { phone: randomPhone(), clientId, scope });
      expect(decodeJwt(r.tokens.id_token).aud).toBe(clientId);
      const q = new URLSearchParams({ id_token_hint: r.tokens.id_token, post_logout_redirect_uri: origin, state: 'x' });
      const page = await (await r.b.req(`${h.issuer}/session/end?${q}`)).text();
      expect(page).toContain('f.submit()'); // auto-confirmed because the hint proves the app holds the id token
      const xsrf = page.match(/name="xsrf" value="([^"]+)"/)![1];
      const action = page.match(/action="([^"]+)"/)![1];
      const out = await r.b.req(action.startsWith('http') ? action : `${h.issuer}${action}`, { method: 'POST', form: { xsrf, logout: 'yes' } });
      expect(out.status).toBe(303);
      expect(out.headers.get('location')).toContain(origin);
      // the Passport session is gone: authorizing again needs the OTP login again (no interaction-free code)
      const again = await startAuth(h, { phone: randomPhone(), clientId, scope, browser: r.b });
      expect(new URL(again.url).pathname).toMatch(/^\/interaction\//);
      // an unregistered post-logout URI is refused (open-redirect guard)
      const r2 = await login(h, { phone: randomPhone(), clientId, scope });
      const bad = new URLSearchParams({ id_token_hint: r2.tokens.id_token, post_logout_redirect_uri: 'http://evil.example/', state: 'x' });
      expect((await r2.b.req(`${h.issuer}/session/end?${bad}`)).status).toBeGreaterThanOrEqual(400);
    });
  }

  it('a hinted logout page confirms itself (no "Stay signed in" trap); without a hint the confirm buttons stay', async () => {
    const r = await login(h, { phone: randomPhone(), clientId: 'kiorex-web' });
    const q = new URLSearchParams({ id_token_hint: r.tokens.id_token, post_logout_redirect_uri: 'http://localhost:5180/', state: 'x' });
    const hinted = await (await r.b.req(`${h.issuer}/session/end?${q}`)).text();
    expect(hinted).toContain("f.submit()");
    expect(hinted).toContain('name="logout"');
    const r2 = await login(h, { phone: randomPhone(), clientId: 'kiorex-web' });
    const plain = await (await r2.b.req(`${h.issuer}/session/end`)).text();
    expect(plain).not.toContain('f.submit()');
    expect(plain).toContain('value="yes"');
  });

  it('passkey registration is behind flag account.passkeys', async () => {
    const off = await startHarness({ passkeys: false });
    try {
      const phone = randomPhone();
      const a = await startAuth(off, { phone });
      const uid = new URL(a.url).pathname.split('/')[2];
      await a.b.req(`${off.issuer}/interaction/${uid}`);
      await a.b.req(`${off.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
      const v = await a.b.req(`${off.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: off.channel.lastCodeFor(phone)! } });
      expect(v.status).toBe(303); // flag off: no passkey step, login finishes directly
      const po = await a.b.req(`${off.issuer}/interaction/${uid}/passkey/options`, { method: 'POST' });
      expect(po.status).toBe(404);
    } finally { await off.stop(); }
  });

  it('with the flag on, the passkey step offers WebAuthn options bound to the verified account', async () => {
    const phone = randomPhone();
    const a = await startAuth(h, { phone });
    const uid = new URL(a.url).pathname.split('/')[2];
    expect((await a.b.req(`${h.issuer}/interaction/${uid}/passkey/options`, { method: 'POST' })).status).toBe(401); // not verified yet
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)! } });
    expect(v.status).toBe(200);
    expect(await v.text()).toContain('pk-add');
    const o = await (await a.b.req(`${h.issuer}/interaction/${uid}/passkey/options`, { method: 'POST' })).json();
    expect(o.rp).toMatchObject({ id: 'localhost', name: 'Kiorex' });
    expect(o.challenge).toBeTruthy();
    const bad = await a.b.req(`${h.issuer}/interaction/${uid}/passkey/verify`, { method: 'POST', json: { id: 'x', rawId: 'x', type: 'public-key', response: {}, clientExtensionResults: {} } });
    expect(bad.status).toBe(400);
  });
});

describe('kiorly staff-app client (final name) and the legacy kiorly-team client', () => {
  it('kiorly is a public PKCE native client with the kiorly:// redirects and RP-initiated logout URIs', () => {
    const c = cfg.clients.find((x) => x.clientId === 'kiorly')!;
    expect(c).toMatchObject({ type: 'public', pkce: 'S256', applicationType: 'native' });
    expect(c.environments.local.redirectUris).toEqual(['kiorly://auth/callback', 'exp+kiorly://auth/callback', 'http://localhost:8082/auth/callback']);
    expect(c.environments.local.postLogoutRedirectUris).toEqual(['kiorly://auth/logout', 'exp+kiorly://auth/logout', 'http://localhost:8082/']);
  });
  it('accepts each kiorly redirect, rejects the legacy scheme on the new client and any unregistered one', async () => {
    for (const redirect_uri of ['kiorly://auth/callback', 'exp+kiorly://auth/callback', 'http://localhost:8082/auth/callback']) {
      const { challenge } = pkce();
      const r = await new Browser().req(`${h.issuer}/auth?${new URLSearchParams({ client_id: 'kiorly', response_type: 'code', scope: 'openid', redirect_uri, code_challenge: challenge, code_challenge_method: 'S256', state: 's' })}`);
      expect(r.headers.get('location') ?? '', redirect_uri).toMatch(/\/interaction\//);
    }
    for (const redirect_uri of ['kiorlyteam://auth/callback', 'kiorlywork://auth/callback']) {
      const bad = await new Browser().req(`${h.issuer}/auth?${new URLSearchParams({ client_id: 'kiorly', response_type: 'code', scope: 'openid', redirect_uri, code_challenge: pkce().challenge, code_challenge_method: 'S256' })}`);
      expect(bad.headers.get('location') ?? '').not.toContain('/interaction/');
    }
  });
});

describe('legacy kiorly-team staff-app client (kept additive)', () => {
  it('is registered as a public PKCE client with the staff-app redirects only', () => {
    const c = cfg.clients.find((x) => x.clientId === 'kiorly-team')!;
    expect(c).toMatchObject({ type: 'public', pkce: 'S256', applicationType: 'native' });
    expect(c.environments.local.redirectUris).toEqual(['kiorlyteam://auth/callback', 'exp+kiorly-team://auth/callback', 'http://localhost:8082/auth/callback']);
  });
  it('accepts each registered redirect and rejects an unregistered one', async () => {
    for (const redirect_uri of ['exp+kiorly-team://auth/callback', 'http://localhost:8082/auth/callback']) {
      const { challenge } = pkce();
      const r = await new Browser().req(`${h.issuer}/auth?${new URLSearchParams({ client_id: 'kiorly-team', response_type: 'code', scope: 'openid', redirect_uri, code_challenge: challenge, code_challenge_method: 'S256', state: 's' })}`);
      expect(r.headers.get('location') ?? '', redirect_uri).toMatch(/\/interaction\//);
    }
    const bad = await new Browser().req(`${h.issuer}/auth?${new URLSearchParams({ client_id: 'kiorly-team', response_type: 'code', scope: 'openid', redirect_uri: 'kiorlywork://auth/callback', code_challenge: pkce().challenge, code_challenge_method: 'S256' })}`);
    expect(bad.headers.get('location') ?? '').not.toContain('/interaction/');
  });
});
