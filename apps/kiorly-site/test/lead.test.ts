import { describe, it, expect } from 'vitest';
import { CONSENT_TEXT_VERSION, buildPayload, normaliseDigits, normalisePhone, validateLead, type LeadInput } from '../src/lead';

const ok: LeadInput = { kind: 'clinic', organisation: 'Nile Clinic', contactName: 'Mona', phone: '+20 100 000 0000', email: '', city: '', message: '', consent: true, website: '' };

describe('lead validation', () => {
  it('accepts a complete request and an optional e-mail', () => { expect(validateLead(ok)).toEqual({}); expect(validateLead({ ...ok, email: 'a@b.co' })).toEqual({}); });
  it('flags every missing required field', () => {
    expect(validateLead({ ...ok, kind: '', organisation: ' ', contactName: '', phone: '', consent: false })).toEqual({ kind: 'required', organisation: 'required', contactName: 'required', phone: 'required', consent: 'required' });
  });
  it('rejects an unknown kind, a bad phone and a bad e-mail', () => {
    expect(validateLead({ ...ok, kind: 'hospital' }).kind).toBe('invalid');
    expect(validateLead({ ...ok, phone: 'call me' }).phone).toBe('invalid');
    expect(validateLead({ ...ok, phone: '123' }).phone).toBe('invalid');
    expect(validateLead({ ...ok, email: 'nope' }).email).toBe('invalid');
  });
  it('understands Arabic-Indic digits and the 00 prefix', () => {
    expect(normaliseDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(normalisePhone('٠٠٢٠ ١٠٠ ٠٠٠ ٠٠٠٠')).toBe('+201000000000');
    expect(validateLead({ ...ok, phone: '٠١٠٠٠٠٠٠٠٠٠٠' })).toEqual({});
  });
});

describe('lead payload', () => {
  it('carries the consent text version (the wording is a draft) and omits empty optional fields', () => {
    const p = buildPayload(ok, { env: 'test', locale: 'ar', now: new Date('2026-11-27T10:00:00Z') });
    expect(p).toEqual({ source: 'kiorly-site', env: 'test', locale: 'ar', submittedAt: '2026-11-27T10:00:00.000Z', kind: 'clinic', organisation: 'Nile Clinic', contactName: 'Mona', phone: '+201000000000', consent: { accepted: true, textVersion: CONSENT_TEXT_VERSION } });
    expect(CONSENT_TEXT_VERSION).toMatch(/^draft/);
  });
  it('trims and clips free text; never includes the honeypot', () => {
    const p = buildPayload({ ...ok, organisation: `  ${'x'.repeat(300)} `, message: 'm'.repeat(2000), website: 'bot' }, { env: 'test', locale: 'en', now: new Date() });
    expect(p.organisation).toHaveLength(120); expect(p.message).toHaveLength(1000); expect(JSON.stringify(p)).not.toContain('bot');
  });
});
