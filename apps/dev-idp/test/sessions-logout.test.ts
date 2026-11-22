import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, api, randomPhone, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });
beforeEach(() => { h.received.length = 0; h.receiverFails.value = false; });

describe('sessions API and back-channel logout (KA-05)', () => {
  it('lists sessions, revokes one remotely, delivers session.revoked with the right sid, invalidates its tokens', async () => {
    const phone = randomPhone();
    const web = await login(h, { clientId: 'kiorex-web', phone });
    const mobile = await login(h, { clientId: 'kiorex-mobile', phone, code: undefined });

    const list = await (await api(h, web.tokens.access_token, '/api/sessions')).json();
    expect(list.sessions).toHaveLength(2);
    expect(list.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    expect(list.sessions[0].device).toContain('KxTestBrowser');
    const mobileSession = list.sessions.find((s: { clients: string[] }) => s.clients.includes('kiorex-mobile'));

    const del = await api(h, web.tokens.access_token, `/api/sessions/${mobileSession.session_id}`, 'DELETE');
    expect(del.status).toBe(200);
    const body = await del.json();
    expect(body.deliveries).toHaveLength(1);
    expect(body.deliveries[0]).toMatchObject({ clientId: 'kiorex-mobile', ok: true, event: 'session.revoked' });

    expect(h.received).toHaveLength(1);
    expect(h.received[0]).toMatchObject({ clientId: 'kiorex-mobile', event: 'session.revoked', sub: decodeJwt(mobile.tokens.access_token).sub });
    expect(h.received[0].sid).toBe(decodeJwt(mobile.tokens.id_token).sid);

    // revoked session's tokens stop working at the IdP; the other session is untouched
    expect((await api(h, mobile.tokens.access_token, '/api/sessions')).status).toBe(401);
    const rt = await fetch(`${h.issuer}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: 'kiorex-mobile', refresh_token: mobile.tokens.refresh_token! }) });
    expect(rt.status).toBe(400);
    expect((await api(h, web.tokens.access_token, '/api/sessions')).status).toBe(200);
    // unknown / foreign session
    expect((await api(h, web.tokens.access_token, '/api/sessions/nope', 'DELETE')).status).toBe(404);
  });

  it('a user cannot revoke another user\'s session', async () => {
    const a = await login(h, { phone: randomPhone() });
    const b = await login(h, { phone: randomPhone() });
    const bs = (await (await api(h, b.tokens.access_token, '/api/sessions')).json()).sessions[0];
    expect((await api(h, a.tokens.access_token, `/api/sessions/${bs.session_id}`, 'DELETE')).status).toBe(404);
  });

  it('revoke-all-others keeps the current session', async () => {
    const phone = randomPhone();
    const one = await login(h, { clientId: 'kiorex-web', phone });
    await login(h, { clientId: 'kiorex-ops', phone });
    const r = await (await api(h, one.tokens.access_token, '/api/sessions', 'DELETE')).json();
    expect(r.revoked).toHaveLength(1);
    expect(h.received.map((x) => x.clientId)).toEqual(['kiorex-ops']);
    const list = await (await api(h, one.tokens.access_token, '/api/sessions')).json();
    expect(list.sessions).toHaveLength(1);
  });

  it('reports failed deliveries without losing the revoke', async () => {
    const a = await login(h, { phone: randomPhone() });
    const b = await login(h, { phone: h.idp.seedUsers[0].phone, code: '000000' });
    h.receiverFails.value = true;
    const s = (await (await api(h, b.tokens.access_token, '/api/sessions')).json()).sessions[0];
    const res = await (await api(h, a.tokens.access_token, '/api/sessions')).json();
    void res;
    const del = await api(h, b.tokens.access_token, `/api/sessions/${s.session_id}`, 'DELETE');
    const body = await del.json();
    expect(body.deliveries[0]).toMatchObject({ ok: false, status: 500 });
    expect((await api(h, b.tokens.access_token, '/api/sessions')).status).toBe(401); // still revoked
  });

  it('account deletion revokes everything, tombstones the account and broadcasts subject.deleted (KA-07)', async () => {
    const phone = randomPhone();
    const web = await login(h, { clientId: 'kiorex-web', phone, name: 'Doomed' });
    await login(h, { clientId: 'kiorly-clinic', phone });
    const sub = decodeJwt(web.tokens.access_token).sub!;

    const exp = await (await api(h, web.tokens.access_token, '/api/account/export')).json();
    expect(exp.subject).toMatchObject({ sub, phone_number: phone, name: 'Doomed' });
    expect(JSON.stringify(exp)).toContain('ADR-013');

    h.received.length = 0;
    const del = await api(h, web.tokens.access_token, '/api/account', 'DELETE');
    expect(del.status).toBe(202);
    const body = await del.json();
    expect(body.event).toBe('subject.deleted');
    expect(body.deliveries.length).toBe(6); // every registered client is notified (the harness gives every client except Passport web a receiver, kiorly-team included)
    const evts = h.received.filter((r) => r.event === 'subject.deleted');
    expect(evts).toHaveLength(5); // the Passport SPA endpoint is self-hosted and not observed by the test receiver
    expect(evts.every((e) => e.sub === sub && e.sid === undefined)).toBe(true);
    expect(new Set(evts.map((e) => e.clientId))).toEqual(new Set(['kiorex-web', 'kiorex-ops', 'kiorex-mobile', 'kiorly-team', 'kiorly-clinic']));

    expect((await api(h, web.tokens.access_token, '/api/sessions')).status).toBe(401);
    const row = (await h.idp.pool.query(`SELECT * FROM accounts WHERE sub=$1`, [sub])).rows[0];
    expect(row).toMatchObject({ status: 'deleted', phone: null, name: null });

    // phone can sign up again as a brand-new subject
    const again = await login(h, { phone });
    expect(decodeJwt(again.tokens.access_token).sub).not.toBe(sub);
  });

  it('API requires a valid bearer token', async () => {
    expect((await fetch(`${h.issuer}/api/sessions`)).status).toBe(401);
    expect((await api(h, 'garbage', '/api/sessions')).status).toBe(401);
  });

  it('audit log is hash-chained', async () => {
    const rows = (await h.idp.pool.query(`SELECT seq, prev_hash, hash, data::text AS d FROM audit_events ORDER BY seq`)).rows;
    expect(rows.length).toBeGreaterThan(5);
    for (let i = 1; i < rows.length; i++) expect(rows[i].prev_hash).toBe(rows[i - 1].hash);
    expect(rows.map((r) => r.d).join()).not.toMatch(/\+2010\d{8}/); // no raw phone numbers in audit data
  });
});
