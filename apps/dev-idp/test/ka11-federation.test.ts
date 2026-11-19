import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, startAuth, completeLogin, randomPhone, call, login, type Harness, type startAuth as StartAuth } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });

type Auth = Awaited<ReturnType<typeof StartAuth>>;
const uidOf = (a: Auth) => new URL(a.url).pathname.split('/')[2];

/** Drives the browser through the upstream (second, fake IdP) and back to our callback. Returns the response of /federate/done. */
async function viaUpstream(a: Auth, userId: string) {
  const uid = uidOf(a);
  await a.b.req(`${h.issuer}/interaction/${uid}`);
  const go = await a.b.req(`${h.issuer}/interaction/${uid}/federate/fake-hospital`);
  expect(go.status).toBe(303);
  const authorize = go.headers.get('location')!;
  expect(authorize.startsWith(h.idp.upstream!.issuer)).toBe(true);
  expect(new URL(authorize).searchParams.get('code_challenge_method')).toBe('S256');
  // upstream (separate server, no cookies shared with our IdP): picker page, then pick
  const page = await (await fetch(authorize)).text();
  const pick = page.match(new RegExp(`href="([^"]+user=${userId})"`))![1].replace(/&amp;/g, '&');
  const back = await fetch(new URL(pick, h.idp.upstream!.issuer), { redirect: 'manual' });
  expect(back.status).toBe(302);
  const cb = back.headers.get('location')!;
  expect(cb.startsWith(`${h.issuer}/federation/callback`)).toBe(true);
  const r = await a.b.req(cb); // our callback: server-side code exchange + ID token verification
  return { r, cb, uid };
}

async function otpLinkAndFinish(a: Auth, uid: string, phone: string) {
  let r = await a.b.req(`${h.issuer}/interaction/${uid}`);
  expect(await r.text()).toContain('not linked yet'); // link notice on the phone page
  await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
  r = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)! } });
  expect(r.status).toBe(200); // passkey step
  return completeLogin(h, a, await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} }));
}

describe('KA-11 federation / provider SSO via a second fake upstream IdP', () => {
  it('runs a separate upstream OIDC provider (own issuer, own JWKS, PKCE S256) while flag account.provider_sso is on', async () => {
    const up = h.idp.upstream!;
    expect(up.issuer).not.toBe(h.issuer);
    const d = await (await fetch(`${up.issuer}/.well-known/openid-configuration`)).json();
    expect(d).toMatchObject({ issuer: up.issuer, code_challenge_methods_supported: ['S256'] });
    const jwks = await (await fetch(d.jwks_uri)).json();
    const ours = await (await fetch(`${h.issuer}/jwks`)).json();
    expect(jwks.keys[0].n).not.toBe(ours.keys[0].n); // independent key material
    expect((await (await fetch(`${h.issuer}/healthz`)).json()).upstream_issuer).toBe(up.issuer);
    expect(cfg.federation.flag).toBe('account.provider_sso');
  });

  it('first sign-in through the upstream is not trusted alone: verify the phone once to LINK it (amr otp+fed), then SSO works without OTP (amr fed)', async () => {
    const phone = randomPhone();
    const a = await startAuth(h, { phone, clientId: 'kiorly-clinic' });
    const { r, uid } = await viaUpstream(a, 'dr-salma');
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toContain(`/interaction/${uid}/federate/done`);
    const done = await a.b.req(new URL(r.headers.get('location')!, h.issuer).toString());
    expect(done.status).toBe(303); // not linked yet -> back to the phone page, no session
    expect(done.headers.get('location')).not.toContain('code=');

    const first = await otpLinkAndFinish(a, uid, phone);
    const c1 = decodeJwt(first.access_token);
    expect(c1.amr).toEqual(['otp', 'fed']);
    expect(c1.acr).toBe(cfg.stepUp.acr.basic); // upstream login never implies MFA (SC04)
    const link = await h.idp.pool.query(`SELECT upstream_id, upstream_sub, email, sub FROM federated_identities WHERE upstream_sub='dr-salma'`);
    expect(link.rows[0]).toMatchObject({ upstream_id: 'fake-hospital', email: 'salma@fake-hospital.test', sub: c1.sub });

    // second time: straight through the upstream, no OTP at all
    const before = h.channel.sent.length;
    const b = await startAuth(h, { phone, clientId: 'kiorly-clinic' });
    const second = await viaUpstream(b, 'dr-salma');
    await b.b.req(new URL(second.r.headers.get('location')!, h.issuer).toString()); // /federate/done -> back to /interaction/uid
    const fin = await b.b.req(`${h.issuer}/interaction/${second.uid}`);
    const tokens = await completeLogin(h, b, fin);
    const c2 = decodeJwt(tokens.access_token);
    expect(c2.sub).toBe(c1.sub);
    expect(c2.amr).toEqual(['fed']);
    expect(h.channel.sent.length).toBe(before);
    // the API lists the link; unlinking makes the next upstream login require the phone again
    expect((await call(h, tokens.access_token, 'GET', '/api/federation/identities')).json.identities).toHaveLength(1);
    expect((await call(h, tokens.access_token, 'DELETE', '/api/federation/identities/fake-hospital/dr-salma')).status).toBe(200);
    const c = await startAuth(h, { phone, clientId: 'kiorly-clinic' });
    const third = await viaUpstream(c, 'dr-salma');
    const done3 = await c.b.req(new URL(third.r.headers.get('location')!, h.issuer).toString());
    expect(done3.status).toBe(303);
    expect(await (await c.b.req(`${h.issuer}/interaction/${third.uid}`)).text()).toContain('not linked yet');
  });

  it('upstream identity cannot take over an existing Passport: a different upstream user links only via its own phone verification', async () => {
    const victim = await login(h, { phone: randomPhone(), name: 'Victim' });
    const a = await startAuth(h, { phone: '+201000000000' });
    const { r, uid } = await viaUpstream(a, 'nurse-omar');
    await a.b.req(new URL(r.headers.get('location')!, h.issuer).toString());
    // without the OTP of the victim's number there is no session; the OTP gate is mandatory
    const fin = await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} });
    expect(fin.headers.get('location')).not.toContain('code=');
    expect((await h.idp.pool.query(`SELECT count(*)::int AS n FROM federated_identities WHERE sub=$1`, [decodeJwt(victim.tokens.access_token).sub])).rows[0].n).toBe(0);
  });

  it('callback rejects unknown/replayed state and tampered codes', async () => {
    const a = await startAuth(h, { phone: randomPhone() });
    const { cb } = await viaUpstream(a, 'dr-salma');
    expect((await a.b.req(cb)).status).toBe(400); // state already consumed: replay refused
    expect((await fetch(`${h.issuer}/federation/callback?code=abc&state=nope`)).status).toBe(400);
    expect((await fetch(`${h.issuer}/federation/callback?error=access_denied`)).status).toBe(400);
  });

  it('a federated account holding a privileged role still has to pass TOTP (provider authorization stays in the product)', async () => {
    const phone = randomPhone();
    await login(h, { phone });
    await h.idp.pool.query(`UPDATE accounts SET roles='["finance"]' WHERE phone=$1`, [phone]);
    const a = await startAuth(h, { phone, clientId: 'kiorly-clinic' });
    const { r, uid } = await viaUpstream(a, 'dr-salma');
    await a.b.req(new URL(r.headers.get('location')!, h.issuer).toString());
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)! } });
    expect(await v.text()).toContain('id="totp"'); // TOTP enrolment/challenge, not a token
  });

  it('is behind flag account.provider_sso: OFF hides the button, 403 FEATURE_DISABLED, no upstream started', async () => {
    const off = await startHarness({ providerSso: false });
    try {
      expect(off.idp.upstream).toBeUndefined();
      const a = await startAuth(off, { phone: randomPhone() });
      const uid = uidOf(a);
      expect(await (await a.b.req(`${off.issuer}/interaction/${uid}`)).text()).not.toContain('data-federate');
      const go = await a.b.req(`${off.issuer}/interaction/${uid}/federate/fake-hospital`);
      expect(go.status).toBe(403);
      expect(await go.json()).toMatchObject({ error: 'FEATURE_DISABLED', key: 'account.provider_sso' });
      expect((await fetch(`${off.issuer}/federation/callback?code=a&state=b`)).status).toBe(403);
      const t = await login(off, { phone: randomPhone() });
      expect((await call(off, t.tokens.access_token, 'GET', '/api/federation/identities')).status).toBe(403);
    } finally { await off.stop(); }
  });

  it('login page shows the upstream button and the unknown upstream is a 404', async () => {
    const a = await startAuth(h, { phone: randomPhone() });
    const uid = uidOf(a);
    expect(await (await a.b.req(`${h.issuer}/interaction/${uid}`)).text()).toContain('data-federate="fake-hospital"');
    expect((await a.b.req(`${h.issuer}/interaction/${uid}/federate/nope`)).status).toBe(404);
  });
});
