import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, login, call, randomPhone, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';
import { deriveWorkspaces, workspaceUrl } from '../src/workspaces.js';

let h: Harness;
const cfg = loadIdpConfig();
const SCOPE = 'openid profile phone kx kx_org';
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

describe('ADR-038 GET /api/workspaces', () => {
  it('requires a bearer token', async () => {
    const r = await fetch(`${h.issuer}/api/workspaces`);
    expect(r.status).toBe(401);
  });

  it('a person with no membership gets an empty list (no enumeration of anything else)', async () => {
    const t = (await login(h, { phone: randomPhone(), name: 'Newcomer', scope: SCOPE })).tokens.access_token;
    const r = await call(h, t, 'GET', '/api/workspaces');
    expect(r.status).toBe(200);
    expect(r.json.workspaces).toEqual([]);
  });

  it('derives product, edition, role and URL from memberships; Nurse is an edition of Clinic', async () => {
    const t = (await login(h, { phone: randomPhone(), name: 'Owner', scope: SCOPE })).tokens.access_token;
    await call(h, t, 'POST', '/api/orgs', { legal_name: 'Nile Clinic', country: 'EG', product_refs: { kiorly_clinic_tenant_id: 'na' } });
    await call(h, t, 'POST', '/api/orgs', { legal_name: 'Home Nursing', country: 'EG', edition: 'NURSE' });
    await call(h, t, 'POST', '/api/orgs', { legal_name: 'Delta Pharmacy', country: 'EG', product_refs: { kiorly_pharmacy_tenant_id: 'p1' } });
    await call(h, t, 'POST', '/api/orgs', { legal_name: 'Cairo Lab', country: 'EG', product_refs: { kiorly_lab_tenant_id: 'l1' } });
    const w = (await call(h, t, 'GET', '/api/workspaces')).json.workspaces as Array<Record<string, string | null>>;
    const by = (n: string) => w.find((x) => x.org_name === n)!;
    expect(by('Nile Clinic')).toMatchObject({ product: 'clinic', edition: 'CLINIC', role: 'owner', product_url: 'http://localhost:5174', product_ref: 'na' });
    expect(by('Home Nursing')).toMatchObject({ product: 'clinic', edition: 'NURSE', product_url: 'http://localhost:5174' });
    expect(by('Delta Pharmacy')).toMatchObject({ product: 'pharmacy', edition: null, product_url: 'http://localhost:5192' });
    expect(by('Cairo Lab')).toMatchObject({ product: 'lab', product_url: 'http://localhost:5193' });
    expect(JSON.stringify(w)).not.toMatch(/secret|password|phone/i);
  });
});

describe('workspace URL derivation (config/domains.json, no code change per environment)', () => {
  const row = (edition: string) => [{ org_id: 'o1', legal_name: 'X', edition, product_refs: {}, role_hint: 'owner' }];
  it('production hosts', () => {
    const env = { KX_ENV: 'production' };
    expect(deriveWorkspaces(row('CLINIC'), cfg, env)[0]!.product_url).toBe('https://clinic.kiorly.com');
    expect(deriveWorkspaces(row('NURSE'), cfg, env)[0]!.product_url).toBe('https://nurse.kiorly.com');
    expect(workspaceUrl('pharmacy', null, env)).toBe('https://pharmacy.kiorly.com');
    expect(workspaceUrl('lab', null, env)).toBe('https://lab.kiorly.com');
  });
  it('env override wins', () => { expect(workspaceUrl('lab', null, { KX_WORKSPACE_URL_LAB: 'http://localhost:9999/' })).toBe('http://localhost:9999'); });
});
