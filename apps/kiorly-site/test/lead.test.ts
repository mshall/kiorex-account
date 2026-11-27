import { describe, it, expect } from 'vitest';
import defaults from '../src/form-defaults.json';
import { CONSENT_TEXT_VERSION } from '../src/form-text';
import { applies, buildPayload, emptyState, normaliseDigits, normalisePhone, stepOfField, validateAll, validateStep, type FormConfig, type FormState } from '../src/lead';

const cfg = defaults as unknown as FormConfig;
const base = (o: Partial<FormState> = {}): FormState => ({ ...emptyState('en'), mode: 'STANDALONE', providerType: 'CLINIC', legalName: 'Nile Family Clinic', contactName: 'Dr Salma', phone: '0100 123 4567', modules: ['CLINIC'], consent: true, ...o });

describe('phone', () => {
  it('normalises Egyptian numbers typed several ways, with Arabic digits', () => {
    for (const raw of ['+201001234567', '01001234567', '0100 123 4567', '00201001234567', '٠١٠٠١٢٣٤٥٦٧', '+20 (100) 123-4567']) expect(normalisePhone(raw)).toBe('+201001234567');
    expect(normaliseDigits('٠١٢٣٤٥٦٧٨٩۰۱۲')).toBe('0123456789012');
  });
  it('rejects malformed numbers; accepts another country as E.164', () => {
    for (const raw of ['', 'abc', '+20123', '+201701234567', '12']) expect(normalisePhone(raw)).toBeNull();
    expect(normalisePhone('+966501234567')).toBe('+966501234567'); expect(normalisePhone('+20223456789')).toBe('+20223456789');
  });
});

describe('step validation', () => {
  it('a minimal clinic passes every step', () => { expect(validateAll(base(), cfg)).toEqual({}); });
  it('step 1 needs a mode and a type', () => { expect(validateStep(1, base({ mode: '', providerType: '' }), cfg)).toEqual({ mode: 'required', providerType: 'required' }); expect(validateStep(1, base({ mode: 'X', providerType: 'SPACESHIP' }), cfg)).toEqual({ mode: 'invalid', providerType: 'invalid' }); });
  it('step 2: legal name, numbers and text limits; a chain needs 2 or more branches; fields that do not apply are not asked', () => {
    expect(validateStep(2, base({ legalName: ' ' }), cfg).legalName).toBe('required');
    expect(validateStep(2, base({ legalName: '<b>' }), cfg).legalName).toBe('invalid');
    expect(validateStep(2, base({ legalName: 'x'.repeat(121) }), cfg).legalName).toBe('too_long');
    expect(validateStep(2, base({ providerType: 'CHAIN', branches: '1' }), cfg).branches).toBe('too_short');
    expect(validateStep(2, base({ providerType: 'CHAIN', branches: '' }), cfg).branches).toBe('required');
    expect(validateStep(2, base({ providerType: 'CHAIN', branches: '٣' }), cfg)).toEqual({});
    expect(validateStep(2, base({ branches: 'many' }), cfg).branches).toBe('invalid');
    expect(applies(cfg, 'INDEPENDENT_DOCTOR', 'branches')).toBe(false); expect(applies(cfg, 'CLINIC', 'branches')).toBe(true); expect(applies(cfg, 'CLINIC', 'email')).toBe(true);
    expect(validateStep(2, base({ providerType: 'INDEPENDENT_DOCTOR', branches: 'zzz' }), cfg)).toEqual({}); // not asked for a doctor
    expect(validateStep(2, base({ providerType: 'OTHER' }), cfg)['answers.otherDescription']).toBe('required');
    expect(validateStep(2, base({ providerType: 'HOSPITAL', answers: { beds: '0' } }), cfg)['answers.beds']).toBe('invalid');
  });
  it('step 3: contact name, phone and e-mail rules, governorate from the list', () => {
    const e = validateStep(3, base({ contactName: '', phone: '12', email: 'nope', governorate: 'ATLANTIS' }), cfg);
    expect(e).toEqual({ contactName: 'required', phone: 'phone', email: 'email', governorate: 'invalid' });
    expect(validateStep(3, base({ phone: '' }), cfg).phone).toBe('required'); expect(validateStep(3, base({ email: 'a@b.co', governorate: 'CAIRO' }), cfg)).toEqual({});
  });
  it('step 4: licence numbers are optional free text, only the character set and length are checked; a required module is enforced when configured', () => {
    expect(validateStep(4, base({ licences: { facilityLicence: 'FL-1234/2025' } }), cfg)).toEqual({}); expect(validateStep(4, base({ licences: { taxCard: '<x>' } }), cfg)['licences.taxCard']).toBe('invalid'); expect(validateStep(4, base({ licences: { facilityLicence: 'x'.repeat(41) } }), cfg)['licences.facilityLicence']).toBe('too_long');
    expect(validateStep(4, base({ modules: [] }), cfg).modules).toBe('required');
    expect(validateStep(4, base({ providerType: 'INDEPENDENT_DOCTOR', licences: { facilityLicence: '<x>' } }), cfg)).toEqual({}); // a facility licence is not asked of an individual
  });
  it('step 5: consent is required; configured required fields follow the live configuration', () => {
    expect(validateStep(5, base({ consent: false }), cfg).consent).toBe('required');
    const strict: FormConfig = { ...cfg, requiredFields: ['modules', 'email', 'contactChannel', 'facilityLicence'] };
    expect(validateStep(3, base(), strict).email).toBe('required'); expect(validateStep(5, base(), strict).contactChannel).toBe('required'); expect(validateStep(4, base(), strict)['licences.facilityLicence']).toBe('required');
    expect(validateStep(4, base({ providerType: 'NURSE' }), strict)['licences.facilityLicence']).toBeUndefined();
  });
  it('a server error field maps to the step that shows it', () => { expect(stepOfField('legalName')).toBe(2); expect(stepOfField('answers.beds')).toBe(2); expect(stepOfField('phone')).toBe(3); expect(stepOfField('taxCard')).toBe(4); expect(stepOfField('licences.taxCard')).toBe(4); expect(stepOfField('consent')).toBe(5); expect(stepOfField('unknown')).toBe(5); });
});

describe('payload', () => {
  it('matches the platform contract: normalised phone, only applicable fields, consent with the draft version, no honeypot when empty', () => {
    const p = buildPayload(base({ tradeName: 'Nile', branches: '٢', staffCount: '14', specialties: ['PEDIATRICS'], licences: { facilityLicence: 'FL-1', professionalLicence: 'P-1' }, answers: { rooms: '6' }, email: ' A@B.CO ', governorate: 'CAIRO' }), cfg, { env: 'test', now: new Date('2026-11-28T10:00:00Z') });
    expect(p).toMatchObject({ source: 'kiorly-site', env: 'test', mode: 'STANDALONE', providerType: 'CLINIC', legalName: 'Nile Family Clinic', tradeName: 'Nile', phone: '+201001234567', market: 'EG', locale: 'en', branches: 2, staffCount: 14, specialties: ['PEDIATRICS'], email: 'A@B.CO', governorate: 'CAIRO', modules: ['CLINIC'], licences: { facilityLicence: 'FL-1' }, answers: { rooms: 6 }, consent: { accepted: true, textVersion: CONSENT_TEXT_VERSION } });
    expect(p).not.toHaveProperty('website'); expect(p).not.toHaveProperty('note'); expect(JSON.stringify(p)).not.toContain('P-1'); // a professional licence is not asked of a clinic
    expect(buildPayload(base({ website: 'bot' }), cfg, { env: 'x', now: new Date() })).toHaveProperty('website', 'bot');
  });
});

describe('embedded form defaults', () => {
  it('cover every provider type with its fields, Egypt with 27 governorates, the six modules, and ask for no price or fee', () => {
    expect(cfg.providerTypes.map((t) => t.key)).toEqual(['CLINIC', 'INDEPENDENT_DOCTOR', 'CHAIN', 'HOSPITAL', 'NURSE', 'PHYSICIAN', 'LAB', 'PHARMACY', 'OTHER']);
    for (const t of cfg.providerTypes) { expect(cfg.typeFields[t.key], t.key).toBeTruthy(); expect(t.ar.length).toBeGreaterThan(1); expect(t.en.length).toBeGreaterThan(1); }
    expect(cfg.markets).toHaveLength(1); expect(cfg.markets[0]).toMatchObject({ key: 'EG', dialCode: '+20' }); expect(cfg.markets[0]!.governorates).toHaveLength(27);
    expect(cfg.modules.map((m) => m.key)).toEqual(['CLINIC', 'PHARMACY', 'LAB', 'NURSE', 'STAFF_APP', 'ENTERPRISE']);
    expect(JSON.stringify(cfg)).not.toMatch(/\b(price|pricing|egp|usd|fee|tariff)\b/i);
    expect(cfg.typeFields.CHAIN!.minBranches).toBe(2);
  });
});
