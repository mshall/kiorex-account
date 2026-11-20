import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, call, randomPhone, events, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

const SCOPE = 'openid profile phone kx kx_org offline_access';
const SCIM_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';

async function org() {
  const phone = randomPhone();
  const r = await login(h, { phone, name: 'Owner', scope: SCOPE });
  const token = r.tokens.access_token as string;
  const o = await call(h, token, 'POST', '/api/orgs', { legal_name: 'Delta Clinics', country: 'EG' });
  const t = await call(h, token, 'POST', `/api/orgs/${o.json.org_id}/scim-tokens`, { label: 'Entra' });
  expect(t.status).toBe(201);
  return { ownerToken: token, ownerSub: decodeJwt(token).sub as string, orgId: o.json.org_id as string, scim: t.json.token as string, tokenId: t.json.token_id as string };
}
async function scim(token: string | undefined, method: string, path: string, body?: unknown) {
  const res = await fetch(`${h.issuer}/scim/v2${path}`, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/scim+json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, ct: res.headers.get('content-type') ?? '', json: (text ? JSON.parse(text) : {}) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
const userBody = (phone: string, over: Record<string, unknown> = {}) => ({
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: `dr.${phone.slice(-6)}@delta.example`, externalId: `ext-${phone.slice(-4)}`,
  displayName: 'Dr Hala', phoneNumbers: [{ value: phone, type: 'mobile', primary: true }], active: true, ...over,
});

describe('KA-11 SCIM 2.0 provisioning', () => {
  it('manages one bearer token per org: shown once, hashed, revocable, managers only', async () => {
    const o = await org();
    expect(o.scim).toMatch(/^kxscim_/);
    const list = await call(h, o.ownerToken, 'GET', `/api/orgs/${o.orgId}/scim-tokens`);
    expect(list.json.tokens).toEqual([expect.objectContaining({ token_id: o.tokenId, label: 'Entra', revoked_at: null })]);
    expect(JSON.stringify(list.json)).not.toContain(o.scim);
    const row = (await h.idp.pool.query(`SELECT token_hash FROM scim_tokens WHERE id=$1`, [o.tokenId])).rows[0];
    expect(row.token_hash).not.toContain(o.scim);
    const other = await login(h, { phone: randomPhone(), name: 'Stranger', scope: SCOPE });
    expect((await call(h, other.tokens.access_token, 'GET', `/api/orgs/${o.orgId}/scim-tokens`)).status).toBe(404);
    expect((await scim(o.scim, 'GET', '/Users')).status).toBe(200);
    expect((await call(h, o.ownerToken, 'DELETE', `/api/orgs/${o.orgId}/scim-tokens/${o.tokenId}`)).status).toBe(200);
    const after = await scim(o.scim, 'GET', '/Users');
    expect(after.status).toBe(401);
    expect(after.json.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:Error');
  });

  it('rejects missing, malformed and foreign tokens; tokens are scoped to their organisation', async () => {
    const a = await org(); const b = await org();
    expect((await scim(undefined, 'GET', '/Users')).status).toBe(401);
    expect((await scim('nope', 'GET', '/Users')).status).toBe(401);
    expect((await scim('kxscim_wrong', 'GET', '/Users')).status).toBe(401);
    const phone = randomPhone();
    const created = await scim(a.scim, 'POST', '/Users', userBody(phone));
    expect(created.status).toBe(201);
    expect((await scim(b.scim, 'GET', `/Users/${created.json.id}`)).status).toBe(404);
    expect((await scim(b.scim, 'GET', '/Users')).json.totalResults).toBe(0);
  });

  it('serves discovery documents', async () => {
    const o = await org();
    const c = await scim(o.scim, 'GET', '/ServiceProviderConfig');
    expect(c.status).toBe(200); expect(c.ct).toContain('application/scim+json');
    expect(c.json).toMatchObject({ patch: { supported: true }, bulk: { supported: false }, filter: { supported: true } });
    expect((await scim(o.scim, 'GET', '/ResourceTypes')).json.Resources.map((r: any) => r.name)).toEqual(['User', 'Group']); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect((await scim(o.scim, 'GET', '/Schemas')).json.totalResults).toBe(3);
  });

  it('provisions a user: creates a Passport identity + org membership with the default role, and emits membership.changed', async () => {
    const o = await org(); const phone = randomPhone();
    const before = (await events(h, { type: 'membership.changed' })).length;
    const r = await scim(o.scim, 'POST', '/Users', userBody(phone));
    expect(r.status).toBe(201);
    expect(r.json).toMatchObject({ userName: expect.stringContaining('@delta.example'), active: true, displayName: 'Dr Hala', phoneNumbers: [{ value: phone }], 'urn:kiorex:params:scim:schemas:extension:passport:2.0:User': { roleHint: 'staff' } });
    const acct = (await h.idp.pool.query(`SELECT sub, phone_verified FROM accounts WHERE phone=$1`, [phone])).rows[0];
    expect(acct.sub).toBe(r.json.id); expect(acct.phone_verified).toBe(false);
    const m = (await call(h, o.ownerToken, 'GET', `/api/orgs/${o.orgId}/members`)).json.members;
    expect(m).toEqual(expect.arrayContaining([expect.objectContaining({ sub: r.json.id, role_hint: 'staff', status: 'active' })]));
    expect((await events(h, { type: 'membership.changed' })).length).toBe(before + 1);
    // duplicates
    expect((await scim(o.scim, 'POST', '/Users', userBody(phone))).json.scimType).toBe('uniqueness');
    // the person can sign in with OTP and sees the membership in their token hints
    const li = await login(h, { phone, scope: SCOPE });
    expect(decodeJwt(li.tokens.access_token).kx_orgs).toEqual([{ org_id: o.orgId, role_hint: 'staff' }]);
  });

  it('reuses an existing Passport identity for the same phone and never exposes other orgs', async () => {
    const o = await org(); const phone = randomPhone();
    const existing = await login(h, { phone, name: 'Existing Person', scope: SCOPE });
    const sub = decodeJwt(existing.tokens.access_token).sub;
    const r = await scim(o.scim, 'POST', '/Users', userBody(phone, { displayName: 'Directory Name', 'urn:kiorex:params:scim:schemas:extension:passport:2.0:User': { roleHint: 'doctor' } }));
    expect(r.status).toBe(201); expect(r.json.id).toBe(sub);
    expect(r.json.displayName).toBe('Existing Person'); // the person's own name is not overwritten by the directory
    expect(r.json['urn:kiorex:params:scim:schemas:extension:passport:2.0:User'].roleHint).toBe('doctor');
  });

  it('validates input: phone required, role hints whitelisted, owner cannot be granted, no clinical attributes stored', async () => {
    const o = await org();
    const noPhone = await scim(o.scim, 'POST', '/Users', { schemas: [], userName: 'x@y.z' });
    expect(noPhone.status).toBe(400); expect(noPhone.json.scimType).toBe('invalidValue');
    expect((await scim(o.scim, 'POST', '/Users', userBody('0100', {}))).status).toBe(400);
    expect((await scim(o.scim, 'POST', '/Users', userBody(randomPhone(), { 'urn:kiorex:params:scim:schemas:extension:passport:2.0:User': { roleHint: 'wizard' } }))).status).toBe(400);
    const owner = await scim(o.scim, 'POST', '/Users', userBody(randomPhone(), { 'urn:kiorex:params:scim:schemas:extension:passport:2.0:User': { roleHint: 'owner' } }));
    expect(owner.status).toBe(403); expect(owner.json.scimType).toBe('mutability');
    const sneaky = await scim(o.scim, 'POST', '/Users', userBody(randomPhone(), { diagnosis: 'x', licenseNumber: '123', title: 'Dr' }));
    expect(sneaky.status).toBe(201);
    expect(JSON.stringify(sneaky.json)).not.toMatch(/diagnosis|licenseNumber/);
  });

  it('lists, filters (userName eq / externalId eq) and paginates', async () => {
    const o = await org(); const phones = [randomPhone(), randomPhone(), randomPhone()];
    for (const p of phones) expect((await scim(o.scim, 'POST', '/Users', userBody(p))).status).toBe(201);
    const all = await scim(o.scim, 'GET', '/Users');
    expect(all.json).toMatchObject({ totalResults: 3, startIndex: 1, itemsPerPage: 3 });
    const page = await scim(o.scim, 'GET', '/Users?startIndex=2&count=1');
    expect(page.json).toMatchObject({ totalResults: 3, startIndex: 2, itemsPerPage: 1 });
    const un = userBody(phones[1]).userName;
    const f = await scim(o.scim, 'GET', `/Users?filter=${encodeURIComponent(`userName eq "${un.toUpperCase()}"`)}`);
    expect(f.json.totalResults).toBe(1); expect(f.json.Resources[0].userName).toBe(un);
    const e = await scim(o.scim, 'GET', `/Users?filter=${encodeURIComponent(`externalId eq "ext-${phones[2].slice(-4)}"`)}`);
    expect(e.json.totalResults).toBe(1);
    expect((await scim(o.scim, 'GET', `/Users?filter=${encodeURIComponent('title pr')}`)).json.scimType).toBe('invalidFilter');
  });

  it('PATCH active=false ends the membership (token hints drop), active=true restores it; Entra-style string booleans work', async () => {
    const o = await org(); const phone = randomPhone();
    const id = (await scim(o.scim, 'POST', '/Users', userBody(phone))).json.id as string;
    const off = await scim(o.scim, 'PATCH', `/Users/${id}`, { schemas: [SCIM_PATCH], Operations: [{ op: 'Replace', path: 'active', value: 'False' }] });
    expect(off.status).toBe(200); expect(off.json.active).toBe(false); expect(off.json.groups).toEqual([]);
    const st = (await h.idp.pool.query(`SELECT status FROM memberships WHERE org_id=$1 AND sub=$2`, [o.orgId, id])).rows[0];
    expect(st.status).toBe('revoked');
    expect(decodeJwt((await login(h, { phone, scope: SCOPE })).tokens.access_token).kx_orgs).toEqual([]);
    const on = await scim(o.scim, 'PATCH', `/Users/${id}`, { schemas: [SCIM_PATCH], Operations: [{ op: 'replace', value: { active: true } }] });
    expect(on.json.active).toBe(true);
    const m = (await call(h, o.ownerToken, 'GET', `/api/orgs/${o.orgId}/members`)).json.members.filter((x: any) => x.sub === id && x.status === 'active'); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(m).toHaveLength(1);
  });

  it('PUT replaces attributes and role; the phone (identity key) cannot be changed', async () => {
    const o = await org(); const phone = randomPhone();
    const id = (await scim(o.scim, 'POST', '/Users', userBody(phone))).json.id as string;
    const ok = await scim(o.scim, 'PUT', `/Users/${id}`, userBody(phone, { userName: 'renamed@delta.example', 'urn:kiorex:params:scim:schemas:extension:passport:2.0:User': { roleHint: 'nurse' } }));
    expect(ok.status).toBe(200); expect(ok.json).toMatchObject({ userName: 'renamed@delta.example', emails: [{ value: 'renamed@delta.example' }] });
    expect(ok.json['urn:kiorex:params:scim:schemas:extension:passport:2.0:User'].roleHint).toBe('nurse');
    const bad = await scim(o.scim, 'PUT', `/Users/${id}`, userBody(randomPhone()));
    expect(bad.status).toBe(400); expect(bad.json.scimType).toBe('mutability');
    const events_ = await events(h, { type: 'membership.changed' });
    expect(events_.some((e: any) => e.data.sub === id && e.data.change === 'role_changed' && e.data.roleHint === 'nurse')).toBe(true); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it('DELETE removes membership + mapping but keeps the Passport identity; owners are protected', async () => {
    const o = await org(); const phone = randomPhone();
    const id = (await scim(o.scim, 'POST', '/Users', userBody(phone))).json.id as string;
    expect((await scim(o.scim, 'DELETE', `/Users/${id}`)).status).toBe(204);
    expect((await scim(o.scim, 'GET', `/Users/${id}`)).status).toBe(404);
    expect((await h.idp.pool.query(`SELECT status FROM accounts WHERE sub=$1`, [id])).rows[0].status).toBe('active');
    expect((await h.idp.pool.query(`SELECT status FROM memberships WHERE org_id=$1 AND sub=$2`, [o.orgId, id])).rows[0].status).toBe('revoked');
    // the organisation owner's phone cannot be re-provisioned by SCIM
    const ownerPhone = (await h.idp.pool.query(`SELECT phone FROM accounts WHERE sub=$1`, [o.ownerSub])).rows[0].phone;
    expect((await scim(o.scim, 'POST', '/Users', userBody(ownerPhone))).status).toBe(409);
  });

  it('Groups are the role hints: list, membership read, add member = role change, create/delete refused', async () => {
    const o = await org(); const phone = randomPhone();
    const id = (await scim(o.scim, 'POST', '/Users', userBody(phone))).json.id as string;
    const groups = await scim(o.scim, 'GET', '/Groups');
    expect(groups.json.Resources.map((g: any) => g.displayName)).toEqual(expect.arrayContaining(['owner', 'admin', 'doctor', 'staff'])); // eslint-disable-line @typescript-eslint/no-explicit-any
    const staff = await scim(o.scim, 'GET', '/Groups/role-staff');
    expect(staff.json.members).toEqual([expect.objectContaining({ value: id })]);
    const moved = await scim(o.scim, 'PATCH', '/Groups/role-doctor', { schemas: [SCIM_PATCH], Operations: [{ op: 'add', path: 'members', value: [{ value: id }] }] });
    expect(moved.status).toBe(200); expect(moved.json.members).toEqual([expect.objectContaining({ value: id })]);
    expect((await scim(o.scim, 'GET', `/Users/${id}`)).json.groups).toEqual([expect.objectContaining({ display: 'doctor' })]);
    expect((await scim(o.scim, 'GET', '/Groups/role-staff')).json.members).toEqual([]);
    expect((await scim(o.scim, 'GET', '/Groups?filter=' + encodeURIComponent('displayName eq "doctor"'))).json.totalResults).toBe(1);
    expect((await scim(o.scim, 'POST', '/Groups', { displayName: 'x' })).status).toBe(409);
    expect((await scim(o.scim, 'DELETE', '/Groups/role-doctor')).status).toBe(403);
    expect((await scim(o.scim, 'PATCH', '/Groups/role-owner', { schemas: [SCIM_PATCH], Operations: [{ op: 'add', path: 'members', value: [{ value: id }] }] })).status).toBe(403);
    expect((await scim(o.scim, 'PATCH', '/Groups/role-doctor', { schemas: [SCIM_PATCH], Operations: [{ op: 'add', path: 'members', value: [{ value: 'unknown' }] }] })).status).toBe(400);
    expect((await scim(o.scim, 'GET', '/Groups/role-wizard')).status).toBe(404);
  });
});
