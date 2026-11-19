import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactElement } from 'react';
import { I18nProvider, type Lang } from '../src/i18n';
import { AppProvider } from '../src/app-context';
import { ToastProvider } from '../src/ui';
import { Auth } from '../src/auth';
import type { Account, Api, Meta } from '../src/api';

afterEach(() => { cleanup(); document.documentElement.removeAttribute('dir'); window.history.replaceState({}, '', '/'); try { localStorage.clear(); } catch { /* ignore */ } });

export const ACCOUNT: Account = { sub: 'S1', name: 'Mona', phone: '+201000000001', phone_verified: true, locale: 'en', roles: ['patient'], kind: 'person', mfa_required: false, totp_enrolled: false, acr: 'urn:kiorex:acr:basic', amr: ['otp'], auth_time: 1 };
export const META: Meta = {
  passkeys_enabled: true,
  guardian: { age_of_majority: { EG: 18, default: 18 }, default_market: 'EG', evidence_types: ['self_declared', 'birth_certificate_ref', 'court_order_ref', 'provider_attested'], relationships: ['parent', 'legal_guardian', 'grandparent', 'other_relative'], act_scopes: ['dependant:profile', 'dependant:booking', 'dependant:consent'], max_dependants: 20, act_as_ttl_seconds: 600 },
  orgs: { role_hints: ['owner', 'admin', 'finance', 'doctor', 'physiotherapist', 'nurse', 'dispatcher', 'assistant', 'front_desk', 'receptionist', 'pharmacist', 'lab_technician', 'staff'], editions: ['CLINIC', 'NURSE'], default_edition: 'CLINIC', invitation_ttl_days: 7 },
  step_up: { freshness_seconds: 300, sensitive_actions: ['money'], acr_mfa: 'urn:kiorex:acr:mfa' },
  mfa_required_roles: ['ops_admin', 'super_admin'],
};

/** A fake Api: every method is a vi.fn() that rejects with "unmocked" unless overridden. */
export function fakeApi(over: Partial<Record<keyof Api, unknown>> = {}): Api & Record<string, ReturnType<typeof vi.fn>> {
  const base: Record<string, unknown> = { account: async () => ACCOUNT, meta: async () => META, sessions: async () => [], passkeys: async () => [], dependants: async () => [], pendingInvitations: async () => [], opsLinks: async () => [], ...over };
  return new Proxy(base, {
    get(t, k: string) {
      if (!(k in t)) t[k] = async () => { throw new Error(`unmocked api.${k}`); };
      if (!vi.isMockFunction(t[k])) t[k] = vi.fn(t[k] as never);
      return t[k];
    },
  }) as never;
}

export function renderApp(ui: ReactElement, o: { api?: Api; lang?: Lang; path?: string } = {}) {
  const lang = o.lang ?? 'en';
  try { localStorage.setItem('kx-lang', lang); } catch { /* ignore */ } // an explicit language choice wins over the account locale
  window.history.replaceState({}, '', o.path ?? '/account');
  const auth = new Auth({ issuer: 'http://idp', clientId: 'kiorex-passport-web', kiorexWebUrl: 'http://localhost:5180' }, undefined, vi.fn() as never, { assign: vi.fn(), origin: 'http://idp' });
  const api = o.api ?? fakeApi();
  const view = render(
    <I18nProvider initial={lang}>
      <ToastProvider>
        <AppProvider api={api} auth={auth} cfg={auth.cfg} onAuthError={vi.fn()}>{ui}</AppProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return { ...view, api, auth };
}

/** axe-core on the rendered DOM (jsdom: no layout, so colour contrast is covered by the Playwright suite instead). */
export async function a11yViolations(el: Element): Promise<string[]> {
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } }, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}
