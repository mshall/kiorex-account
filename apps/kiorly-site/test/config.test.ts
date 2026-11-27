import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../src/config';

const base = { KIORLY_SITE_ENV: 'test', KIORLY_SITE_ORIGIN: 'https://site.example', KIORLY_HOME_URL: 'https://home.example' };

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
  it('the plans endpoint is optional, https only (http for the local tier) and carries no query', () => {
    expect(resolveConfig(base).plansEndpoint).toBeNull();
    expect(resolveConfig({ ...base, KIORLY_PLANS_ENDPOINT: 'https://api.example/api/v1/public/plans' }).plansEndpoint).toBe('https://api.example/api/v1/public/plans');
    expect(() => resolveConfig({ ...base, KIORLY_PLANS_ENDPOINT: 'http://api.example/plans' })).toThrow(/https/);
    expect(() => resolveConfig({ ...base, KIORLY_PLANS_ENDPOINT: 'not a url' })).toThrow(/absolute URL/);
    expect(() => resolveConfig({ ...base, KIORLY_PLANS_ENDPOINT: 'https://api.example/plans?market=EG' })).toThrow(/query/);
    expect(resolveConfig({ ...base, KIORLY_SITE_ENV: 'local', KIORLY_SITE_ORIGIN: 'http://127.0.0.1:1', KIORLY_HOME_URL: 'http://127.0.0.1:2', KIORLY_PLANS_ENDPOINT: 'http://127.0.0.1:3/plans' }).plansEndpoint).toBe('http://127.0.0.1:3/plans');
  });
  it('the site config has no way to carry a plan of its own any more (the platform is the only source)', () => {
    expect(Object.keys(resolveConfig(base))).not.toContain('plans');
    expect(() => resolveConfig({ ...base, KIORLY_PLANS_FILE: 'plans.json' })).not.toThrow(); // ignored, never read
    expect((resolveConfig({ ...base, KIORLY_PLANS_FILE: 'plans.json' }) as unknown as Record<string, unknown>).plans).toBeUndefined();
  });
});
