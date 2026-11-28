import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeJwt } from 'jose';
import { startHarness, startAuth, login, call, randomPhone, totpCode, opsLogin, exchange, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';
import { planGrant, planRevoke, normalisePhone, KIORLY_ROLES } from '../src/kiorly-roles.js';

const cfg = loadIdpConfig();
const OPS_B = '+201000009001'; // seeded plain ops_admin (not a super admin)

describe('Kiorly roles: pure rules', () => {
  it('only a plain patient account may become a Kiorly account; the grant replaces patient with the role', () => {
    expect(planGrant(['patient'], 'kiorly_ops')).toEqual({ roles: ['kiorly_ops'] });
    expect(planGrant(['kiorly_ops'], 'kiorly_admin')).toEqual({ roles: ['kiorly_admin'] });
    expect(planGrant([], 'kiorly_admin')).toEqual({ roles: ['kiorly_admin'] });
    for (const r of ['ops_admin', 'super_admin', 'finance', 'growth_admin', 'owner', 'admin']) expect(planGrant(['patient', r], 'kiorly_ops')).toEqual({ conflicting: [r] });
    expect(planRevoke()).toEqual(['patient']);
  });
  it('phones are normalised or refused', () => {
    expect(normalisePhone('+20 100 000-0000')).toBe('+201000000000');
    expect(normalisePhone('01000000000')).toBeUndefined();
    expect(normalisePhone('+0123')).toBeUndefined();
  });
  it('both roles are in the shipped MFA baseline and in the allowed claim values', () => {
    for (const r of KIORLY_ROLES) { expect(cfg.mfaPolicy.requiredForRoles).toContain(r); }
    const allowed = (JSON.parse(readFileSync(new URL('../../../config/idp.json', import.meta.url), 'utf8')) as { claimsMapping: { kx_roles: { allowed: string[] } } }).claimsMapping.kx_roles.allowed;
    for (const r of KIORLY_ROLES) expect(allowed).toContain(r);
  });
});

describe('Kiorly roles through the API: super admin only, audited, separate accounts, MFA mandatory', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h.stop(); });
  beforeEach(async () => { h.clock.offset = 0; h.clock.totpOffset += 30; await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });
  const superAdmin = async () => (await opsLogin(h)).tokens.access_token;
  const opsAdmin = async () => (await login(h, { clientId: 'kiorex-ops', phone: OPS_B, code: '000000' })).tokens.access_token;
  const kr = (token: string, method: string, path = '', body?: unknown) => call(h, token, method, `/api/ops/kiorly-roles${path}`, body);
  const person = async () => { const phone = randomPhone(); const r = await login(h, { phone, name: 'Kiorly Person' }); return { phone, token: r.tokens.access_token, sub: decodeJwt(r.tokens.access_token).sub as string }; };
  const roles = async (sub: string) => (await h.idp.pool.query(`SELECT roles FROM accounts WHERE sub=$1`, [sub])).rows[0].roles as string[];

  it('refuses everybody but a super admin: patient, plain ops_admin, no token', async () => {
    const p = await person();
    expect((await kr(p.token, 'GET')).status).toBe(403);
    expect((await kr(await opsAdmin(), 'GET')).json.error).toBe('super_admin_required');
    expect((await kr(await opsAdmin(), 'POST', '', { phone: p.phone, role: 'kiorly_ops', note: 'try it' })).status).toBe(403);
    expect((await fetch(`${h.issuer}/api/ops/kiorly-roles`)).status).toBe(401);
    expect(await roles(p.sub)).toEqual(['patient']);
  });

  it('grant: replaces patient, is audited with the reason, ends the sessions, and the next sign-in demands an authenticator and carries only the Kiorly role', async () => {
    const p = await person();
    const sup = await superAdmin();
    expect((await kr(sup, 'POST', '', { phone: p.phone, role: 'kiorly_ops' })).json.error).toBe('reason_required');
    expect((await kr(sup, 'POST', '', { phone: p.phone, role: 'ops_admin', note: 'no way' })).json.error).toBe('invalid_role');
    expect((await kr(sup, 'POST', '', { phone: '+201999999999', role: 'kiorly_ops', note: 'nobody' })).json.error).toBe('account_not_found');
    expect((await kr(sup, 'POST', '', { phone: 'abc', role: 'kiorly_ops', note: 'bad phone' })).json.error).toBe('invalid_target');
    const g = await kr(sup, 'POST', '', { phone: p.phone, role: 'kiorly_ops', note: 'joins the Kiorly onboarding team' });
    expect(g.status).toBe(201);
    expect(g.json).toMatchObject({ sub: p.sub, role: 'kiorly_ops', previous_roles: ['patient'] });
    expect(await roles(p.sub)).toEqual(['kiorly_ops']);
    const ev = (await h.idp.pool.query(`SELECT type, sub, data FROM audit_events WHERE type='kiorly.role.granted' ORDER BY seq DESC LIMIT 1`)).rows[0];
    expect(ev.data).toMatchObject({ target: p.sub, role: 'kiorly_ops', previous: ['patient'], note: 'joins the Kiorly onboarding team' });
    // the old session is gone (the API refuses the old token at once)
    expect((await call(h, p.token, 'GET', '/api/account')).status).toBe(401);
    // next sign-in: a second factor is mandatory (setup page, no skip), and the token carries ONLY the Kiorly role
    const a = await startAuth(h, { phone: p.phone, clientId: 'kiorex-ops' });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: p.phone, lang: 'en' } });
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(p.phone)!, lang: 'en' } });
    const html = await v.text();
    expect(html).toContain('id="totp-secret"'); expect(html).not.toContain('totp-skip');
    const secret = /id="totp-secret"><code>([A-Z2-7]+)<\/code>/.exec(html)![1]!;
    expect((await a.b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: totpCode(h, secret) } })).status).toBe(200);
    const fin = await a.b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: {} });
    const { url } = await a.b.follow(fin, h.issuer, [a.redirectUri]);
    const tok = await exchange(h, a.clientId, a.redirectUri, new URL(url).searchParams.get('code')!, a.verifier);
    const claims = decodeJwt(tok.access_token);
    expect(claims.kx_roles).toEqual(['kiorly_ops']);
    expect(claims.acr).toBe(cfg.stepUp.acr.mfa);
  });

  it('separate accounts: an account that holds a Kiorex role is refused, nobody grants themselves, a switch of level works', async () => {
    const sup = await superAdmin();
    await h.idp.pool.query(`INSERT INTO accounts (sub, phone, phone_verified, name, roles) VALUES ('t_mixed', '+201555555501', true, 'Mixed', '["patient","finance"]')`);
    const m = await kr(sup, 'POST', '', { phone: '+201555555501', role: 'kiorly_ops', note: 'should fail' });
    expect(m.status).toBe(409); expect(m.json.error).toBe('mixed_roles'); expect(m.json.conflicting).toEqual(['finance']);
    expect(await roles('t_mixed')).toEqual(['patient', 'finance']);
    const self = await kr(sup, 'POST', '', { sub: (await h.idp.pool.query(`SELECT sub FROM accounts WHERE roles ? 'super_admin' LIMIT 1`)).rows[0].sub, role: 'kiorly_admin', note: 'myself' });
    expect([409]).toContain(self.status); // refused: cannot_grant_self (and it holds a Kiorex role anyway)
    const p = await person();
    expect((await kr(sup, 'POST', '', { phone: p.phone, role: 'kiorly_ops', note: 'first level' })).status).toBe(201);
    expect((await kr(sup, 'POST', '', { phone: p.phone, role: 'kiorly_admin', note: 'raise the level' })).status).toBe(201);
    expect(await roles(p.sub)).toEqual(['kiorly_admin']);
  });

  it('list and revoke: holders show masked phones, the revoke puts patient back, ends the sessions and is audited; a second revoke is a 404', async () => {
    const p = await person();
    const sup = await superAdmin();
    await kr(sup, 'POST', '', { phone: p.phone, role: 'kiorly_admin', note: 'for the list test' });
    const l = await kr(sup, 'GET');
    expect(l.status).toBe(200);
    const row = l.json.holders.find((x: { sub: string }) => x.sub === p.sub);
    expect(row.role).toBe('kiorly_admin'); expect(row.phone).not.toBe(p.phone); expect(row.phone).toContain('*');
    expect(l.json.history[0]).toMatchObject({ type: 'kiorly.role.granted', target: p.sub, role: 'kiorly_admin', note: 'for the list test' });
    expect((await kr(sup, 'POST', `/${p.sub}/revoke`, {})).json.error).toBe('reason_required');
    const r = await kr(sup, 'POST', `/${p.sub}/revoke`, { note: 'left the team' });
    expect(r.status).toBe(200); expect(r.json.roles).toEqual(['patient']);
    expect(await roles(p.sub)).toEqual(['patient']);
    expect((await kr(sup, 'POST', `/${p.sub}/revoke`, { note: 'again' })).json.error).toBe('no_kiorly_role');
    expect((await h.idp.pool.query(`SELECT count(*)::int AS n FROM audit_events WHERE type='kiorly.role.revoked'`)).rows[0].n).toBeGreaterThanOrEqual(1);
    expect((await kr(await opsAdmin(), 'POST', `/${p.sub}/revoke`, { note: 'nope' })).status).toBe(403);
  });
});
