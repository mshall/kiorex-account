import { describe, it, expect } from 'vitest';
import { ageFromDob, daysUntil, describeDevice, E164, fmtDate, NATIONAL_ID_LIKE, normPhone, safeReturn, randomString, sha256b64u } from '../src/util';

describe('util', () => {
  it('safeReturn only allows same-origin /account paths (no open redirect)', () => {
    expect(safeReturn('/account/security')).toBe('/account/security');
    expect(safeReturn('/account/ops/links?x=1')).toBe('/account/ops/links?x=1');
    for (const bad of ['//evil.example', 'https://evil.example/account', '/other', 'javascript:alert(1)', '/account\\..\\evil', '/accountant', null, undefined, '']) {
      expect(safeReturn(bad as string)).toBe(bad === '/accountant' ? '/accountant' : '/account');
    }
  });
  it('computes whole years from a date of birth', () => {
    expect(ageFromDob('2018-03-04', new Date('2026-03-03T12:00:00Z'))).toBe(7);
    expect(ageFromDob('2018-03-04', new Date('2026-03-04T12:00:00Z'))).toBe(8);
    expect(ageFromDob('2008-12-04', new Date('2026-11-20T00:00:00Z'))).toBe(17);
  });
  it('counts days until a date (rounded up)', () => {
    expect(daysUntil('2026-12-04T00:00:00Z', new Date('2026-11-20T00:00:00Z'))).toBe(14);
    expect(daysUntil('2026-11-19T00:00:00Z', new Date('2026-11-20T00:00:00Z'))).toBeLessThanOrEqual(0);
  });
  it('describes a device from a user agent', () => {
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome - macOS');
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1')).toBe('Safari - iOS');
    expect(describeDevice(null)).toBeNull();
  });
  it('validates phones and national-id-like references', () => {
    expect(E164.test(normPhone('+20 100-000 0001'))).toBe(true);
    expect(E164.test('01000000001')).toBe(false);
    expect(NATIONAL_ID_LIKE.test('29801011234567')).toBe(true);
    expect(NATIONAL_ID_LIKE.test('BC-2018-0042')).toBe(false);
  });
  it('formats dates for the Cairo timezone in both languages', () => {
    expect(fmtDate('2026-11-19T22:30:00Z', 'en', true)).toContain('20 Nov 2026');
    expect(fmtDate('2026-11-19T22:30:00Z', 'ar')).toMatch(/[٠-٩]/);
    expect(fmtDate(null, 'en')).toBe('');
  });
  it('generates PKCE material', async () => {
    expect(randomString(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await sha256b64u('abc')).toBe('ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0');
  });
});
