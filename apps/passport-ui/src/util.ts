import type { Lang } from './i18n';

const TZ = 'Africa/Cairo';
const locale = (l: Lang) => (l === 'ar' ? 'ar-EG' : 'en-GB');

export function fmtDate(v: string | number | Date | null | undefined, lang: Lang, withTime = false): string {
  if (v === null || v === undefined || v === '') return '';
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale(lang), { timeZone: TZ, dateStyle: 'medium', ...(withTime ? { timeStyle: 'short' } : {}) }).format(d);
}

/** Whole years between a YYYY-MM-DD birth date and `now`. */
export function ageFromDob(dob: string, now = new Date()): number {
  const [y, m, d] = dob.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

export function daysUntil(iso: string | Date, now = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000);
}

/** Coarse "Browser on OS" label from a user-agent string (display only). */
export function describeDevice(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : null;
  if (browser && os) return `${browser} - ${os}`;
  return browser ?? os ?? ua.slice(0, 40);
}

/** Only same-origin paths under /account may be used as a post-login or post-step-up return target (no open redirect). */
export function safeReturn(p: string | null | undefined): string {
  if (!p || !p.startsWith('/account') || p.startsWith('//') || p.includes('\\') || p.includes('://')) return '/account';
  return p;
}

export const NATIONAL_ID_LIKE = /^\d{14}$/;
export const E164 = /^\+[1-9]\d{7,14}$/;
export const normPhone = (s: string) => s.replace(/[\s-]/g, '');

export function b64uToText(s: string): string { return atob(s.replace(/-/g, '+').replace(/_/g, '/')); }

export function randomString(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return b64u(a);
}
export function b64u(a: Uint8Array): string {
  let s = ''; for (const b of a) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha256b64u(s: string): Promise<string> {
  return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
}

/** Markets that are live, from config (`VITE_MARKETS`, comma list, default `EG`). Egypt is the only launch market (founder, 23 Nov 2026). */
export function configuredMarkets(raw?: string | null): string[] {
  const list = (raw ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return list.length ? list : ['EG'];
}
/** Single rule for every country/market selector: shown only when more than one market is live; with one market the value is fixed. */
export const shouldShowMarketSelector = (markets: readonly string[]): boolean => markets.length > 1;
export const MARKETS: string[] = configuredMarkets((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_MARKETS);
