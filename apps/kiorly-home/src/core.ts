/**
 * Kiorly Home decision logic (ADR-038). Pure functions: no DOM, no network, easy to unit test.
 * A "card" is what the person sees: Clinic, Nurse (an EDITION of Clinic), Pharmacy, Lab. Organisations inside a product keep the
 * product's own organisation picker, so Home never lists them as separate choices.
 */
export type CardKey = 'clinic' | 'nurse' | 'pharmacy' | 'lab';
export const CARD_KEYS: CardKey[] = ['clinic', 'nurse', 'pharmacy', 'lab'];

export interface ApiWorkspace {
  id: string; product: 'clinic' | 'pharmacy' | 'lab'; edition: 'CLINIC' | 'NURSE' | null; org_id: string; org_name: string; role: string; product_url: string;
}
export interface Card { key: CardKey; url: string; orgs: Array<{ id: string; name: string; role: string }> }

/** Per product static facts: accent token, lockup file, sign-up path of the product's existing sign-up. */
export const PRODUCTS: Record<CardKey, { product: 'clinic' | 'pharmacy' | 'lab'; edition: 'NURSE' | null; signupPath: string; lockup: string; accent: string }> = {
  clinic: { product: 'clinic', edition: null, signupPath: '/signup', lockup: 'clinic-lockup', accent: '#0D9488' },
  nurse: { product: 'clinic', edition: 'NURSE', signupPath: '/signup?edition=nurse', lockup: 'nurse-lockup', accent: '#E11D48' },
  pharmacy: { product: 'pharmacy', edition: null, signupPath: '/signup', lockup: 'pharmacy-lockup', accent: '#16A34A' },
  lab: { product: 'lab', edition: null, signupPath: '/onboarding', lockup: 'lab-lockup', accent: '#7C3AED' },
};

export const cardKeyOf = (w: Pick<ApiWorkspace, 'product' | 'edition'>): CardKey => (w.product === 'clinic' && w.edition === 'NURSE' ? 'nurse' : w.product);

export function toCards(ws: ApiWorkspace[]): Card[] {
  const m = new Map<CardKey, Card>();
  for (const w of ws) {
    const k = cardKeyOf(w);
    const c = m.get(k) ?? { key: k, url: w.product_url.replace(/\/+$/, ''), orgs: [] };
    c.orgs.push({ id: w.org_id, name: w.org_name, role: w.role });
    m.set(k, c);
  }
  return CARD_KEYS.filter((k) => m.has(k)).map((k) => m.get(k)!);
}

export function parseTo(search: string, pathname = '/signin'): CardKey | null {
  const q = new URLSearchParams(search);
  const fromPath = pathname.replace(/^\/signin\/?/, '').split('/')[0];
  const v = (q.get('to') ?? q.get('product') ?? fromPath ?? '').toLowerCase();
  return (CARD_KEYS as string[]).includes(v) ? (v as CardKey) : null;
}

/**
 * "Your workspaces" hint after a Passport sign-in (ADR-038): when the person has EXACTLY ONE workspace and it is not the product they chose,
 * Home shows a gentle hint with both options instead of blocking. Anything else (none, several, or the chosen one) opens the chosen product.
 */
export function workspaceHint(cards: Card[], chosen: CardKey): Card | null {
  return cards.length === 1 && cards[0]!.key !== chosen ? cards[0]! : null;
}

/** Remembered tile: only a known key is accepted. A deep link (`?to=`, `/signin/<product>`) wins over the remembered tile, the default is Clinic. */
export function initialTile(to: CardKey | null, last: unknown): CardKey { return to ?? ((CARD_KEYS as string[]).includes(String(last)) ? (last as CardKey) : 'clinic'); }

export type SignInMethod = 'passport' | 'password';
export const parseMethod = (v: unknown): SignInMethod => (v === 'password' ? 'password' : 'passport');

/** Lab has no passwords (dev sign-in = organisation slug + e-mail, same as the mobile screen); Clinic, Nurse and Pharmacy use e-mail + password. */
export const needsOrg = (k: CardKey): boolean => k === 'lab';

export type HandoffResult =
  | { kind: 'redirect'; url: string; fallback: boolean }
  | { kind: 'error'; code: 'invalid' | 'rateLimited' | 'network' | 'notAllowed' | 'passwordDisabled' | 'server' };

/**
 * Turns the product's `POST /auth/handoff/login` answer into where the browser goes. The product's own redirectUrl is used only when it points
 * at the product origin from Home's domain table; otherwise Home builds `<product>/login?handoff=<code>&from=kiorly-home[&edition=NURSE]` itself.
 * The code never leaves this function except inside that URL; it is not logged.
 */
export function handoffRedirect(key: CardKey, productBase: string, status: number, body: unknown): HandoffResult {
  const base = productBase.replace(/\/+$/, '');
  const b = (body && typeof body === 'object' ? body : {}) as { status?: string; code?: string; reason?: string; redirectUrl?: string | null; errorCode?: string; message?: unknown };
  if (status >= 200 && status < 300) {
    const ed = PRODUCTS[key].edition;
    if (b.status === 'FALLBACK') {
      const q = new URLSearchParams({ from: 'kiorly-home', reason: /^[a-z_]{2,32}$/.test(b.reason ?? '') ? b.reason! : 'other' }); if (ed) q.set('edition', ed);
      return { kind: 'redirect', url: `${base}/login?${q}`, fallback: true };
    }
    if (b.status === 'OK' && typeof b.code === 'string' && /^[A-Za-z0-9_-]{20,128}$/.test(b.code)) {
      const q = new URLSearchParams({ handoff: b.code, from: 'kiorly-home' }); if (ed) q.set('edition', ed);
      return { kind: 'redirect', url: `${base}/login?${q}`, fallback: false };
    }
    return { kind: 'error', code: 'server' };
  }
  const code = b.errorCode ?? (b as { code?: string }).code;
  if (status === 429) return { kind: 'error', code: 'rateLimited' };
  if (status === 403 && code === 'HANDOFF_ORIGIN_NOT_ALLOWED') return { kind: 'error', code: 'notAllowed' };
  if (status === 404 && code === 'LOCAL_LOGIN_DISABLED') return { kind: 'error', code: 'passwordDisabled' };
  if (status === 400 || status === 401 || status === 403 || status === 404) return { kind: 'error', code: 'invalid' };
  return { kind: 'error', code: 'server' };
}

/** Where Home sends the browser. The product completes its OWN silent Passport code flow (the SSO session already exists). */
export function productEntryUrl(card: Pick<Card, 'key' | 'url'>): string {
  const q = new URLSearchParams({ sso: 'passport', from: 'kiorly-home' });
  const ed = PRODUCTS[card.key].edition;
  if (ed) q.set('edition', ed);
  return `${card.url}/login?${q}`;
}
export const signupUrl = (key: CardKey, baseUrl: string): string => `${baseUrl.replace(/\/+$/, '')}${PRODUCTS[key].signupPath}`;

/** Theme: LIGHT is the default (founder, 24 Nov 2026), never "follow the system". `auto` is the explicit "System" choice. Only an explicit choice is stored (`kh.theme`). */
export type Theme = 'light' | 'dark' | 'auto';
export const DEFAULT_THEME: Theme = 'light';
export const THEME_KEY = 'kh.theme';
export const parseTheme = (v: unknown): Theme => (v === 'dark' || v === 'auto' || v === 'light' ? v : DEFAULT_THEME);
