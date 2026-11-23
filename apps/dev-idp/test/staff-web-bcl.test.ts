import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { loadIdpConfig } from '../src/config.js';
import { LogoutDispatcher } from '../src/logout.js';
import { startHarness, login, api, randomPhone, type Harness } from './helpers.js';

describe('shipped config registers the staff webs for back-channel logout', () => {
  it('the dev logout dispatcher knows the Pharmacy, Lab and Clinic receivers (config/idp.json, environment local)', () => {
    const d = new LogoutDispatcher('http://localhost:4400', {} as never, loadIdpConfig());
    expect(d.uriFor('kiorly-pharmacy-web')).toBe('http://localhost:3100/api/v1/auth/oidc/backchannel-logout');
    expect(d.uriFor('kiorly-lab-web')).toBe('http://localhost:3200/api/v1/auth/oidc/backchannel-logout');
    expect(d.uriFor('kiorly-clinic')).toBe('http://localhost:3010/api/v1/auth/kiorex/backchannel-logout');
    expect(d.uriFor('kiorly-home')).toBeUndefined(); // no server session
  });
});

describe('revoking a Passport session reaches the Pharmacy and Lab web clients', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h.stop(); });
  beforeEach(() => { h.received.length = 0; });

  it('session.revoked is delivered per client with the sid of that client\'s id_token and aud = the client', async () => {
    const phone = randomPhone();
    const account = await login(h, { clientId: 'kiorex-web', phone }); // the Passport account page session
    const pharmacy = await login(h, { clientId: 'kiorly-pharmacy-web', phone, scope: 'openid profile phone' });
    const lab = await login(h, { clientId: 'kiorly-lab-web', phone, scope: 'openid profile phone' });
    const sessions = (await (await api(h, account.tokens.access_token, '/api/sessions')).json()).sessions as Array<{ session_id: string; clients: string[] }>;
    const target = (id: string) => sessions.find((s) => s.clients.includes(id))!;
    // the Pharmacy session is revoked from the account page (DELETE /api/sessions/:id): only that client is notified
    const del = await api(h, account.tokens.access_token, `/api/sessions/${target('kiorly-pharmacy-web').session_id}`, 'DELETE');
    expect(del.status).toBe(200);
    expect(h.received.map((r) => [r.clientId, r.event])).toEqual([['kiorly-pharmacy-web', 'session.revoked']]);
    expect(h.received[0]!.sid).toBe(decodeJwt(pharmacy.tokens.id_token).sid);
    expect(h.received[0]!.sub).toBe(decodeJwt(pharmacy.tokens.id_token).sub);
    // the Lab session keeps working until it is revoked in its turn
    h.received.length = 0;
    await api(h, account.tokens.access_token, `/api/sessions/${target('kiorly-lab-web').session_id}`, 'DELETE');
    expect(h.received.map((r) => r.clientId)).toEqual(['kiorly-lab-web']);
    expect(h.received[0]!.sid).toBe(decodeJwt(lab.tokens.id_token).sid);
  });
});
