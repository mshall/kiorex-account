import { describe, expect, it } from 'vitest';
import { DEV_BYPASS_CODE, generateCode, hashCode, isDevBypass, newSalt, safeEqual, verifyCodeHash } from './core';

/** Pentest 2026-11 regression tests: the OTP master code is a development convenience and must never exist in production. */
describe('OTP dev bypass (security)', () => {
  const seeded = ['+201000000001', '+201000000099'];
  it('is refused in production for every number, including the seeded ones', () => {
    for (const p of seeded) expect(isDevBypass(p, DEV_BYPASS_CODE, { nodeEnv: 'production', testNumbers: seeded })).toBe(false);
  });
  it('works only for seeded numbers outside production, never for another number', () => {
    expect(isDevBypass(seeded[0]!, DEV_BYPASS_CODE, { nodeEnv: 'development', testNumbers: seeded })).toBe(true);
    expect(isDevBypass('+201111111111', DEV_BYPASS_CODE, { nodeEnv: 'development', testNumbers: seeded })).toBe(false);
    expect(isDevBypass(seeded[0]!, '000001', { nodeEnv: 'development', testNumbers: seeded })).toBe(false);
  });
  it('codes are 6 digits from a CSPRNG (no obvious bias), stored only as a salted HMAC, compared in constant time', () => {
    const counts = new Array(10).fill(0); for (let i = 0; i < 6000; i++) for (const ch of generateCode()) counts[Number(ch)]++;
    for (const c of counts) expect(c).toBeGreaterThan(3200); // expected 3600 per digit
    expect(generateCode()).toMatch(/^\d{6}$/);
    const salt = newSalt(); const h = hashCode('123456', salt);
    expect(h).not.toContain('123456'); expect(verifyCodeHash('123456', salt, h)).toBe(true); expect(verifyCodeHash('123457', salt, h)).toBe(false);
    expect(safeEqual('a', 'ab')).toBe(false);
  });
});
