import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startHarness, startAuth, call, randomPhone, opsLogin, login, type Harness } from './helpers.js';
import { loadIdpConfig } from '../src/config.js';
import { effectiveLimits, LIMIT_RANGES, type OtpLimits } from '../src/signin-limits.js';

const cfg = loadIdpConfig();
const FILE = cfg.passwordless.otp as unknown as OtpLimits;
const OPS_B = '+201000009001'; // seeded plain ops_admin

describe('sign-in limits: pure rules', () => {
  const d: OtpLimits = { maxSendsPerPhonePerHour: 5, maxSendsPerIpPerHour: 20, maxAttemptsPerChallenge: 5, ttlSeconds: 300, lockoutMinutesAfterExhaustedChallenge: 15 };
  it('nothing stored: the file numbers apply unchanged', () => { expect(effectiveLimits(d, null)).toEqual(d); expect(effectiveLimits(d, {})).toEqual(d); });
  it('stored values override, and are clamped into the hard ranges even if a row was written by hand', () => {
    expect(effectiveLimits(d, { maxSendsPerPhonePerHour: 3 }).maxSendsPerPhonePerHour).toBe(3);
    expect(effectiveLimits(d, { maxSendsPerPhonePerHour: 9999, maxSendsPerIpPerHour: 0, ttlSeconds: 99999 })).toMatchObject({ maxSendsPerPhonePerHour: 10, maxSendsPerIpPerHour: 5, ttlSeconds: 600 });
  });
  it('the ceilings are the safe maxima: no number can be switched off or opened wide', () => {
    for (const [k, [min, max]] of Object.entries(LIMIT_RANGES)) { expect(min).toBeGreaterThanOrEqual(1); expect(max).toBeGreaterThan(min); expect((d as unknown as Record<string, number>)[k]).toBeGreaterThanOrEqual(min); expect((d as unknown as Record<string, number>)[k]).toBeLessThanOrEqual(max); }
    expect(LIMIT_RANGES.maxSendsPerPhonePerHour[1]).toBeLessThanOrEqual(10);
    expect(LIMIT_RANGES.maxAttemptsPerChallenge[0]).toBeGreaterThanOrEqual(3);
  });
  it('the shipped file values sit inside the ranges (defaults equal today)', () => { expect(effectiveLimits(FILE, null)).toEqual({ ...FILE, ...Object.fromEntries(Object.keys(LIMIT_RANGES).map((k) => [k, (FILE as unknown as Record<string, number>)[k]])) }); });
});

describe('sign-in limits: maker-checker through the API and the effect on sending codes', () => {
  let h: Harness;
  beforeAll(async () => { h = await startHarness(); });
  afterAll(async () => { await h.stop(); });
  beforeEach(async () => { h.clock.offset = 0; h.clock.totpOffset += 30; await fetch(`${h.issuer}/dev/reset-rate-limits`, { method: 'POST' }); });
  const opsAdmin = async () => (await login(h, { clientId: 'kiorex-ops', phone: OPS_B, code: '000000' })).tokens.access_token;
  const superAdmin = async () => (await opsLogin(h)).tokens.access_token;
  const api = (token: string, method: string, path = '', body?: unknown) => call(h, token, method, `/api/ops/signin-limits${path}`, body);
  /** One code send through the sign-in page for a phone; returns the HTTP status of the phone step. */
  async function sendTo(phone: string) {
    const a = await startAuth(h, { phone });
    const uid = new URL(a.url).pathname.split('/')[2];
    await a.b.req(`${h.issuer}/interaction/${uid}`);
    const ph = await a.b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone, lang: 'en' } });
    return ph.status;
  }

  it('default view equals the file; a patient cannot read or change it', async () => {
    const t = await opsAdmin();
    const v = await api(t, 'GET');
    expect(v.status).toBe(200);
    expect(v.json.stored).toEqual({});
    expect(v.json.effective).toEqual(v.json.defaults);
    expect(v.json.defaults.maxSendsPerPhonePerHour).toBe(FILE.maxSendsPerPhonePerHour);
    const p = await login(h, { phone: randomPhone(), name: 'Patient' });
    expect((await api(p.tokens.access_token, 'GET')).status).toBe(403);
  });

  it('out-of-range and unknown values are refused with the range in the answer', async () => {
    const t = await opsAdmin();
    const big = await api(t, 'POST', '/changes', { limits: { maxSendsPerPhonePerHour: 11 } });
    expect(big.status).toBe(400); expect(big.json.error).toBe('limit_out_of_range'); expect(big.json.max).toBe(10);
    expect((await api(t, 'POST', '/changes', { limits: { maxAttemptsPerChallenge: 1 } })).json.error).toBe('limit_out_of_range');
    expect((await api(t, 'POST', '/changes', { limits: { codeLength: 4 } })).json.error).toBe('invalid_limits');
    expect((await api(t, 'POST', '/changes', { limits: { ttlSeconds: 'x' } })).json.error).toBe('invalid_limits');
  });

  it('a proposal changes nothing; a different approver applies it; the new number takes effect at once; every step is audited', async () => {
    const maker = await opsAdmin(); const checker = await superAdmin();
    const phone = randomPhone();
    const p = await api(maker, 'POST', '/changes', { limits: { maxSendsPerPhonePerHour: 1 }, note: 'tighten for a test' });
    expect(p.status).toBe(201); expect(p.json.status).toBe('pending');
    expect((await api(maker, 'POST', `/changes/${p.json.id}/approve`, {})).json.error).toBe('second_person_required');
    expect(await sendTo(phone)).toBe(200); expect(await sendTo(phone)).toBe(200); // still the file's 5: nothing applied yet
    const ok = await api(checker, 'POST', `/changes/${p.json.id}/approve`, { note: 'agreed' });
    expect(ok.status).toBe(200); expect(ok.json.status).toBe('applied');
    expect((await api(checker, 'GET')).json.effective.maxSendsPerPhonePerHour).toBe(1);
    const limited = randomPhone();
    expect(await sendTo(limited)).toBe(200); // the first send is allowed
    expect(await sendTo(limited)).not.toBe(200); // the second one inside the hour is refused (1 per phone per hour)
    const audit = (await h.idp.pool.query(`SELECT type FROM audit_events WHERE type LIKE 'signin.limits.%' ORDER BY seq`)).rows.map((r) => r.type);
    expect(audit).toEqual(expect.arrayContaining(['signin.limits.proposed', 'signin.limits.applied']));
    expect((await api(checker, 'POST', `/changes/${p.json.id}/approve`, {})).json.error).toBe('not_pending');
    // putting the number back (a super admin applies directly, audited) restores today's behaviour
    const back = await api(checker, 'POST', '/changes', { limits: {}, apply: true, note: 'restore' });
    expect(back.json.status).toBe('applied');
    expect((await api(checker, 'GET')).json.effective.maxSendsPerPhonePerHour).toBe(FILE.maxSendsPerPhonePerHour);
    expect((await h.idp.pool.query(`SELECT type FROM audit_events WHERE type = 'signin.limits.applied_direct'`)).rowCount).toBe(1);
  });

  it('a plain ops_admin cannot apply directly; withdraw and reject follow the same two-person rule', async () => {
    const maker = await opsAdmin(); const checker = await superAdmin();
    expect((await api(maker, 'POST', '/changes', { limits: { ttlSeconds: 120 }, apply: true })).json.error).toBe('super_admin_required_for_direct_apply');
    const p = await api(maker, 'POST', '/changes', { limits: { ttlSeconds: 120 } });
    expect((await api(maker, 'POST', `/changes/${p.json.id}/reject`, {})).json.error).toBe('use_withdraw');
    expect((await api(checker, 'POST', `/changes/${p.json.id}/withdraw`, {})).json.error).toBe('only_proposer_can_withdraw');
    expect((await api(maker, 'POST', `/changes/${p.json.id}/withdraw`, {})).json.status).toBe('withdrawn');
    const q = await api(maker, 'POST', '/changes', { limits: { ttlSeconds: 120 } });
    expect((await api(checker, 'POST', `/changes/${q.json.id}/reject`, { note: 'no' })).json.status).toBe('rejected');
    expect((await api(checker, 'GET')).json.stored).toEqual({});
  });
});
