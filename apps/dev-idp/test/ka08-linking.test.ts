import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, call, randomPhone, events, inbox, lastInboxCode, opsLogin, seedOps, api, type Harness } from './helpers.js';
import { VirtualAuthenticator } from './webauthn.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(async () => { h.clock.offset = 0; h.clock.totpOffset += 30; await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });

async function user(name: string) {
  const phone = randomPhone();
  const r = await login(h, { phone, name });
  return { phone, name, token: r.tokens.access_token, tokens: r.tokens, sub: decodeJwt(r.tokens.access_token).sub as string };
}
/** primary requests a link to secondary and verifies the OTP delivered to the SECONDARY's number via the dev inbox. */
async function verified(p: { token: string }, s: { phone: string }) {
  const req = await call(h, p.token, 'POST', '/api/links', { phone: s.phone });
  expect(req.status).toBe(201);
  const code = await lastInboxCode(h, s.phone);
  expect(code).toMatch(/^\d{6}$/);
  const v = await call(h, p.token, 'POST', `/api/links/${req.json.link_id}/verify`, { code });
  return { id: req.json.link_id as string, v };
}

describe('KA-08 account linking: dual verification, never auto-merge', () => {
  it('requires the primary session AND an OTP delivered to the secondary number (dev inbox); result waits for operator review', async () => {
    const a = await user('Amal Hassan'); const b = await user('Amal H.');
    const req = await call(h, a.token, 'POST', '/api/links', { phone: b.phone });
    expect(req.json).toMatchObject({ status: 'pending_verification' });
    const msgs = await inbox(h, { to: b.phone });
    expect(msgs.at(-1)).toMatchObject({ channel: 'whatsapp', to: b.phone });
    expect(await inbox(h, { to: a.phone, after: String(msgs.at(-1)!.id) })).toHaveLength(0); // nothing goes to the primary's number
    // wrong code, then right code
    expect((await call(h, a.token, 'POST', `/api/links/${req.json.link_id}/verify`, { code: '999999' })).status).toBe(400);
    const ok = await call(h, a.token, 'POST', `/api/links/${req.json.link_id}/verify`, { code: await lastInboxCode(h, b.phone) });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('pending_review');
    expect(ok.json.note).toContain('never merged automatically');
    // NEVER auto-merge: both accounts still exist, independent, and B still signs in as B
    const rows = await h.idp.pool.query(`SELECT sub, status, phone, merged_into FROM accounts WHERE sub = ANY($1)`, [[a.sub, b.sub]]);
    expect(rows.rows.every((r) => r.status === 'active' && r.merged_into === null && r.phone)).toBe(true);
    const again = await login(h, { phone: b.phone });
    expect(decodeJwt(again.tokens.access_token).sub).toBe(b.sub);
    expect((await events(h, { type: 'account.merged' })).filter((e) => e.data.linkId === req.json.link_id)).toHaveLength(0);
  });

  it('refuses self-link, unknown number, wrong owner, wrong state, duplicates; locks after 5 wrong codes', async () => {
    const a = await user('A'); const b = await user('B'); const c = await user('C');
    expect((await call(h, a.token, 'POST', '/api/links', { phone: a.phone })).json.error).toBe('cannot_link_to_self');
    expect((await call(h, a.token, 'POST', '/api/links', { phone: '+201888888888' })).json.error).toBe('account_not_found');
    expect((await call(h, a.token, 'POST', '/api/links', { phone: 'nope' })).json.error).toBe('invalid_phone');
    const r = await call(h, a.token, 'POST', '/api/links', { phone: b.phone });
    expect((await call(h, a.token, 'POST', '/api/links', { phone: b.phone })).json.error).toBe('request_exists');
    expect((await call(h, c.token, 'POST', `/api/links/${r.json.link_id}/verify`, { code: '000000' })).status).toBe(404); // not the requester
    for (let i = 0; i < 4; i++) expect((await call(h, a.token, 'POST', `/api/links/${r.json.link_id}/verify`, { code: '111111' })).status).toBe(400);
    expect((await call(h, a.token, 'POST', `/api/links/${r.json.link_id}/verify`, { code: '111111' })).status).toBe(429);
    // reviewing a link that was never verified is impossible
    const ops = await opsLogin(h);
    const approve = await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${r.json.link_id}/approve`, {});
    expect(approve.status).toBe(409);
    expect(approve.json.error).toBe('wrong_state');
    h.clock.totpOffset += 30;
    expect((await call(h, a.token, 'DELETE', `/api/links/${r.json.link_id}`)).json.status).toBe('cancelled');
  });

  it('detects conflicts and blocks approval until the reviewer resolves them; operator needs ops role + MFA', async () => {
    const a = await user('Mona Ali'); const b = await user('Mona Aly');
    await h.idp.pool.query(`UPDATE accounts SET locale='ar', roles='["patient","finance"]' WHERE sub=$1`, [b.sub]);
    const { id, v } = await verified(a, b);
    const codes = v.json.conflicts.map((c: { code: string }) => c.code).sort();
    expect(codes).toEqual(['locale_mismatch', 'name_mismatch', 'privileged_role_on_secondary']);
    expect(v.json.conflicts.find((c: { code: string }) => c.code === 'name_mismatch').severity).toBe('blocking');

    // not an operator / not stepped up
    expect((await call(h, a.token, 'GET', '/api/ops/links')).json.error).toBe('ops_role_required');
    const ops = await opsLogin(h);
    const queue = await call(h, ops.tokens.access_token, 'GET', '/api/ops/links');
    expect(queue.json.links.map((l: { link_id: string }) => l.link_id)).toContain(id);

    const blocked = await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/approve`, {});
    expect(blocked.status).toBe(409);
    expect(blocked.json).toMatchObject({ error: 'resolution_required', missing: ['name'] });
    const merged = await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/approve`, { resolution: { name: 'secondary' }, note: 'documents checked' });
    expect(merged.status).toBe(200);
    expect(merged.json).toMatchObject({ status: 'merged', reviewed_by: seedOps(h).sub });
    // privileged role is never carried over; chosen name applied
    const pa = (await h.idp.pool.query(`SELECT name, roles FROM accounts WHERE sub=$1`, [a.sub])).rows[0];
    expect(pa).toMatchObject({ name: 'Mona Aly', roles: ['patient'] });
  });

  it('approved merge moves contacts/passkeys, revokes the merged account\'s sessions, then is fully reversible', async () => {
    const a = await user('Dina'); const b = await user('Dina');
    const va = new VirtualAuthenticator(h.issuer);
    const o = await call(h, b.token, 'POST', '/api/passkeys/register/options');
    expect((await call(h, b.token, 'POST', '/api/passkeys/register/verify', va.register(o.json.challenge))).json.verified).toBe(true);
    const { id, v } = await verified(a, b);
    expect(v.json.conflicts.map((c: { code: string }) => c.code)).toEqual([]);

    const ops = await opsLogin(h);
    const okT = ops.tokens.access_token;
    const m = await call(h, okT, 'POST', `/api/ops/links/${id}/approve`, { note: 'ok' });
    expect(m.json.status).toBe('merged');
    // phone of B now signs in as A; B's old session is gone
    const viaB = await login(h, { phone: b.phone });
    expect(decodeJwt(viaB.tokens.access_token).sub).toBe(a.sub);
    expect((await api(h, b.token, '/api/sessions')).status).toBe(401);
    expect((await h.idp.pool.query(`SELECT status, merged_into, phone FROM accounts WHERE sub=$1`, [b.sub])).rows[0]).toMatchObject({ status: 'merged', merged_into: a.sub, phone: null });
    expect((await h.idp.pool.query(`SELECT sub FROM passkeys WHERE credential_id=$1`, [va.id])).rows[0].sub).toBe(a.sub);
    const mev = (await events(h, { type: 'account.merged' })).filter((e) => e.data.linkId === id);
    expect(mev[0].data).toMatchObject({ primarySub: a.sub, mergedSub: b.sub, change: 'merged', reversible: true });
    expect((await inbox(h, { to: a.phone, template: 'account_merge_completed' })).length).toBe(1);
    expect((await call(h, okT, 'POST', `/api/ops/links/${id}/approve`, {})).status).toBe(409); // not twice

    // reverse
    const rev = await call(h, okT, 'POST', `/api/ops/links/${id}/reverse`, { note: 'wrong person' });
    expect(rev.json.status).toBe('reversed');
    const back = await login(h, { phone: b.phone });
    expect(decodeJwt(back.tokens.access_token).sub).toBe(b.sub);
    expect((await h.idp.pool.query(`SELECT sub FROM passkeys WHERE credential_id=$1`, [va.id])).rows[0].sub).toBe(b.sub);
    expect((await h.idp.pool.query(`SELECT count(*)::int AS n FROM account_contacts WHERE sub=$1`, [a.sub])).rows[0].n).toBe(0);
    expect((await events(h, { type: 'account.merged' })).filter((e) => e.data.linkId === id).map((e) => e.data.change)).toEqual(['merged', 'reversed']);
    expect((await call(h, okT, 'POST', `/api/ops/links/${id}/reverse`, {})).status).toBe(409);
  });

  it('membership role conflicts need an explicit resolution and survive reversal', async () => {
    const a = await user('Omar'); const b = await user('Omar');
    const org = (await call(h, a.token, 'POST', '/api/orgs', { legal_name: 'Nile Clinic', country: 'eg' })).json.org_id;
    const inv = await call(h, a.token, 'POST', `/api/orgs/${org}/invitations`, { phone: b.phone, role_hint: 'doctor' });
    const token = (await inbox(h, { to: b.phone, template: 'org_invitation' })).at(-1)!.data.token;
    expect(inv.status).toBe(201);
    expect((await call(h, b.token, 'POST', '/api/invitations/accept', { token })).status).toBe(200);
    const { id, v } = await verified(a, b);
    expect(v.json.conflicts.find((c: { code: string }) => c.code === 'membership_role_conflict').detail).toMatchObject({ org_id: org, primary_role: 'owner', secondary_role: 'doctor' });
    const ops = await opsLogin(h);
    const bad = await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/approve`, { resolution: { membership_roles: { [org]: 'surgeon' } } });
    expect(bad.json).toMatchObject({ error: 'resolution_required' });
    const good = await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/approve`, { resolution: { membership_roles: { [org]: 'doctor' } } });
    expect(good.json.status).toBe('merged');
    const mine = await h.idp.pool.query(`SELECT role_hint, status FROM memberships WHERE org_id=$1 AND sub=$2 ORDER BY created_at`, [org, a.sub]);
    expect(mine.rows).toEqual([{ role_hint: 'doctor', status: 'active' }]); // reviewer picked the secondary's role
    await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/reverse`, {});
    expect((await h.idp.pool.query(`SELECT role_hint, status FROM memberships WHERE org_id=$1 AND sub=$2`, [org, a.sub])).rows).toEqual([{ role_hint: 'owner', status: 'active' }]);
    expect((await h.idp.pool.query(`SELECT role_hint, status FROM memberships WHERE org_id=$1 AND sub=$2`, [org, b.sub])).rows).toEqual([{ role_hint: 'doctor', status: 'active' }]);
  });

  it('reject keeps both accounts as they were; reviewer must be independent of the two accounts', async () => {
    const a = await user('Rana'); const b = await user('Rana');
    const { id } = await verified(a, b);
    const ops = await opsLogin(h);
    const rej = await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/reject`, { note: 'different people' });
    expect(rej.json).toMatchObject({ status: 'rejected', review_note: 'different people' });
    expect((await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${id}/approve`, {})).status).toBe(409);
    expect((await h.idp.pool.query(`SELECT count(*)::int AS n FROM accounts WHERE sub = ANY($1) AND status='active'`, [[a.sub, b.sub]])).rows[0].n).toBe(2);

    // the ops account itself requesting a link cannot approve its own request
    const victim = await user('Someone');
    const own = await call(h, ops.tokens.access_token, 'POST', '/api/links', { phone: victim.phone });
    const verify = await call(h, ops.tokens.access_token, 'POST', `/api/links/${own.json.link_id}/verify`, { code: await lastInboxCode(h, victim.phone) });
    expect(verify.status).toBe(200);
    h.clock.totpOffset += 30;
    const ops2 = await opsLogin(h);
    const self = await call(h, ops2.tokens.access_token, 'POST', `/api/ops/links/${own.json.link_id}/approve`, {});
    expect(self.status).toBe(403);
    expect(self.json.error).toBe('reviewer_must_be_independent');
  });

  it('ADR-013: link requests, events and queue views hold identifiers and facts only', async () => {
    const a = await user('Nour'); const b = await user('Nour');
    const { id } = await verified(a, b);
    const ops = await opsLogin(h);
    const view = (await call(h, ops.tokens.access_token, 'GET', `/api/ops/links/${id}`)).json;
    expect(Object.keys(view).sort()).toEqual(['conflicts', 'link_id', 'primary_sub', 'requested_at', 'resolution', 'review_note', 'reviewed_at', 'reviewed_by', 'reversed_at', 'secondary_sub', 'status', 'verified_at', 'merged_at'].sort());
    expect(JSON.stringify(view)).not.toMatch(/diagnos|medic|allerg|prescri|national_id|patient_id|encounter/i);
  });
});
