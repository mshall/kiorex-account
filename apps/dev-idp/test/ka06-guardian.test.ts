import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt, createRemoteJWKSet, jwtVerify } from 'jose';
import { startHarness, login, call, randomPhone, events, inbox, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(() => { h.clock.offset = 0; });

const isoDate = (yearsAgo: number, extraDays = 0) => {
  const d = new Date(Date.now()); d.setUTCFullYear(d.getUTCFullYear() - yearsAgo); d.setUTCDate(d.getUTCDate() + extraDays);
  return d.toISOString().slice(0, 10);
};
const child = (over: Record<string, unknown> = {}) => ({ name: 'Layla', dob: isoDate(6), relationship: 'parent', evidence: { type: 'self_declared' }, ...over });
async function guardian() {
  const phone = randomPhone();
  const r = await login(h, { phone, name: 'Mona', scope: 'openid profile phone kx offline_access' });
  return { phone, token: r.tokens.access_token, sub: decodeJwt(r.tokens.access_token).sub as string };
}

describe('KA-06 guardian <-> dependant links', () => {
  it('creates a dependant (patient subject, no credentials) with an auto-expiring link', async () => {
    const g = await guardian();
    const dob = isoDate(6);
    const r = await call(h, g.token, 'POST', '/api/dependants', child({ dob }));
    expect(r.status).toBe(201);
    expect(r.json.age_of_majority).toBe(18);
    const expectedExpiry = `${Number(dob.slice(0, 4)) + 18}${dob.slice(4)}`;
    expect(String(r.json.expires_at).slice(0, 10)).toBe(expectedExpiry);

    const dep = (await h.idp.pool.query(`SELECT kind, phone, roles, dob::text AS dob FROM accounts WHERE sub=$1`, [r.json.dependant_sub])).rows[0];
    expect(dep).toMatchObject({ kind: 'dependant', phone: null, dob });
    expect(await h.idp.ctx.accounts.findByPhone('+20000000000')).toBeUndefined();
    const cred = await h.idp.pool.query(`SELECT (SELECT count(*) FROM passkeys WHERE sub=$1) + (SELECT count(*) FROM totp_credentials WHERE sub=$1) AS n`, [r.json.dependant_sub]);
    expect(Number(cred.rows[0].n)).toBe(0); // dependants are never login users

    const list = await call(h, g.token, 'GET', '/api/dependants');
    expect(list.json.dependants).toHaveLength(1);
    expect(list.json.dependants[0]).toMatchObject({ name: 'Layla', relationship: 'parent', status: 'active', evidence_type: 'self_declared', dependant_sub: r.json.dependant_sub });

    const ev = (await events(h, { type: 'guardian.link.changed' })).filter((e) => e.data.linkId === r.json.link_id);
    expect(ev[0].data).toMatchObject({ change: 'created', guardianSub: g.sub, dependantSub: r.json.dependant_sub, relationship: 'parent' });
    expect((await inbox(h, { to: g.phone, template: 'guardian_link_created' })).length).toBe(1);
  });

  it('applies age-of-majority rules: adults are refused, link ends the moment majority is reached', async () => {
    const g = await guardian();
    const adult = await call(h, g.token, 'POST', '/api/dependants', child({ dob: isoDate(18) }));
    expect(adult.status).toBe(422);
    expect(adult.json).toMatchObject({ error: 'already_adult', age_of_majority: 18 });
    expect((await call(h, g.token, 'POST', '/api/dependants', child({ dob: isoDate(40) }))).status).toBe(422);
    const almost = await call(h, g.token, 'POST', '/api/dependants', child({ dob: isoDate(18, 2) })); // turns 18 in two days
    expect(almost.status).toBe(201);
    expect((await call(h, g.token, 'POST', '/api/dependants', child({ dob: '2999-01-01' }))).json.error).toBe('dob_in_future');
    expect((await call(h, g.token, 'POST', '/api/dependants', child({ dob: 'yesterday' }))).json.error).toBe('invalid_dob');

    // the link is live until its expiry...
    expect((await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: almost.json.dependant_sub })).status).toBe(200);
    // ...then dependant reaches majority (move the expiry into the past): link auto-expires, acting-as stops
    await h.idp.pool.query(`UPDATE guardian_links SET expires_at = now() - interval '1 minute' WHERE id=$1`, [almost.json.link_id]);
    const denied = await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: almost.json.dependant_sub });
    expect(denied.status).toBe(403);
    expect(denied.json.error).toBe('no_active_guardian_link');
    const list = await call(h, g.token, 'GET', '/api/dependants');
    expect(list.json.dependants.find((d: { dependant_sub: string }) => d.dependant_sub === almost.json.dependant_sub)).toMatchObject({ status: 'expired', ended_reason: 'age_of_majority' });
    const ev = (await events(h, { type: 'guardian.link.changed' })).filter((e) => e.data.linkId === almost.json.link_id);
    expect(ev.map((e) => e.data.change)).toEqual(['created', 'expired']);
    expect((await inbox(h, { to: g.phone, template: 'guardian_link_ended' })).length).toBe(1);
  });

  it('age of majority is per market (config) and defaults to 18', async () => {
    const g = await guardian();
    expect(cfg.guardianship.ageOfMajority).toMatchObject({ EG: 18, default: 18 });
    const r = await call(h, g.token, 'POST', '/api/dependants', child({ market: 'XX' })); // unknown market -> default market
    expect(r.status).toBe(201);
    expect(r.json.age_of_majority).toBe(18);
  });

  it('validates evidence: type required, reference opaque, never a national ID number', async () => {
    const g = await guardian();
    const bad = (evidence: unknown) => call(h, g.token, 'POST', '/api/dependants', child({ evidence }));
    expect((await bad(undefined)).json.error).toBe('invalid_evidence_type');
    expect((await bad({ type: 'passport_scan' })).json.error).toBe('invalid_evidence_type');
    expect((await bad({ type: 'birth_certificate_ref' })).json.error).toBe('evidence_reference_required');
    expect((await bad({ type: 'birth_certificate_ref', reference: '29801011234567' })).json.error).toBe('invalid_evidence_reference'); // 14-digit national ID shape
    expect((await bad({ type: 'self_declared', reference: 'x'.repeat(65) })).json.error).toBe('invalid_evidence_reference');
    const ok = await bad({ type: 'birth_certificate_ref', reference: 'BC-2018-000123' });
    expect(ok.status).toBe(201);
    const row = await h.idp.pool.query(`SELECT evidence FROM guardian_links WHERE id=$1`, [ok.json.link_id]);
    expect(row.rows[0].evidence).toEqual({ type: 'birth_certificate_ref', reference: 'BC-2018-000123' });
    expect((await call(h, g.token, 'POST', '/api/dependants', child({ relationship: 'neighbour' }))).json.error).toBe('invalid_relationship');
    expect((await call(h, g.token, 'POST', '/api/dependants', child({ name: '' }))).json.error).toBe('invalid_name');
  });

  it('guardian acting-as token: sub = dependant, act.sub = guardian, narrow scopes, <= 10 min, no phone/clinical claims', async () => {
    const g = await guardian();
    const dep = (await call(h, g.token, 'POST', '/api/dependants', child())).json;
    const r = await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub, scope: ['dependant:booking'] });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ token_type: 'Bearer', scope: 'dependant:booking', expires_in: 600 });
    const { payload } = await jwtVerify(r.json.access_token, createRemoteJWKSet(new URL(`${h.issuer}/jwks`)), { issuer: h.issuer, audience: 'kiorex-api' });
    expect(payload).toMatchObject({ sub: dep.dependant_sub, act: { sub: g.sub }, scope: 'dependant:booking', kx_roles: ['patient'], name: 'Layla', client_id: 'kiorex-web' });
    expect(payload.exp! - payload.iat!).toBeLessThanOrEqual(600);
    expect(payload.sid).toBe(decodeJwt(g.token).sid); // bound to the guardian's session: logout/revocation covers it
    expect(payload.phone_number).toBeUndefined();
    // ADR-013: only allow-listed claims, nothing clinical
    const standard = new Set(['iss', 'aud', 'exp', 'iat', 'jti', 'client_id', 'scope', 'sub', 'sid', 'auth_time', 'amr', 'acr']);
    const allowed = new Set([...standard, ...cfg.accessTokenClaims]);
    for (const k of Object.keys(payload)) { expect(allowed.has(k), `unexpected claim ${k}`).toBe(true); expect(cfg.forbiddenClaims).not.toContain(k); }
    expect(JSON.stringify(payload)).not.toMatch(/diagnos|medic|allerg|prescri|national_id|patient_id|encounter/i);

    const full = await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub });
    expect(full.json.scope.split(' ').sort()).toEqual([...cfg.guardianship.actScopes].sort());
    expect((await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub, scope: ['clinical:read'] })).json.error).toBe('invalid_scope');
    expect((await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub, scope: [] })).json.error).toBe('invalid_scope');
    expect((await call(h, g.token, 'POST', '/api/guardian/act-as', {})).json.error).toBe('dependant_sub_required');
  });

  it('token lifetime never outlives the link expiry; guardian tokens cannot call the account self-service API', async () => {
    const g = await guardian();
    const dep = (await call(h, g.token, 'POST', '/api/dependants', child())).json;
    await h.idp.pool.query(`UPDATE guardian_links SET expires_at = now() + interval '90 seconds' WHERE id=$1`, [dep.link_id]);
    const r = await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub });
    expect(r.json.expires_in).toBeLessThanOrEqual(90);
    expect(r.json.expires_in).toBeGreaterThan(60);
    // acting-as token is not a valid bearer for sessions / export / delete (it would otherwise act on the dependant's account)
    for (const [m, p] of [['GET', '/api/sessions'], ['GET', '/api/account/export'], ['DELETE', '/api/account'], ['POST', '/api/guardian/act-as']] as const) {
      expect((await call(h, r.json.access_token, m, p, m === 'POST' ? {} : undefined)).status, `${m} ${p}`).toBe(401);
    }
    expect((await h.idp.ctx.accounts.findBySub(dep.dependant_sub))?.status).toBe('active');
  });

  it('only a linked guardian can act; unrelated users and revoked links are refused', async () => {
    const g = await guardian(); const other = await guardian();
    const dep = (await call(h, g.token, 'POST', '/api/dependants', child())).json;
    expect((await call(h, other.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub })).status).toBe(403);
    expect((await call(h, other.token, 'DELETE', `/api/dependants/${dep.dependant_sub}`)).status).toBe(404);
    expect((await call(h, other.token, 'GET', '/api/dependants')).json.dependants).toHaveLength(0);

    expect((await call(h, g.token, 'DELETE', `/api/dependants/${dep.dependant_sub}`)).json.status).toBe('revoked');
    expect((await call(h, g.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub })).status).toBe(403);
    const ev = (await events(h, { type: 'guardian.link.changed' })).filter((e) => e.data.linkId === dep.link_id).map((e) => e.data.change);
    expect(ev).toEqual(['created', 'revoked']);
  });

  it('co-guardian: invited by an existing guardian, pending until the invitee accepts', async () => {
    const g = await guardian(); const co = await guardian();
    const dep = (await call(h, g.token, 'POST', '/api/dependants', child())).json;
    expect((await call(h, co.token, 'POST', `/api/dependants/${dep.dependant_sub}/co-guardians`, { phone: g.phone, relationship: 'parent', evidence: { type: 'self_declared' } })).status).toBe(403); // not a guardian
    expect((await call(h, g.token, 'POST', `/api/dependants/${dep.dependant_sub}/co-guardians`, { phone: g.phone, relationship: 'parent', evidence: { type: 'self_declared' } })).json.error).toBe('cannot_invite_self');
    expect((await call(h, g.token, 'POST', `/api/dependants/${dep.dependant_sub}/co-guardians`, { phone: '+201999999999', relationship: 'parent', evidence: { type: 'self_declared' } })).json.error).toBe('guardian_account_not_found');
    const inv = await call(h, g.token, 'POST', `/api/dependants/${dep.dependant_sub}/co-guardians`, { phone: co.phone, relationship: 'legal_guardian', evidence: { type: 'court_order_ref', reference: 'CO-77' } });
    expect(inv.status).toBe(201);
    expect(inv.json.status).toBe('pending');
    expect((await call(h, co.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub })).status).toBe(403); // not yet
    expect((await call(h, g.token, 'POST', `/api/guardian-links/${inv.json.link_id}/accept`)).status).toBe(404); // only the invitee can accept
    expect((await call(h, co.token, 'POST', `/api/guardian-links/${inv.json.link_id}/accept`)).json.status).toBe('active');
    expect((await call(h, co.token, 'POST', '/api/guardian/act-as', { dependant_sub: dep.dependant_sub })).status).toBe(200);
    expect((await call(h, g.token, 'POST', `/api/dependants/${dep.dependant_sub}/co-guardians`, { phone: co.phone, relationship: 'parent', evidence: { type: 'self_declared' } })).json.error).toBe('link_exists');
  });

  it('deleting a guardian ends their links (KA-07 interplay)', async () => {
    const g = await guardian();
    const dep = (await call(h, g.token, 'POST', '/api/dependants', child())).json;
    expect((await h.idp.ctx.accounts.findBySub(dep.dependant_sub))?.kind).toBe('dependant');
    expect((await call(h, g.token, 'DELETE', '/api/account')).status).toBe(202);
    const link = await h.idp.pool.query(`SELECT status, ended_reason FROM guardian_links WHERE id=$1`, [dep.link_id]);
    expect(link.rows[0]).toMatchObject({ status: 'revoked', ended_reason: 'guardian_deleted' });
  });
});
