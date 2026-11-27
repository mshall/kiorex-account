import { describe, it, expect } from 'vitest';
import { parsePlans, resolveConfig } from '../src/config';

const base = { KIORLY_SITE_ENV: 'test', KIORLY_SITE_ORIGIN: 'https://site.example', KIORLY_HOME_URL: 'https://home.example' };
const plan = { id: 'Basic Plan', name: { ar: 'أساسية', en: 'Basic' }, summary: { ar: 'ملخص', en: 'Summary' }, features: { ar: ['ميزة'], en: ['Feature'] } };

describe('site config', () => {
  it('requires the environment, the site origin and the Home origin (no host is typed in code)', () => {
    expect(() => resolveConfig({})).toThrow(/KIORLY_SITE_ENV/);
    expect(() => resolveConfig({ KIORLY_SITE_ENV: 'test' })).toThrow(/KIORLY_SITE_ORIGIN/);
    expect(() => resolveConfig({ KIORLY_SITE_ENV: 'test', KIORLY_SITE_ORIGIN: 'https://site.example' })).toThrow(/KIORLY_HOME_URL/);
  });
  it('accepts only https origins without a path (http only for the local tier)', () => {
    expect(() => resolveConfig({ ...base, KIORLY_SITE_ORIGIN: 'http://site.example' })).toThrow(/https/);
    expect(() => resolveConfig({ ...base, KIORLY_SITE_ORIGIN: 'https://site.example/x' })).toThrow(/without a path/);
    expect(resolveConfig({ ...base, KIORLY_SITE_ENV: 'local', KIORLY_SITE_ORIGIN: 'http://127.0.0.1:1', KIORLY_HOME_URL: 'http://127.0.0.1:2' }).origin).toBe('http://127.0.0.1:1');
  });
  it('is indexable only in prod unless overridden, and non-prod builds carry the preview strip', () => {
    expect(resolveConfig(base).indexable).toBe(false);
    expect(resolveConfig({ ...base, KIORLY_SITE_ENV: 'pilot', KIORLY_LEAD_ENDPOINT: 'https://api.example/leads' }).indexable).toBe(false);
    const prod = resolveConfig({ ...base, KIORLY_SITE_ENV: 'prod', KIORLY_LEAD_ENDPOINT: 'https://api.example/leads' });
    expect(prod.indexable).toBe(true); expect(prod.previewBanner).toBe(false);
    expect(resolveConfig({ ...base, KIORLY_INDEXABLE: 'true' }).indexable).toBe(true);
    expect(() => resolveConfig({ ...base, KIORLY_INDEXABLE: 'yes' })).toThrow(/KIORLY_INDEXABLE/);
  });
  it('mock lead mode when the endpoint is unset; pilot and prod refuse it unless explicitly allowed', () => {
    expect(resolveConfig(base).leadEndpoint).toBeNull();
    expect(() => resolveConfig({ ...base, KIORLY_SITE_ENV: 'prod' })).toThrow(/KIORLY_LEAD_ENDPOINT is required/);
    expect(() => resolveConfig({ ...base, KIORLY_SITE_ENV: 'pilot' })).toThrow(/required/);
    expect(resolveConfig({ ...base, KIORLY_SITE_ENV: 'prod', KIORLY_ALLOW_MOCK_LEADS: 'true' }).leadEndpoint).toBeNull();
    expect(() => resolveConfig({ ...base, KIORLY_LEAD_ENDPOINT: 'http://api.example/leads' })).toThrow(/https/);
  });
  it('reads plans from the configured file', () => {
    const c = resolveConfig({ ...base, KIORLY_PLANS_FILE: 'plans.json' }, () => JSON.stringify({ plans: [plan] }));
    expect(c.plans?.[0]?.id).toBe('basic-plan');
  });
});

describe('plans config never carries prices', () => {
  it('accepts names, summaries and features', () => { expect(parsePlans({ plans: [plan] })).toHaveLength(1); });
  for (const key of ['price', 'pricing', 'amount', 'monthlyFee', 'cost', 'currency', 'egp', 'discount', 'vat']) {
    it(`rejects a "${key}" key anywhere`, () => {
      expect(() => parsePlans({ plans: [{ ...plan, [key]: 1 }] })).toThrow(/pricing|Prices/i);
      expect(() => parsePlans({ plans: [{ ...plan, name: { ...plan.name, [key]: 1 } }] })).toThrow();
    });
  }
  it('rejects an empty or malformed file', () => {
    expect(() => parsePlans({})).toThrow(/at least one plan/);
    expect(() => parsePlans({ plans: [{ ...plan, name: { ar: '', en: 'x' } }] })).toThrow(/name.ar/);
  });
});
