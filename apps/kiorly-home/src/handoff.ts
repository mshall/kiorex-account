import { ENV } from './env';
import { PRODUCTS, handoffRedirect, type CardKey, type HandoffResult } from './core';

/**
 * Password sign-in through the HANDOFF (ADR-038). Home posts the credentials to the chosen product's own API
 * (`POST <api>/api/v1/auth/handoff/login`, CORS allow-listed for Home's origin) and receives a single-use 30-second code, never a token.
 * The browser then goes to `<product>/login?handoff=<code>`, where the product web redeems the code for its normal session. This module is
 * the only place that sees the password: it is sent in that one request and never stored, logged or kept in state after the call.
 * Nurse is the Clinic API with `edition: NURSE`; Lab signs in with organisation slug + e-mail (it has no passwords).
 */
export async function handoffLogin(key: CardKey, cred: { email: string; password: string; org: string }, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<HandoffResult> {
  const api = ENV.api[key].replace(/\/+$/, '');
  const ed = PRODUCTS[key].edition;
  const body = key === 'lab' ? { orgSlug: cred.org.trim(), email: cred.email.trim() } : { email: cred.email.trim(), password: cred.password, ...(ed ? { edition: ed } : {}) };
  let res: Response;
  try {
    res = await fetchImpl(`${api}/api/v1/auth/handoff/login`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch { return { kind: 'error', code: 'network' }; }
  const json = await res.json().catch(() => null);
  return handoffRedirect(key, ENV.products[key], res.status, json);
}
