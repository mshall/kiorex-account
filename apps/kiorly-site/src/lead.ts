/** Lead form contract and validation. Shared by the browser script (src/client.ts) and the unit tests, so the rules exist once. */
export const LEAD_KINDS = ['clinic', 'pharmacy', 'lab'] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];
/** Bumped whenever the consent wording changes. The wording is a DRAFT pending counsel review (see Docs/NEEDS_HUMAN.md). */
export const CONSENT_TEXT_VERSION = 'draft-1';

export interface LeadInput { kind: string; organisation: string; contactName: string; phone: string; email: string; city: string; message: string; consent: boolean; website: string }
export type LeadField = 'kind' | 'organisation' | 'contactName' | 'phone' | 'email' | 'consent';
export type LeadErrors = Partial<Record<LeadField, 'required' | 'invalid'>>;

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
/** Arabic-Indic digits typed on a phone keyboard become ASCII digits. */
export const normaliseDigits = (s: string): string => s.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)));
export const normalisePhone = (s: string): string => { const t = normaliseDigits(s).replace(/[\s().-]/g, ''); return t.startsWith('00') ? `+${t.slice(2)}` : t; };
const PHONE = /^\+?\d{7,15}$/;
const EMAIL = /^[^\s@]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function validateLead(i: LeadInput): LeadErrors {
  const e: LeadErrors = {};
  if (!(LEAD_KINDS as readonly string[]).includes(i.kind)) e.kind = i.kind ? 'invalid' : 'required';
  if (!i.organisation.trim()) e.organisation = 'required';
  if (!i.contactName.trim()) e.contactName = 'required';
  if (!i.phone.trim()) e.phone = 'required'; else if (!PHONE.test(normalisePhone(i.phone))) e.phone = 'invalid';
  if (i.email.trim() && (i.email.trim().length > 254 || !EMAIL.test(i.email.trim()))) e.email = 'invalid';
  if (!i.consent) e.consent = 'required';
  return e;
}

export interface LeadPayload {
  source: 'kiorly-site'; env: string; locale: 'ar' | 'en'; submittedAt: string;
  kind: LeadKind; organisation: string; contactName: string; phone: string; email?: string; city?: string; message?: string;
  consent: { accepted: true; textVersion: string };
}
const clip = (s: string, n: number) => s.trim().slice(0, n);
export function buildPayload(i: LeadInput, ctx: { env: string; locale: 'ar' | 'en'; now: Date }): LeadPayload {
  const email = clip(i.email, 254); const city = clip(i.city, 80); const message = clip(i.message, 1000);
  return {
    source: 'kiorly-site', env: ctx.env, locale: ctx.locale, submittedAt: ctx.now.toISOString(),
    kind: i.kind as LeadKind, organisation: clip(i.organisation, 120), contactName: clip(i.contactName, 120), phone: normalisePhone(i.phone),
    ...(email ? { email } : {}), ...(city ? { city } : {}), ...(message ? { message } : {}),
    consent: { accepted: true, textVersion: CONSENT_TEXT_VERSION },
  };
}
