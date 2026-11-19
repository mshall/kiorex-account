import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, login, call, randomPhone, inbox, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';

let h: Harness;
const cfg = loadIdpConfig();
const ORG_SCOPE = 'openid profile phone kx kx_org offline_access';
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

async function user() {
  const phone = randomPhone();
  const r = await login(h, { phone, name: 'Nurse Omar', scope: ORG_SCOPE });
  return { phone, token: r.tokens.access_token, sub: decodeJwt(r.tokens.access_token).sub as string };
}
const newOrg = (token: string, over: Record<string, unknown> = {}) => call(h, token, 'POST', '/api/orgs', { legal_name: 'Nile Home Nursing', country: 'eg', ...over });
async function claimsOf(u: { phone: string }) { return decodeJwt((await login(h, { phone: u.phone, scope: ORG_SCOPE })).tokens.access_token); }

describe('KA-09 Rev 2.3 role hints and nurse client config', () => {
  it('role hints cover the new professions and operations roles (strings only)', async () => {
    for (const r of ['owner', 'admin', 'finance', 'doctor', 'physiotherapist', 'nurse', 'dispatcher', 'assistant', 'front_desk']) expect(cfg.orgs.roleHints).toContain(r);
    const owner = await user(); const invitee = await user();
    const org = (await newOrg(owner.token, { edition: 'NURSE' })).json.org_id;
    for (const role of ['physiotherapist', 'dispatcher', 'assistant', 'front_desk']) {
      const r = await call(h, owner.token, 'POST', `/api/orgs/${org}/invitations`, { phone: invitee.phone, role_hint: role });
      expect(r.status, role).toBe(201);
    }
    expect((await call(h, owner.token, 'POST', `/api/orgs/${org}/invitations`, { phone: invitee.phone, role_hint: 'physician' })).json.error).toBe('invalid_role_hint');
    expect((await inbox(h, { to: invitee.phone, template: 'org_invitation' })).length).toBeGreaterThan(0);
  });

  it('kiorly-clinic is ONE client for both editions; nurse.kiorly.com production URIs are TODO_NEEDS_HUMAN; local dev shares :5174', () => {
    const clients = cfg.clients.filter((c) => c.clientId.startsWith('kiorly-'));
    expect(clients.map((c) => c.clientId)).toEqual(['kiorly-clinic']); // no separate nurse client / audience (ADR-031)
    const c = clients[0];
    expect(c.environments.local.redirectUris).toEqual(['http://localhost:5174/auth/kiorex/callback']);
    const prod = (c.environments as Record<string, { redirectUris: string[] }>).production.redirectUris;
    expect(prod).toContain('https://app.kiorly.com/auth/kiorex/callback');
    expect(prod.some((u) => u.startsWith('TODO_NEEDS_HUMAN') && u.includes('nurse.kiorly.com'))).toBe(true);
    expect(prod.filter((u) => /nurse\.kiorly\.com/.test(u) && !u.startsWith('TODO_NEEDS_HUMAN'))).toEqual([]); // never a guessed live host
  });
});

describe('KA-14 multi-edition memberships', () => {
  it('one subject in a Clinic org and a Nurse org: token org list is org_id + role_hint only (edition shown by the product)', async () => {
    const nurse = await user(); const agencyOwner = await user();
    const solo = await newOrg(nurse.token, { legal_name: 'Omar Home Nursing', edition: 'NURSE' });
    const clinic = await newOrg(agencyOwner.token, { legal_name: 'Nile Clinic', edition: 'CLINIC' });
    const agency = await newOrg(agencyOwner.token, { legal_name: 'Giza Nursing Agency', edition: 'nurse' });
    expect(solo.json.edition).toBe('NURSE'); expect(clinic.json.edition).toBe('CLINIC'); expect(agency.json.edition).toBe('NURSE');
    for (const [org, role] of [[clinic.json.org_id, 'nurse'], [agency.json.org_id, 'nurse']] as const) {
      const r = await call(h, agencyOwner.token, 'POST', `/api/orgs/${org}/invitations`, { phone: nurse.phone, role_hint: role });
      expect(r.status).toBe(201);
      const msg = (await inbox(h, { to: nurse.phone, template: 'org_invitation' })).at(-1)!;
      expect((await call(h, nurse.token, 'POST', '/api/invitations/accept', { token: msg.data.token as string })).status).toBe(200);
    }
    const mine = (await call(h, nurse.token, 'GET', '/api/orgs')).json.memberships as Array<{ org_id: string; edition: string; role_hint: string }>;
    expect(mine.map((m) => [m.org_id, m.edition, m.role_hint])).toEqual([
      [solo.json.org_id, 'NURSE', 'owner'], [clinic.json.org_id, 'CLINIC', 'nurse'], [agency.json.org_id, 'NURSE', 'nurse'],
    ]);
    const c = await claimsOf(nurse);
    expect(c.kx_orgs).toEqual([
      { org_id: solo.json.org_id, role_hint: 'owner' }, { org_id: clinic.json.org_id, role_hint: 'nurse' }, { org_id: agency.json.org_id, role_hint: 'nurse' },
    ]);
    expect(JSON.stringify(c)).not.toMatch(/edition|NURSE|CLINIC/);
  });

  it('edition defaults to CLINIC, unknown editions are refused, and it is exposed in /api/meta', async () => {
    const u = await user();
    expect((await newOrg(u.token)).json.edition).toBe('CLINIC');
    const bad = await newOrg(u.token, { edition: 'PHARMACY' });
    expect(bad.status).toBe(400); expect(bad.json.error).toBe('invalid_edition');
    const meta = await call(h, u.token, 'GET', '/api/meta');
    expect(meta.json.orgs.editions).toEqual(['CLINIC', 'NURSE']);
    expect(meta.json.orgs.role_hints).toContain('physiotherapist');
  });
});

describe('KA-13 negative: no address / profession / licence / clinical claims in any token', () => {
  it('forbidden-claims list covers address, profession, licence, scope of practice and edition', () => {
    for (const k of ['address', 'home_address', 'visit_address', 'district', 'profession', 'licence', 'license', 'scope_of_practice', 'edition']) expect(cfg.forbiddenClaims).toContain(k);
    for (const k of cfg.forbiddenClaims) expect(cfg.accessTokenClaims).not.toContain(k);
    expect(cfg.scopes.flatMap((s) => s.claims).filter((k) => cfg.forbiddenClaims.includes(k))).toEqual([]);
  });

  it('org creation ignores address/profession/licence fields; access, ID and userinfo carry none of them', async () => {
    const u = await user();
    const r = await newOrg(u.token, { edition: 'NURSE', address: '12 Nile St', home_address: 'x', profession: 'NURSE', licence_number: 'L-1', scope_of_practice: ['iv'] });
    expect(r.status).toBe(201);
    expect(JSON.stringify(r.json)).not.toMatch(/Nile St|profession|licence|scope_of_practice|home_address/i);
    const stored = JSON.stringify((await h.idp.pool.query(`SELECT * FROM organizations WHERE org_id=$1`, [r.json.org_id])).rows[0]);
    expect(stored).not.toMatch(/Nile St|profession|licence|scope_of_practice/i);
    const fresh = await login(h, { phone: u.phone, scope: ORG_SCOPE });
    const standard = new Set(['iss', 'aud', 'exp', 'iat', 'jti', 'client_id', 'scope', 'sub', 'sid', 'auth_time', 'amr', 'acr', 'nonce', 'at_hash', 'azp', 'rat']);
    const allowed = new Set([...standard, ...cfg.accessTokenClaims]);
    for (const jwt of [fresh.tokens.access_token, fresh.tokens.id_token].filter(Boolean) as string[]) {
      const c = decodeJwt(jwt);
      for (const k of Object.keys(c)) { expect(allowed.has(k), `unexpected claim ${k}`).toBe(true); expect(cfg.forbiddenClaims).not.toContain(k); }
      expect(JSON.stringify(c)).not.toMatch(/Nile St|profession|licen[cs]e|scope_of_practice|address/i);
    }
  });
});
