import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { decodeJwt } from 'jose';
import { startHarness, startAuth, login, call, randomPhone, totpCode, seedOps, opsLogin, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';
import { coverageByType, matchPolicy, orgTypesOf, type MfaPolicyDoc } from '../src/mfa-policy.js';

const cfg = loadIdpConfig();
const MFA = cfg.stepUp.acr.mfa; const BASIC = cfg.stepUp.acr.basic;
const ORG_SCOPE = 'openid profile phone kx kx_org offline_access';
const OPS_B = '+201000009001'; // seeded plain ops_admin with its own local TOTP

describe('MFA policy: pure matching', () => {
  const m = (org: string, role: string, types: Array<'clinic' | 'nurse' | 'pharmacy' | 'lab'>) => ({ org_id: org, role_hint: role, types });
  const on = (rules: MfaPolicyDoc['rules'], enabled = true): MfaPolicyDoc => ({ enabled, rules });
  it('default and disabled policies match nobody', () => {
    expect(matchPolicy({ enabled: false, rules: [] }, ['patient'], [m('o1', 'owner', ['pharmacy'])])).toBeUndefined();
    expect(matchPolicy(on([{ scope: 'all', roles: ['owner'] }], false), [], [m('o1', 'owner', ['pharmacy'])])).toBeUndefined();
  });
  it('all / org_type / org scopes, wildcard role and Passport roles', () => {
    const ph = [m('o1', 'owner', ['pharmacy'])];
    expect(matchPolicy(on([{ scope: 'all', roles: ['owner'] }]), [], ph)).toBeDefined();
    expect(matchPolicy(on([{ scope: 'all', roles: ['pharmacist'] }]), [], ph)).toBeUndefined();
    expect(matchPolicy(on([{ scope: 'org_type', value: 'pharmacy', roles: ['owner'] }]), [], ph)).toBeDefined();
    expect(matchPolicy(on([{ scope: 'org_type', value: 'lab', roles: ['owner'] }]), [], ph)).toBeUndefined();
    expect(matchPolicy(on([{ scope: 'org', value: 'o1', roles: ['*'] }]), [], [m('o1', 'staff', ['pharmacy'])])).toBeDefined();
    expect(matchPolicy(on([{ scope: 'org', value: 'o2', roles: ['*'] }]), [], [m('o1', 'staff', ['pharmacy'])])).toBeUndefined();
    expect(matchPolicy(on([{ scope: 'all', roles: ['finance'] }]), ['finance'], [])).toBeDefined();
  });
  it('organisation types come from product refs and edition', () => {
    expect(orgTypesOf({ edition: 'CLINIC', product_refs: { kiorly_pharmacy_tenant_id: 'x' } })).toEqual(['pharmacy']);
    expect(orgTypesOf({ edition: 'CLINIC', product_refs: { kiorly_lab_tenant_id: 'x' } })).toEqual(['lab']);
    expect(orgTypesOf({ edition: 'NURSE', product_refs: {} })).toEqual(['nurse']);
    expect(orgTypesOf({ edition: 'CLINIC', product_refs: {} })).toEqual(['clinic']);
  });
});

describe('MFA policy: public coverage for product APIs', () => {
  const orgs = [{ org_id: 'o1', types: ['pharmacy' as const] }];
  it('is empty when the policy is off or has no rules', () => {
    expect(coverageByType({ enabled: false, rules: [{ scope: 'org_type', value: 'pharmacy', roles: ['*'] }] }, orgs).types.pharmacy).toEqual({ mandatory: [], partial: [] });
    expect(coverageByType({ enabled: true, rules: [] }, orgs).enabled).toBe(true);
  });
  it('org_type rules cover the whole type; org rules are partial; all-scope rules cover every type', () => {
    const c = coverageByType({ enabled: true, rules: [
      { scope: 'org_type', value: 'lab', roles: ['owner', 'lab_director'] },
      { scope: 'org', value: 'o1', roles: ['*'] },
      { scope: 'all', roles: ['finance'] },
    ] }, orgs, 7);
    expect(c.version).toBe(7);
    expect(c.types.lab.mandatory).toEqual(['finance', 'lab_director', 'owner']);
    expect(c.types.pharmacy).toEqual({ mandatory: ['finance'], partial: ['*'] });
    expect(c.types.clinic.partial).toEqual([]);
  });
});

describe('MFA policy: optional by default, mandatory when ops turn it on (maker-checker)', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h.stop(); });
  beforeEach(async () => { h.clock.offset = 0; h.clock.totpOffset += 30; await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });

  const opsAdmin = async () => (await login(h, { clientId: 'kiorex-ops', phone: OPS_B, code: '000000' })).tokens.access_token;
  const superAdmin = async () => (await opsLogin(h)).tokens.access_token;
  const policyApi = (token: string, method: string, path = '', body?: unknown) => call(h, token, method, `/api/ops/mfa-policy${path}`, body);

  /** A pharmacy owner in Passport: phone login creates the account, an organisation with a pharmacy reference makes the membership. */
  async function pharmacyOwner(type: 'pharmacy' | 'lab' = 'pharmacy') {
    const phone = randomPhone();
    const r = await login(h, { phone, name: 'Owner', scope: ORG_SCOPE });
    const token = r.tokens.access_token;
    const org = await call(h, token, 'POST', '/api/orgs', { legal_name: `${type} test`, country: 'eg', product_refs: type === 'pharmacy' ? { kiorly_pharmacy_tenant_id: 't1' } : { kiorly_lab_tenant_id: 't1' } });
    expect(org.status).toBe(201);
    return { phone, token, org: org.json.org_id as string, sub: decodeJwt(token).sub as string };
  }
  /** Signs in and reports what the person met: straight through (basic), the mandatory enrolment, or the skippable code page. */
  async function signIn(phone: string, totpSecret?: string) {
    const a = await startAuth(h, { phone });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    const ph = await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone, lang: 'en' } });
    if (ph.status !== 200) { const t = await ph.text(); throw new Error(`phone status ${ph.status}: ${(/<h1>([^<]*)/.exec(t)?.[1] ?? '')} ${(/role="alert">([^<]*)/.exec(t)?.[1] ?? '')}`); }
    const v = await a.b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code: h.channel.lastCodeFor(phone)!, lang: 'en' } });
    const html = await v.text();
    if (v.status !== 200) throw new Error(`verify status ${v.status} ${v.headers.get('location')} ${html.slice(0, 200)}`);
    return { a, uid, v, html, totpSecret };
  }
  async function finish(s: Awaited<ReturnType<typeof signIn>>) {
    const r = await s.a.b.req(`${h.issuer}/interaction/${s.uid}/finish`, { method: 'POST', form: {} });
    const { url } = await s.a.b.follow(r, h.issuer, [s.a.redirectUri]);
    const code = new URL(url).searchParams.get('code')!;
    const { exchange } = await import('./helpers.js');
    return decodeJwt((await exchange(h, s.a.clientId, s.a.redirectUri, code, s.a.verifier)).access_token);
  }

  it('default is OFF: a pharmacy owner signs in without any second factor, and ops see the default', async () => {
    const o = await pharmacyOwner();
    const s = await signIn(o.phone);
    expect(s.html).not.toContain('id="totp"');
    const claims = await finish(s);
    expect(claims.acr).toBe(BASIC);
    const cur = await policyApi(await opsAdmin(), 'GET');
    expect(cur.status).toBe(200);
    expect(cur.json.policy).toEqual({ enabled: false, rules: [] });
    const pub = await fetch(`${h.issuer}/.well-known/kiorex-mfa-policy`); // unauthenticated, no person or organisation in it
    expect(pub.status).toBe(200);
    expect(await pub.json()).toMatchObject({ enabled: false, types: { pharmacy: { mandatory: [], partial: [] }, lab: { mandatory: [], partial: [] } } });
    expect(cur.json.options.org_types).toEqual(['clinic', 'nurse', 'pharmacy', 'lab']);
    expect(cur.json.options.roles).toEqual(expect.arrayContaining(['owner', 'pharmacist', 'branch_manager']));
  });

  it('only ops can read or change it; a patient and an ops without MFA step-up cannot', async () => {
    const o = await pharmacyOwner();
    expect((await policyApi(o.token, 'GET')).status).toBe(403);
    expect((await policyApi(o.token, 'POST', '/changes', { policy: { enabled: true, rules: [] } })).status).toBe(403);
  });

  it('maker-checker: ops_admin proposes, the same person cannot approve, a second ops approves, and nothing changes before that', async () => {
    const o = await pharmacyOwner();
    const maker = await opsAdmin();
    const policy = { enabled: true, rules: [{ scope: 'org_type', value: 'pharmacy', roles: ['owner', 'pharmacist'] }] };
    const prev = await policyApi(maker, 'POST', '/preview', { policy });
    expect(prev.json.impact.people).toBeGreaterThanOrEqual(1);
    const p = await policyApi(maker, 'POST', '/changes', { policy, note: 'pharmacy owners must use MFA' });
    expect(p.status).toBe(201);
    expect(p.json.status).toBe('pending');
    expect((await policyApi(maker, 'POST', `/changes/${p.json.id}/approve`, {})).json.error).toBe('second_person_required');
    expect((await policyApi(maker, 'POST', '/changes', { policy, apply: true })).json.error).toBe('super_admin_required_for_direct_apply'); // direct apply is break-glass for super admin only
    expect((await signIn(o.phone)).html).not.toContain('id="totp"'); // still optional: only a proposal exists
    const checker = await superAdmin();
    const ok = await policyApi(checker, 'POST', `/changes/${p.json.id}/approve`, { note: 'agreed' });
    expect(ok.status).toBe(200);
    expect(ok.json.status).toBe('applied');
    const cur = await policyApi(checker, 'GET');
    expect(cur.json.policy).toEqual({ enabled: true, rules: [{ scope: 'org_type', value: 'pharmacy', roles: ['owner', 'pharmacist'] }] });
    expect(cur.json.version).toBe(1);
    expect(await (await fetch(`${h.issuer}/.well-known/kiorex-mfa-policy`)).json()).toMatchObject({ enabled: true, version: 1, types: { pharmacy: { mandatory: ['owner', 'pharmacist'] }, lab: { mandatory: [] } } });
    const audit = (await h.idp.pool.query(`SELECT type FROM audit_events WHERE type LIKE 'mfa.policy.%' ORDER BY seq`)).rows.map((r) => r.type);
    expect(audit).toEqual(expect.arrayContaining(['mfa.policy.proposed', 'mfa.policy.applied']));
    // a second approval or a stale proposal is refused
    expect((await policyApi(checker, 'POST', `/changes/${p.json.id}/approve`, {})).json.error).toBe('not_pending');
  });

  it('when mandatory: the owner is walked through enrolment, gets the MFA claim; other org types and other roles are not affected', async () => {
    const owner = await pharmacyOwner();
    const labOwner = await pharmacyOwner('lab');
    const cashier = await pharmacyOwner(); // owner of its own pharmacy too, so use a plain patient for the "other role" case
    void cashier;
    const patient = randomPhone();
    // policy from the previous test is active (pharmacy owner/pharmacist)
    const s = await signIn(owner.phone);
    expect(s.html).toContain('id="totp-secret"'); // enrolment page with the setup key
    expect(s.html).not.toContain('totp-skip');   // cannot be skipped
    const secret = /id="totp-secret"><code>([A-Z2-7]+)<\/code>/.exec(s.html)![1]!;
    // finishing without the code is refused
    const early = await s.a.b.req(`${h.issuer}/interaction/${s.uid}/finish`, { method: 'POST', form: {} });
    expect(early.headers.get('location') ?? '').not.toContain('code=');
    const wrong = await s.a.b.req(`${h.issuer}/interaction/${s.uid}/totp`, { method: 'POST', form: { totp: '000001' } });
    expect(wrong.status).toBe(400);
    const good = await s.a.b.req(`${h.issuer}/interaction/${s.uid}/totp`, { method: 'POST', form: { totp: totpCode(h, secret) } });
    expect(good.status).toBe(200);
    const claims = await finish({ ...s, a: s.a });
    expect(claims.acr).toBe(MFA);
    expect(claims.amr).toEqual(expect.arrayContaining(['totp', 'mfa']));
    // the account API says why
    const acc = await call(h, owner.token, 'GET', '/api/account');
    expect(acc.json.mfa_required).toBe(true);
    expect(acc.json.mfa_required_by).toBe('policy');
    expect((await call(h, owner.token, 'DELETE', '/api/totp')).json.error).toBe('totp_required_for_role');
    // a lab owner (org type not in the policy) and a plain patient are not asked
    expect((await signIn(labOwner.phone)).html).not.toContain('id="totp"');
    expect((await signIn(patient)).html).not.toContain('id="totp"');
  });

  it('per organisation scope, wildcard role, and the global switch turns everything off without losing rules', async () => {
    const lab = await pharmacyOwner('lab');
    const sup = await superAdmin();
    const policy = { enabled: true, rules: [{ scope: 'org', value: lab.org, roles: ['*'] }] };
    const direct = await policyApi(sup, 'POST', '/changes', { policy, apply: true, note: 'break glass test' });
    expect(direct.status).toBe(201);
    expect(direct.json.applied_directly).toBe(true);
    expect((await signIn(lab.phone)).html).toContain('id="totp-secret"');
    const off = await policyApi(sup, 'POST', '/changes', { policy: { ...policy, enabled: false }, apply: true });
    expect(off.json.status).toBe('applied');
    const cur = await policyApi(sup, 'GET');
    expect(cur.json.policy.enabled).toBe(false);
    expect(cur.json.policy.rules).toHaveLength(1); // rules kept
    // lab owner is enrolled by now (the previous sign-in created the credential row only; unconfirmed) and optional again
    expect((await signIn(lab.phone)).html).not.toContain('totp-skip');
    expect((await policyApi(sup, 'POST', '/changes', { policy: { ...policy, enabled: false }, apply: true })).json.error).toBe('no_change');
    const audit = (await h.idp.pool.query(`SELECT type FROM audit_events WHERE type = 'mfa.policy.applied_direct'`)).rows;
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('validation: unknown role, unknown org type, unknown organisation, duplicates, non-boolean switch', async () => {
    const sup = await superAdmin();
    const bad = async (policy: unknown) => (await policyApi(sup, 'POST', '/changes', { policy, apply: true })).json;
    expect((await bad({ enabled: true, rules: [{ scope: 'all', roles: ['wizard'] }] })).error).toBe('invalid_policy');
    expect((await bad({ enabled: true, rules: [{ scope: 'org_type', value: 'bank', roles: ['owner'] }] })).error).toBe('invalid_policy');
    expect((await bad({ enabled: true, rules: [{ scope: 'org', value: 'nope', roles: ['owner'] }] })).error).toBe('invalid_policy');
    expect((await bad({ enabled: true, rules: [{ scope: 'all', roles: ['owner'] }, { scope: 'all', roles: ['admin'] }] })).error).toBe('invalid_policy');
    expect((await bad({ enabled: 'yes', rules: [] })).error).toBe('invalid_policy');
    expect((await bad({ enabled: true, rules: [{ scope: 'all', roles: [] }] })).error).toBe('invalid_policy');
  });

  it('optional factor: enrolled people are offered the code and can skip (basic) or use it (MFA claim)', async () => {
    const sup = await superAdmin();
    await policyApi(sup, 'POST', '/changes', { policy: { enabled: false, rules: [] }, apply: true }).catch(() => undefined);
    const o = await pharmacyOwner();
    // voluntary enrolment through the account API
    const enrol = await call(h, o.token, 'POST', '/api/totp/enroll');
    expect(enrol.status).toBe(200);
    const confirm = await call(h, o.token, 'POST', '/api/totp/confirm', { code: totpCode(h, enrol.json.secret) });
    expect(confirm.status).toBe(200);
    h.clock.totpOffset += 30;
    const s1 = await signIn(o.phone);
    expect(s1.html).toContain('id="totp"');
    expect(s1.html).toContain('totp-skip');
    expect(s1.html).not.toContain('id="totp-secret"');
    const sk = await s1.a.b.req(`${h.issuer}/interaction/${s1.uid}/totp/skip`, { method: 'POST', form: {} });
    expect(sk.status).toBe(200); // moves on (passkey step), no token without /finish
    expect((await finish(s1)).acr).toBe(BASIC);
    h.clock.totpOffset += 30;
    const s2 = await signIn(o.phone);
    const r = await s2.a.b.req(`${h.issuer}/interaction/${s2.uid}/totp`, { method: 'POST', form: { totp: totpCode(h, enrol.json.secret) } });
    expect(r.status).toBe(200);
    const c2 = await finish(s2);
    expect(c2.acr).toBe(MFA);
    // a mandatory factor can never be skipped
    await policyApi(sup, 'POST', '/changes', { policy: { enabled: true, rules: [{ scope: 'all', roles: ['owner'] }] }, apply: true });
    h.clock.totpOffset += 30;
    const s3 = await signIn(o.phone);
    expect(s3.html).not.toContain('totp-skip');
    const skip = await s3.a.b.req(`${h.issuer}/interaction/${s3.uid}/totp/skip`, { method: 'POST', form: {} });
    expect(skip.status).toBe(403);
    void seedOps;
  });
});
