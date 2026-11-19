import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, call, randomPhone, events, inbox, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
const ORG_SCOPE = 'openid profile phone kx kx_org offline_access';
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(() => { h.clock.offset = 0; });

async function user(scope = ORG_SCOPE) {
  const phone = randomPhone();
  const r = await login(h, { phone, name: 'Staff', scope });
  return { phone, token: r.tokens.access_token, sub: decodeJwt(r.tokens.access_token).sub as string, tokens: r.tokens };
}
const newOrg = (token: string, over: Record<string, unknown> = {}) => call(h, token, 'POST', '/api/orgs', { legal_name: 'Nile Clinic', country: 'eg', ...over });
async function invite(owner: { token: string }, org: string, to: { phone: string }, role = 'doctor') {
  const r = await call(h, owner.token, 'POST', `/api/orgs/${org}/invitations`, { phone: to.phone, role_hint: role });
  expect(r.status).toBe(201);
  const msg = (await inbox(h, { to: to.phone, template: 'org_invitation' })).at(-1)!;
  return { id: r.json.invitation_id as string, token: msg.data.token as string, body: msg.body, res: r };
}

describe('KA-09 organisations and memberships', () => {
  it('creates an organisation; creator becomes owner; product refs are whitelisted identifiers only', async () => {
    const o = await user();
    const r = await newOrg(o.token, { product_refs: { kiorly_clinic_tenant_id: 'tn_123' } });
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ legal_name: 'Nile Clinic', country: 'EG', product_refs: { kiorly_clinic_tenant_id: 'tn_123' } });
    const mine = await call(h, o.token, 'GET', '/api/orgs');
    expect(mine.json.memberships).toEqual([expect.objectContaining({ org_id: r.json.org_id, role_hint: 'owner', status: 'active' })]);
    expect((await newOrg(o.token, { product_refs: { patient_chart: 'x' } })).json.error).toBe('invalid_product_ref');
    expect((await newOrg(o.token, { legal_name: '' })).json.error).toBe('invalid_legal_name');
    expect((await newOrg(o.token, { country: 'Egypt' })).json.error).toBe('invalid_country');
    // unknown/clinical-looking fields are never stored or echoed
    const sneaky = await newOrg(o.token, { diagnosis: 'x', patient_id: 'p1' });
    expect(JSON.stringify(sneaky.json)).not.toMatch(/diagnosis|patient_id/);
  });

  it('kx_orgs claim (org_id + role_hint only) appears only with scope kx_org and follows the memberships', async () => {
    const o = await user();
    const org = (await newOrg(o.token)).json.org_id;
    // login again so a fresh token reflects the membership
    const fresh = await login(h, { phone: o.phone, scope: ORG_SCOPE });
    const c = decodeJwt(fresh.tokens.access_token);
    expect(c.kx_orgs).toEqual([{ org_id: org, role_hint: 'owner' }]);
    const noScope = await login(h, { phone: o.phone, scope: 'openid profile phone kx offline_access' });
    expect(decodeJwt(noScope.tokens.access_token).kx_orgs).toBeUndefined();
    // ADR-013: only allow-listed claims, no clinical data
    const standard = new Set(['iss', 'aud', 'exp', 'iat', 'jti', 'client_id', 'scope', 'sub', 'sid', 'auth_time', 'amr', 'acr']);
    const allowed = new Set([...standard, ...cfg.accessTokenClaims]);
    for (const k of Object.keys(c)) { expect(allowed.has(k), `unexpected claim ${k}`).toBe(true); expect(cfg.forbiddenClaims).not.toContain(k); }
    expect(Object.keys((c.kx_orgs as object[])[0]).sort()).toEqual(['org_id', 'role_hint']);
    // a user without memberships gets an empty list, not an error
    const lone = await user();
    expect(decodeJwt(lone.tokens.access_token).kx_orgs).toEqual([]);
  });

  it('invitations: single-use, bound to the invitee phone, delivered via the dev inbox, expire in 7 days', async () => {
    const owner = await user(); const doc = await user(); const stranger = await user();
    const org = (await newOrg(owner.token)).json.org_id;
    const inv = await invite(owner, org, doc, 'doctor');
    expect(inv.body).toContain('Nile Clinic');
    const ttlDays = (new Date(inv.res.json.expires_at).getTime() - Date.now()) / 86400_000;
    expect(ttlDays).toBeGreaterThan(6.99);
    expect(ttlDays).toBeLessThan(7.01);
    expect(cfg.orgs.invitationTtlDays).toBe(7);
    // the token is not stored in clear
    const row = await h.idp.pool.query(`SELECT token_hash FROM invitations WHERE id=$1`, [inv.id]);
    expect(row.rows[0].token_hash).not.toContain(inv.token);

    expect((await call(h, stranger.token, 'POST', '/api/invitations/accept', { token: inv.token })).json.error).toBe('invitation_not_for_this_account');
    expect((await call(h, doc.token, 'POST', '/api/invitations/accept', { token: 'short' })).json.error).toBe('invalid_token');
    expect((await call(h, doc.token, 'POST', '/api/invitations/accept', { token: 'x'.repeat(32) })).json.error).toBe('invitation_not_found');
    const ok = await call(h, doc.token, 'POST', '/api/invitations/accept', { token: inv.token });
    expect(ok.status).toBe(200);
    expect(ok.json).toMatchObject({ org_id: org, role_hint: 'doctor' });
    const again = await call(h, doc.token, 'POST', '/api/invitations/accept', { token: inv.token });
    expect(again.status).toBe(410);
    expect(again.json.error).toBe('invitation_used');
    const fresh = await login(h, { phone: doc.phone, scope: ORG_SCOPE });
    expect(decodeJwt(fresh.tokens.access_token).kx_orgs).toEqual([{ org_id: org, role_hint: 'doctor' }]);
  });

  it('invitation accept is atomic: concurrent accepts create exactly one membership', async () => {
    const owner = await user(); const doc = await user();
    const org = (await newOrg(owner.token)).json.org_id;
    const inv = await invite(owner, org, doc, 'nurse');
    const results = await Promise.all(Array.from({ length: 6 }, () => call(h, doc.token, 'POST', '/api/invitations/accept', { token: inv.token })));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await h.idp.pool.query(`SELECT count(*)::int AS n FROM memberships WHERE org_id=$1 AND sub=$2`, [org, doc.sub])).rows[0].n).toBe(1);
  });

  it('expired and revoked invitations are refused', async () => {
    const owner = await user(); const a = await user(); const b = await user();
    const org = (await newOrg(owner.token)).json.org_id;
    const exp = await invite(owner, org, a);
    await h.idp.pool.query(`UPDATE invitations SET expires_at = now() - interval '1 second' WHERE id=$1`, [exp.id]);
    expect((await call(h, a.token, 'POST', '/api/invitations/accept', { token: exp.token })).json.error).toBe('invitation_expired');
    const rev = await invite(owner, org, b);
    expect((await call(h, owner.token, 'DELETE', `/api/orgs/${org}/invitations/${rev.id}`)).status).toBe(200);
    expect((await call(h, b.token, 'POST', '/api/invitations/accept', { token: rev.token })).json.error).toBe('invitation_revoked');
  });

  it('role hints are validated; only owner/admin manage; non-members cannot even see the org', async () => {
    const owner = await user(); const doc = await user(); const outsider = await user(); const admin = await user();
    const org = (await newOrg(owner.token)).json.org_id;
    expect((await call(h, owner.token, 'POST', `/api/orgs/${org}/invitations`, { phone: doc.phone, role_hint: 'surgeon' })).json.error).toBe('invalid_role_hint');
    expect((await call(h, owner.token, 'POST', `/api/orgs/${org}/invitations`, { phone: 'x', role_hint: 'doctor' })).json.error).toBe('invalid_phone');
    await call(h, doc.token, 'POST', '/api/invitations/accept', { token: (await invite(owner, org, doc, 'doctor')).token });
    await call(h, admin.token, 'POST', '/api/invitations/accept', { token: (await invite(owner, org, admin, 'admin')).token });

    expect((await call(h, doc.token, 'POST', `/api/orgs/${org}/invitations`, { phone: outsider.phone, role_hint: 'nurse' })).status).toBe(403);
    expect((await call(h, doc.token, 'GET', `/api/orgs/${org}/members`)).status).toBe(403);
    expect((await call(h, outsider.token, 'GET', `/api/orgs/${org}/members`)).status).toBe(404);
    expect((await call(h, admin.token, 'POST', `/api/orgs/${org}/invitations`, { phone: outsider.phone, role_hint: 'owner' })).json.error).toBe('only_owner_can_invite_owner');
    const members = await call(h, admin.token, 'GET', `/api/orgs/${org}/members`);
    expect(members.json.members.map((m: { role_hint: string }) => m.role_hint).sort()).toEqual(['admin', 'doctor', 'owner']);
    expect(Object.keys(members.json.members[0]).sort()).toEqual(['effective_from', 'expires_at', 'membership_id', 'name', 'role_hint', 'status', 'sub']);
  });

  it('role changes and removal update tokens and emit membership.changed; the last owner cannot leave', async () => {
    const owner = await user(); const doc = await user();
    const org = (await newOrg(owner.token)).json.org_id;
    await call(h, doc.token, 'POST', '/api/invitations/accept', { token: (await invite(owner, org, doc, 'doctor')).token });
    expect((await call(h, owner.token, 'PATCH', `/api/orgs/${org}/members/${doc.sub}`, { role_hint: 'finance' })).status).toBe(200);
    expect((await call(h, owner.token, 'PATCH', `/api/orgs/${org}/members/${doc.sub}`, { role_hint: 'wizard' })).json.error).toBe('invalid_role_hint');
    expect(decodeJwt((await login(h, { phone: doc.phone, scope: ORG_SCOPE })).tokens.access_token).kx_orgs).toEqual([{ org_id: org, role_hint: 'finance' }]);

    expect((await call(h, owner.token, 'DELETE', `/api/orgs/${org}/members/${owner.sub}`)).json.error).toBe('last_owner');
    expect((await call(h, owner.token, 'DELETE', `/api/orgs/${org}/members/${doc.sub}`)).status).toBe(200);
    expect(decodeJwt((await login(h, { phone: doc.phone, scope: ORG_SCOPE })).tokens.access_token).kx_orgs).toEqual([]);
    const ev = (await events(h, { type: 'membership.changed' })).filter((e) => e.data.orgId === org && e.data.sub === doc.sub).map((e) => e.data.change);
    expect(ev).toEqual(['added', 'role_changed', 'removed']);
    expect(JSON.stringify(await events(h, { type: 'membership.changed' }))).not.toMatch(/diagnos|medic|allerg|prescri|patient_id|encounter/i);
    // a member may leave on their own
    const doc2 = await user();
    await call(h, doc2.token, 'POST', '/api/invitations/accept', { token: (await invite(owner, org, doc2, 'nurse')).token });
    expect((await call(h, doc2.token, 'DELETE', `/api/orgs/${org}/members/${doc2.sub}`)).status).toBe(200);
  });

  it('deleting an account removes its memberships (KA-07 interplay)', async () => {
    const owner = await user(); const doc = await user();
    const org = (await newOrg(owner.token)).json.org_id;
    await call(h, doc.token, 'POST', '/api/invitations/accept', { token: (await invite(owner, org, doc, 'doctor')).token });
    expect((await call(h, doc.token, 'DELETE', '/api/account')).status).toBe(202);
    expect((await h.idp.pool.query(`SELECT status FROM memberships WHERE sub=$1`, [doc.sub])).rows[0].status).toBe('revoked');
  });
});
