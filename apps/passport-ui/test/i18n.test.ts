import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { DICTS, NEEDS_HUMAN_KEYS, errorMessage, translate, clientName } from '../src/i18n';

const en = DICTS.en as Record<string, string>; const ar = DICTS.ar as Record<string, string>;
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const ROOT = path.resolve(__dirname, '../../..');

describe('i18n (AR + EN parity)', () => {
  it('has exactly the same keys in Arabic and English', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
  it('uses the same placeholders in both languages and never leaves a value empty', () => {
    for (const k of Object.keys(en)) {
      expect(placeholders(ar[k]), k).toEqual(placeholders(en[k]));
      expect(ar[k].trim().length, k).toBeGreaterThan(0);
      expect(en[k].trim().length, k).toBeGreaterThan(0);
    }
  });
  it('Arabic values contain Arabic text (except brand/codes)', () => {
    const latinOnlyOk = new Set(['home.langEn', 'app.theme']);
    for (const [k, v] of Object.entries(ar)) {
      if (latinOnlyOk.has(k) || k.startsWith('client.')) continue;
      expect(/[؀-ۿ]/.test(v) || /^\{\w+\}$/.test(v), k).toBe(true);
    }
  });
  it('interpolates variables and falls back to English then the key', () => {
    expect(translate('en', 'home.hello', { name: 'Mona' })).toBe('Hello, Mona');
    expect(translate('ar', 'home.hello', { name: 'منى' })).toBe('مرحبًا، منى');
    expect(translate('ar', 'no.such.key')).toBe('no.such.key');
  });
  it('maps API error codes to localized text with a generic fallback', () => {
    expect(errorMessage('en', 'invalid_phone')).toContain('international format');
    expect(errorMessage('ar', 'invalid_phone')).toMatch(/[؀-ۿ]/);
    expect(errorMessage('en', 'something_new', 500)).toBe(en['err.unknown']);
    expect(errorMessage('en', undefined, 401)).toBe(en['err.401']);
  });
  it('translates every error code the dev IdP can answer with (no raw codes shown to people)', () => {
    const codes = new Set<string>();
    const dir = path.join(ROOT, 'apps/dev-idp/src');
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(path.join(dir, f), 'utf8');
      for (const m of src.matchAll(/HttpError\(\d{3},\s*'([a-z_]+)'/g)) codes.add(m[1]);
      for (const m of src.matchAll(/send\(res, \d{3}, \{ error: '([a-z_]+)'/g)) codes.add(m[1]);
    }
    // internal / non-user-facing: JSON parse, token plumbing, flag keys handled separately, dev-only, provider webhooks (machine callers)
    const internal = new Set(['invalid_json', 'invalid_token', 'dependant_sub_required', 'invalid_scope', 'invalid_method', 'secondary_unavailable', 'account_unavailable', 'not_a_login_account', 'dependant_not_found',
      'server_error', 'method_not_allowed', 'ui_build_failed', 'interaction_mismatch', 'unsupported_prompt', 'upstream_error', 'FEATURE_DISABLED', 'not_verified', 'nothing_to_update', 'session_not_found', 'user_verification_required', 'passkey_invalid',
      'identity_not_found', 'unknown_upstream', 'federation_failed', 'upstream_not_found', 'expired', 'locked', 'invalid_state', 'state_mismatch', 'upstream_token_exchange_failed', 'upstream_no_id_token', 'upstream_id_token_invalid', 'nonce_mismatch', 'invalid_signature', 'invalid_request']);
    const missing = [...codes].filter((c) => !internal.has(c) && !en[`err.${c}`]);
    expect(missing).toEqual([]);
  });
  it('NEEDS_HUMAN copy: every draft key exists in both languages and is listed in Docs/NEEDS_HUMAN.md', () => {
    const doc = readFileSync(path.join(ROOT, 'Docs/NEEDS_HUMAN.md'), 'utf8');
    for (const k of NEEDS_HUMAN_KEYS) {
      expect(en[k], k).toBeTruthy(); expect(ar[k], k).toBeTruthy();
      expect(doc, `Docs/NEEDS_HUMAN.md must list ${k}`).toContain(k);
    }
    expect(en['draft.badge']).toMatch(/draft/i);
  });
  it('knows the friendly names of the registered clients', () => {
    expect(clientName('en', 'kiorex-web')).toBe('Kiorex patient web');
    expect(clientName('ar', 'unknown-client')).toBe('unknown-client');
  });
});
