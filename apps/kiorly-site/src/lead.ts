/**
 * Client-side validation and payload of the join form. It MIRRORS the platform's rules (apps/api/src/leads/lead-validation.ts) so a visitor learns about a problem before
 * sending; the server stays the authority and answers 400 VALIDATION_FAILED { fields } for anything this misses. Shared by the browser script and the unit tests.
 */
import { CONSENT_TEXT_VERSION } from './form-text';

export interface PickItem { key: string; en: string; ar: string; active?: boolean }
export type AnswerSpec = { kind: 'bool' } | { kind: 'int'; min: number; max: number } | { kind: 'enum'; values: string[] } | { kind: 'text'; max: number };
export interface FormConfig {
  providerTypes: PickItem[]; specialties: PickItem[]; modules: PickItem[]; goLive: PickItem[]; software: PickItem[]; contactChannels: PickItem[]; contactTimes: PickItem[];
  markets: Array<PickItem & { dialCode: string; governorates: PickItem[] }>; requiredFields: string[];
  typeFields: Record<string, { fields: string[]; answers: Record<string, AnswerSpec>; minBranches: number | null }>; modes: string[]; limits: { note: number; legalName: number; services: number; licence: number };
}
export interface FormState {
  mode: string; providerType: string; legalName: string; tradeName: string; branches: string; staffCount: string; specialties: string[]; services: string; currentSoftware: string; answers: Record<string, string | boolean>;
  contactName: string; contactRole: string; phone: string; email: string; market: string; governorate: string; city: string;
  licences: Record<string, string>; modules: string[]; goLive: string; locale: 'ar' | 'en'; contactChannel: string; contactTime: string; note: string; consent: boolean; website: string;
}
export const emptyState = (locale: 'ar' | 'en', market = 'EG'): FormState => ({ mode: '', providerType: '', legalName: '', tradeName: '', branches: '', staffCount: '', specialties: [], services: '', currentSoftware: '', answers: {}, contactName: '', contactRole: '', phone: '', email: '', market, governorate: '', city: '', licences: {}, modules: [], goLive: '', locale, contactChannel: '', contactTime: '', note: '', consent: false, website: '' });

export type Code = 'required' | 'invalid' | 'too_long' | 'too_short' | 'too_many' | 'phone' | 'email';
export type Errors = Record<string, Code>;

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'; const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
export const normaliseDigits = (s: string): string => s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d))).replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
export function normalisePhone(raw: string, dialCode = '+20'): string | null {
  let t = normaliseDigits(raw.trim()).replace(/[\s().-]/g, '');
  if (!/^\+?\d+$/.test(t.replace(/^00/, '+'))) return null;
  if (t.startsWith('00')) t = `+${t.slice(2)}`;
  if (!t.startsWith('+')) t = `${dialCode}${t.replace(/^0+/, '')}`;
  if (!/^\+[1-9]\d{6,14}$/.test(t)) return null;
  if (t.startsWith('+20')) { const n = t.slice(3); if (!/^1[0125]\d{8}$/.test(n) && !/^[2-9]\d{7,8}$/.test(n)) return null; }
  return t;
}
const EMAIL = /^[^\s@]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const LICENCE = /^[\p{L}\p{N} ./_-]{1,40}$/u;
// eslint-disable-next-line no-control-regex
const BAD_TEXT = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/;
export const LICENCE_FIELDS = ['facilityLicence', 'professionalLicence', 'commercialRegister', 'taxCard'] as const;
const TYPE_SCOPED = new Set(['tradeName', 'branches', 'staffCount', 'specialties', 'services', 'currentSoftware', ...LICENCE_FIELDS]);

export const fieldsOf = (cfg: FormConfig, type: string) => cfg.typeFields[type] ?? cfg.typeFields.OTHER ?? { fields: [], answers: {}, minBranches: null };
export const applies = (cfg: FormConfig, type: string, f: string): boolean => !TYPE_SCOPED.has(f) || fieldsOf(cfg, type).fields.includes(f);
const text = (v: string, max: number, field: string, e: Errors, multiline = false) => { const s = (multiline ? v : v.replace(/[\r\n\t]+/g, ' ')).trim(); if (BAD_TEXT.test(s)) e[field] = 'invalid'; else if (s.length > max) e[field] = 'too_long'; return s; };
const num = (v: string, min: number, max: number, field: string, e: Errors): number | undefined => { const s = normaliseDigits(v.trim()); if (!s) return undefined; if (!/^\d{1,6}$/.test(s) || Number(s) < min || Number(s) > max) { e[field] = 'invalid'; return undefined; } return Number(s); };

/** Which step shows each field (so a server error can send the visitor to the right step). */
export const STEP_OF: Record<string, number> = {
  mode: 1, providerType: 1, legalName: 2, tradeName: 2, branches: 2, staffCount: 2, specialties: 2, services: 2, currentSoftware: 2, answers: 2,
  contactName: 3, contactRole: 3, phone: 3, email: 3, market: 3, governorate: 3, city: 3, facilityLicence: 4, professionalLicence: 4, commercialRegister: 4, taxCard: 4, licences: 4, modules: 4, goLive: 4,
  locale: 5, contactChannel: 5, contactTime: 5, note: 5, consent: 5,
};
export const stepOfField = (f: string): number => STEP_OF[f] ?? STEP_OF[f.split('.')[0]!] ?? 5;

export function validateStep(step: number, s: FormState, cfg: FormConfig): Errors {
  const e: Errors = {}; const need = (f: string) => cfg.requiredFields.includes(f) && applies(cfg, s.providerType, f);
  const markets = cfg.markets; const market = markets.find((m) => m.key === s.market) ?? markets[0];
  if (step === 1) {
    if (!s.mode) e.mode = 'required'; else if (!cfg.modes.includes(s.mode)) e.mode = 'invalid';
    if (!s.providerType) e.providerType = 'required'; else if (!cfg.providerTypes.some((t) => t.key === s.providerType)) e.providerType = 'invalid';
  }
  if (step === 2) {
    const spec = fieldsOf(cfg, s.providerType);
    if (!text(s.legalName, cfg.limits.legalName, 'legalName', e) && !e.legalName) e.legalName = 'required';
    if (applies(cfg, s.providerType, 'tradeName')) { text(s.tradeName, 120, 'tradeName', e); if (need('tradeName') && !s.tradeName.trim()) e.tradeName = 'required'; }
    if (applies(cfg, s.providerType, 'branches')) {
      const n = num(s.branches, 1, 500, 'branches', e);
      if (n !== undefined && spec.minBranches && n < spec.minBranches) e.branches = 'too_short';
      if (n === undefined && !e.branches && (need('branches') || spec.minBranches)) e.branches = 'required';
    }
    if (applies(cfg, s.providerType, 'staffCount')) { const n = num(s.staffCount, 1, 5000, 'staffCount', e); if (n === undefined && !e.staffCount && need('staffCount')) e.staffCount = 'required'; }
    if (applies(cfg, s.providerType, 'specialties')) { if (s.specialties.length > 12) e.specialties = 'too_many'; else if (need('specialties') && !s.specialties.length) e.specialties = 'required'; }
    if (applies(cfg, s.providerType, 'services')) { text(s.services, cfg.limits.services, 'services', e, true); if (need('services') && !s.services.trim()) e.services = 'required'; }
    if (applies(cfg, s.providerType, 'currentSoftware')) { text(s.currentSoftware, 80, 'currentSoftware', e); if (need('currentSoftware') && !s.currentSoftware.trim()) e.currentSoftware = 'required'; }
    for (const [k, a] of Object.entries(spec.answers)) {
      const v = s.answers[k]; const f = `answers.${k}`;
      if (a.kind === 'int') { if (typeof v === 'string' && v.trim()) num(v, a.min, a.max, f, e); }
      else if (a.kind === 'text') { if (typeof v === 'string') text(v, a.max, f, e); if (s.providerType === 'OTHER' && k === 'otherDescription' && !(typeof v === 'string' && v.trim())) e[f] = 'required'; }
    }
  }
  if (step === 3) {
    if (!text(s.contactName, 100, 'contactName', e) && !e.contactName) e.contactName = 'required';
    text(s.contactRole, 80, 'contactRole', e); if (need('contactRole') && !s.contactRole.trim()) e.contactRole = 'required';
    if (!s.phone.trim()) e.phone = 'required'; else if (s.phone.length > 30 || !normalisePhone(s.phone, market?.dialCode)) e.phone = 'phone';
    if (s.email.trim()) { if (s.email.trim().length > 254 || !EMAIL.test(s.email.trim())) e.email = 'email'; } else if (need('email')) e.email = 'required';
    if (markets.length > 1 && !s.market) e.market = 'required';
    if (s.governorate && !market?.governorates.some((g) => g.key === s.governorate)) e.governorate = 'invalid';
    if (need('governorate') && market && market.governorates.length && !s.governorate) e.governorate = 'required';
    text(s.city, 80, 'city', e); if (need('city') && !s.city.trim()) e.city = 'required';
  }
  if (step === 4) {
    for (const f of LICENCE_FIELDS) {
      if (!applies(cfg, s.providerType, f)) continue; const v = (s.licences[f] ?? '').trim();
      const key = `licences.${f}`; // the input is named like this, so its message and aria-describedby line up
      if (v.length > cfg.limits.licence) e[key] = 'too_long'; else if (v && !LICENCE.test(v)) e[key] = 'invalid'; else if (!v && need(f)) e[key] = 'required';
    }
    if (need('modules') && !s.modules.length) e.modules = 'required';
    if (need('goLive') && !s.goLive) e.goLive = 'required';
  }
  if (step === 5) {
    if (need('contactChannel') && !s.contactChannel) e.contactChannel = 'required';
    if (need('contactTime') && !s.contactTime) e.contactTime = 'required';
    text(s.note, cfg.limits.note, 'note', e, true); if (need('note') && !s.note.trim()) e.note = 'required';
    if (!s.consent) e.consent = 'required';
  }
  return e;
}
export const validateAll = (s: FormState, cfg: FormConfig): Errors => ({ ...validateStep(1, s, cfg), ...validateStep(2, s, cfg), ...validateStep(3, s, cfg), ...validateStep(4, s, cfg), ...validateStep(5, s, cfg) });

export function buildPayload(s: FormState, cfg: FormConfig, ctx: { env: string; now: Date }): Record<string, unknown> {
  const spec = fieldsOf(cfg, s.providerType); const market = cfg.markets.find((m) => m.key === s.market) ?? cfg.markets[0];
  const o: Record<string, unknown> = { source: 'kiorly-site', env: ctx.env, submittedAt: ctx.now.toISOString(), mode: s.mode, providerType: s.providerType, legalName: s.legalName.trim(), contactName: s.contactName.trim(), phone: normalisePhone(s.phone, market?.dialCode) ?? s.phone.trim(), market: market?.key ?? s.market, locale: s.locale, consent: { accepted: true, textVersion: CONSENT_TEXT_VERSION } };
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) o[k] = v; };
  put('contactRole', s.contactRole.trim()); put('email', s.email.trim()); put('governorate', s.governorate); put('city', s.city.trim()); put('modules', s.modules); put('goLive', s.goLive); put('contactChannel', s.contactChannel); put('contactTime', s.contactTime); put('note', s.note.trim());
  if (applies(cfg, s.providerType, 'tradeName')) put('tradeName', s.tradeName.trim());
  if (applies(cfg, s.providerType, 'branches')) put('branches', s.branches.trim() ? Number(normaliseDigits(s.branches.trim())) : undefined);
  if (applies(cfg, s.providerType, 'staffCount')) put('staffCount', s.staffCount.trim() ? Number(normaliseDigits(s.staffCount.trim())) : undefined);
  if (applies(cfg, s.providerType, 'specialties')) put('specialties', s.specialties);
  if (applies(cfg, s.providerType, 'services')) put('services', s.services.trim());
  if (applies(cfg, s.providerType, 'currentSoftware')) put('currentSoftware', s.currentSoftware.trim());
  const lic: Record<string, string> = {}; for (const f of LICENCE_FIELDS) if (applies(cfg, s.providerType, f) && (s.licences[f] ?? '').trim()) lic[f] = s.licences[f]!.trim();
  if (Object.keys(lic).length) o.licences = lic;
  const ans: Record<string, string | number | boolean> = {};
  for (const [k, a] of Object.entries(spec.answers)) { const v = s.answers[k]; if (v === undefined || v === '') continue; ans[k] = a.kind === 'int' ? Number(normaliseDigits(String(v))) : (v as string | boolean); }
  if (Object.keys(ans).length) o.answers = ans;
  if (s.website) o.website = s.website;
  return o;
}
