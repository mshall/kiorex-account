import { ENV, IDP_BASE, CLIENT_ID, SCOPE } from './env';
import type { ApiWorkspace } from './core';

/**
 * OIDC authorization code + PKCE (S256) as the public client `kiorly-home`. Browser navigation goes to the issuer; the token and
 * workspace calls use the same-origin `/idp` path (no CORS on the IdP). Tokens live in sessionStorage only (cleared on sign-out).
 * No phone number or product membership is ever sent or shown before the IdP has verified the code (no enumeration).
 */
const K = { at: 'kh.at', exp: 'kh.exp', idt: 'kh.idt', txn: 'kh.txn' };
const store = (): Storage | undefined => { try { return sessionStorage; } catch { return undefined; } };
const get = (k: string) => { try { return store()?.getItem(k) ?? null; } catch { return null; } };
const set = (k: string, v: string) => { try { store()?.setItem(k, v); } catch { /* ignore */ } };
const del = (k: string) => { try { store()?.removeItem(k); } catch { /* ignore */ } };

export const redirectUri = (origin = window.location.origin) => `${origin}/signin/callback`;
const rand = (n: number) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64u(a); };
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (s: string) => b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

export const token = (): string | null => { const t = get(K.at); return t && Number(get(K.exp) ?? 0) - 15_000 > Date.now() ? t : null; };
export const hasSession = (): boolean => !!token();

export async function startLogin(o: { to?: string | null; lang: 'ar' | 'en'; loginHint?: string; prompt?: 'login' }): Promise<void> {
  const verifier = rand(48); const state = rand(16);
  set(K.txn, JSON.stringify({ verifier, state, to: o.to ?? null }));
  const q = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, state,
    code_challenge: await sha256(verifier), code_challenge_method: 'S256', ui_locales: o.lang,
    ...(o.loginHint ? { login_hint: o.loginHint } : {}), ...(o.prompt ? { prompt: o.prompt } : {}),
  });
  window.location.assign(`${ENV.issuer}/auth?${q}`);
}

export async function handleCallback(search: string): Promise<{ to: string | null }> {
  const q = new URLSearchParams(search);
  const raw = get(K.txn); del(K.txn);
  if (q.get('error')) throw new Error(q.get('error')!);
  if (!raw) throw new Error('no_transaction');
  const txn = JSON.parse(raw) as { verifier: string; state: string; to: string | null };
  if (q.get('state') !== txn.state) throw new Error('state_mismatch');
  const code = q.get('code'); if (!code) throw new Error('no_code');
  const r = await fetch(`${IDP_BASE}/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: redirectUri(), code_verifier: txn.verifier }),
  });
  if (!r.ok) throw new Error('token_exchange_failed');
  const t = await r.json() as { access_token: string; expires_in: number; id_token?: string };
  set(K.at, t.access_token); set(K.exp, String(Date.now() + t.expires_in * 1000)); if (t.id_token) set(K.idt, t.id_token);
  return { to: txn.to };
}

export class Unauthorized extends Error {}
export async function fetchWorkspaces(): Promise<ApiWorkspace[]> {
  const t = token(); if (!t) throw new Unauthorized('no_token');
  const r = await fetch(`${IDP_BASE}/api/workspaces`, { headers: { authorization: `Bearer ${t}` } });
  if (r.status === 401) { clearTokens(); throw new Unauthorized('expired'); }
  if (!r.ok) throw new Error(`workspaces_${r.status}`);
  return (await r.json()).workspaces as ApiWorkspace[];
}

export function clearTokens() { for (const k of Object.values(K)) del(k); }

/** RP-initiated logout (id_token_hint) so the Passport session ends too, then back to Home. */
export function signOut(): void {
  const idt = get(K.idt);
  clearTokens();
  const back = `${ENV.home}/signin`;
  if (!idt) { window.location.assign(back); return; }
  const q = new URLSearchParams({ id_token_hint: idt, post_logout_redirect_uri: back, state: rand(8) });
  window.location.assign(`${ENV.issuer}/session/end?${q}`);
}
