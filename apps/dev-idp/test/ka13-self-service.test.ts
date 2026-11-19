import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, call, randomPhone, inbox, opsLogin, seedOps, totpCode, type Harness } from './helpers.js';
import { VirtualAuthenticator } from './webauthn.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

async function registerVirtualPasskey(hh: Harness, token: string) {
  const auth = new VirtualAuthenticator(hh.issuer);
  const opts = await call(hh, token, 'POST', '/api/passkeys/register/options');
  const v = await call(hh, token, 'POST', '/api/passkeys/register/verify', auth.register(opts.json.challenge));
  expect(v.json.verified).toBe(true);
  return { credentialId: auth.id };
}

async function user(name = 'Test User', clientId = 'kiorex-web') {
  const phone = randomPhone();
  const r = await login(h, { phone, name, clientId, scope: 'openid profile phone kx kx_org offline_access' });
  return { phone, token: r.tokens.access_token, sub: decodeJwt(r.tokens.access_token).sub as string };
}

describe('Passport self-service API gaps (profile, policy, events, apps, invitations)', () => {
  it('GET/PATCH /api/account: profile read and name/language edit; phone is read-only', async () => {
    const u = await user('Mona');
    const me = await call(h, u.token, 'GET', '/api/account');
    expect(me.json).toMatchObject({ sub: u.sub, name: 'Mona', phone: u.phone, phone_verified: true, locale: 'en', roles: ['patient'], mfa_required: false, totp_enrolled: false });
    const p = await call(h, u.token, 'PATCH', '/api/account', { name: ' منى ', locale: 'ar', phone: '+201111111111' });
    expect(p.status).toBe(200);
    expect(p.json).toMatchObject({ name: 'منى', locale: 'ar' });
    const again = await call(h, u.token, 'GET', '/api/account');
    expect(again.json).toMatchObject({ name: 'منى', locale: 'ar', phone: u.phone });
    expect((await call(h, u.token, 'PATCH', '/api/account', { locale: 'fr' })).json.error).toBe('invalid_locale');
    expect((await call(h, u.token, 'PATCH', '/api/account', { name: 'x'.repeat(81) })).json.error).toBe('invalid_name');
    expect((await call(h, u.token, 'PATCH', '/api/account', {})).json.error).toBe('nothing_to_update');
    expect((await call(h, 'bad', 'GET', '/api/account')).status).toBe(401);
  });

  it('GET /api/meta exposes the policy the UI needs (no secrets)', async () => {
    const u = await user();
    const m = await call(h, u.token, 'GET', '/api/meta');
    expect(m.status).toBe(200);
    expect(m.json.guardian.age_of_majority.EG).toBe(18);
    expect(m.json.guardian.evidence_types).toContain('self_declared');
    expect(m.json.orgs.role_hints).toContain('doctor');
    expect(m.json.step_up.freshness_seconds).toBe(300);
    expect(m.json.mfa_required_roles).toContain('ops_admin');
    expect(JSON.stringify(m.json)).not.toMatch(/secret/i);
  });

  it('GET /api/security/events lists only my own auth events, with whitelisted data', async () => {
    const a = await user(); const b = await user();
    await call(h, a.token, 'PATCH', '/api/account', { name: 'Renamed' });
    const ev = await call(h, a.token, 'GET', '/api/security/events?limit=10');
    expect(ev.status).toBe(200);
    const types = ev.json.events.map((e: { type: string }) => e.type);
    expect(types).toContain('login.success');
    expect(types).toContain('account.profile.updated');
    const login0 = ev.json.events.find((e: { type: string }) => e.type === 'login.success');
    expect(Object.keys(login0.data).every((k) => ['client', 'amr', 'acr'].includes(k))).toBe(true);
    expect(login0.hash).toBeUndefined();
    const other = await call(h, b.token, 'GET', '/api/security/events');
    expect(other.json.events.every((e: { id: number }) => !ev.json.events.some((x: { id: number }) => x.id === e.id))).toBe(true);
    expect((await call(h, a.token, 'GET', '/api/security/events?limit=1')).json.events).toHaveLength(1);
  });

  it('DELETE /api/passkeys/:id removes only my own passkey', async () => {
    const a = await user(); const b = await user();
    const pa = await registerVirtualPasskey(h, a.token);
    const pb = await registerVirtualPasskey(h, b.token);
    expect((await call(h, a.token, 'DELETE', `/api/passkeys/${encodeURIComponent(pb.credentialId)}`)).status).toBe(404);
    expect((await call(h, b.token, 'GET', '/api/passkeys')).json.passkeys).toHaveLength(1);
    expect((await call(h, a.token, 'DELETE', `/api/passkeys/${encodeURIComponent(pa.credentialId)}`)).status).toBe(200);
    expect((await call(h, a.token, 'GET', '/api/passkeys')).json.passkeys).toHaveLength(0);
    const ev = await call(h, a.token, 'GET', '/api/security/events');
    expect(ev.json.events.map((e: { type: string }) => e.type)).toContain('passkey.removed');
  });

  it('DELETE /api/totp: refused for MFA-required roles; optional TOTP needs a fresh step-up', async () => {
    const ops = await opsLogin(h);
    expect((await call(h, ops.tokens.access_token, 'DELETE', '/api/totp')).json.error).toBe('totp_required_for_role');
    expect((await call(h, ops.tokens.access_token, 'GET', '/api/account')).json).toMatchObject({ mfa_required: true, totp_enrolled: true });
    expect(seedOps(h).totpSecret).toBeTruthy();

    const u = await user();
    const enrol = await call(h, u.token, 'POST', '/api/totp/enroll');
    expect(enrol.status).toBe(200);
    expect((await call(h, u.token, 'POST', '/api/totp/confirm', { code: totpCode(h, enrol.json.secret) })).json.enrolled).toBe(true);
    h.clock.totpOffset += 30;
    const denied = await call(h, u.token, 'DELETE', '/api/totp');
    expect(denied.status).toBe(403);
    expect(denied.json.error).toBe('step_up_required');
    const up = await call(h, u.token, 'POST', '/api/step-up', { method: 'totp', code: totpCode(h, enrol.json.secret) });
    expect(up.status).toBe(200);
    expect((await call(h, up.json.access_token, 'DELETE', '/api/totp')).status).toBe(200);
    expect((await call(h, up.json.access_token, 'GET', '/api/totp')).json.enrolled).toBe(false);
    expect((await call(h, up.json.access_token, 'DELETE', '/api/totp')).status).toBe(404);
  });

  it('co-guardian invitations can be declined by the invitee only', async () => {
    const g = await user('Guardian'); const co = await user('Co');
    const dep = await call(h, g.token, 'POST', '/api/dependants', { name: 'Kid', dob: '2018-05-05', relationship: 'parent', evidence: { type: 'self_declared' } });
    expect(dep.status).toBe(201);
    const inv = await call(h, g.token, 'POST', `/api/dependants/${dep.json.dependant_sub}/co-guardians`, { phone: co.phone, relationship: 'grandparent', evidence: { type: 'self_declared' } });
    expect(inv.status).toBe(201);
    expect((await call(h, g.token, 'POST', `/api/guardian-links/${inv.json.link_id}/decline`)).status).toBe(404);
    expect((await call(h, co.token, 'GET', '/api/dependants')).json.dependants[0]).toMatchObject({ status: 'pending', name: 'Kid' });
    expect((await call(h, co.token, 'POST', `/api/guardian-links/${inv.json.link_id}/decline`)).json).toMatchObject({ status: 'revoked' });
    expect((await call(h, co.token, 'POST', `/api/guardian-links/${inv.json.link_id}/accept`)).status).toBe(404);
    // the invitee can be invited again afterwards
    expect((await call(h, g.token, 'POST', `/api/dependants/${dep.json.dependant_sub}/co-guardians`, { phone: co.phone, relationship: 'grandparent', evidence: { type: 'self_declared' } })).status).toBe(201);
  });

  it('pending org invitations are listed for the invitee phone; accept/decline by id; token never leaks', async () => {
    const owner = await user('Owner'); const doc = await user('Doc'); const other = await user('Other');
    const org = await call(h, owner.token, 'POST', '/api/orgs', { legal_name: 'Nile Clinic', country: 'EG' });
    const i1 = await call(h, owner.token, 'POST', `/api/orgs/${org.json.org_id}/invitations`, { phone: doc.phone, role_hint: 'doctor' });
    const i2 = await call(h, owner.token, 'POST', `/api/orgs/${org.json.org_id}/invitations`, { phone: other.phone, role_hint: 'nurse' });
    const list = await call(h, doc.token, 'GET', '/api/invitations');
    expect(list.json.invitations).toHaveLength(1);
    expect(list.json.invitations[0]).toMatchObject({ invitation_id: i1.json.invitation_id, legal_name: 'Nile Clinic', role_hint: 'doctor', invited_by_name: 'Owner' });
    expect(JSON.stringify(list.json)).not.toMatch(/token/);
    expect((await call(h, doc.token, 'POST', `/api/invitations/${i2.json.invitation_id}/accept`)).status).toBe(404); // not mine
    const ok = await call(h, doc.token, 'POST', `/api/invitations/${i1.json.invitation_id}/accept`);
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ org_id: org.json.org_id, role_hint: 'doctor' });
    expect((await call(h, doc.token, 'GET', '/api/invitations')).json.invitations).toHaveLength(0);
    expect((await call(h, doc.token, 'GET', '/api/orgs')).json.memberships[0]).toMatchObject({ role_hint: 'doctor' });
    expect((await call(h, other.token, 'POST', `/api/invitations/${i2.json.invitation_id}/decline`)).status).toBe(200);
    // the declined token no longer works
    const tok = (await inbox(h, { to: other.phone, template: 'org_invitation' })).at(-1)!.data.token;
    expect((await call(h, other.token, 'POST', '/api/invitations/accept', { token: tok })).status).toBe(410);
  });

  it('connected apps: lists granted clients and revokes one (not the current app)', async () => {
    const phone = randomPhone();
    const web = await login(h, { phone, name: 'Apps', clientId: 'kiorex-web' });
    const pass = await login(h, { phone, clientId: 'kiorex-passport-web', redirectUri: `${h.issuer}/account/callback`, scope: 'openid profile phone kx kx_org offline_access' });
    const t = pass.tokens.access_token;
    const apps = await call(h, t, 'GET', '/api/connected-apps');
    expect(apps.status).toBe(200);
    const ids = apps.json.apps.map((a: { client_id: string }) => a.client_id).sort();
    expect(ids).toEqual(['kiorex-passport-web', 'kiorex-web']);
    expect(apps.json.apps.find((a: { client_id: string }) => a.client_id === 'kiorex-web')).toMatchObject({ name: 'Kiorex patient web' });
    expect((await call(h, t, 'DELETE', '/api/connected-apps/kiorex-passport-web')).json.error).toBe('cannot_revoke_current_app');
    expect((await call(h, t, 'DELETE', '/api/connected-apps/kiorex-ops')).status).toBe(404);
    const rv = await call(h, t, 'DELETE', '/api/connected-apps/kiorex-web');
    expect(rv.status).toBe(200);
    expect((await call(h, t, 'GET', '/api/connected-apps')).json.apps.map((a: { client_id: string }) => a.client_id)).toEqual(['kiorex-passport-web']);
    // the revoked app's own token no longer works (its session authorization is gone); the Passport token still does
    expect((await call(h, web.tokens.access_token, 'GET', '/api/sessions')).status).toBe(401);
    expect((await call(h, t, 'GET', '/api/sessions')).status).toBe(200);
  });

  it('serves the Passport web shell and an esbuild bundle under /account', async () => {
    const shell = await fetch(`${h.issuer}/account/security`);
    expect(shell.status).toBe(200);
    const html = await shell.text();
    expect(html).toContain('<div id="root">');
    expect(html).toContain('/account/assets/app.js');
    expect(html).toMatch(/"clientId":"kiorex-passport-web"/);
    const js = await fetch(`${h.issuer}/account/assets/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect((await fetch(`${h.issuer}/account/assets/app.css`)).status).toBe(200);
    expect((await fetch(`${h.issuer}/account/assets/nope.js`)).status).toBe(404);
  });
});
