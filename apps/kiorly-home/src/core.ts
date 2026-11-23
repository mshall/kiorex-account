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

export type Decision =
  | { kind: 'route'; card: Card; reason: 'single' | 'deeplink' }
  | { kind: 'picker'; cards: Card[]; last: CardKey | null }
  | { kind: 'empty' }
  | { kind: 'missing'; wanted: CardKey; cards: Card[] };

/** `switching` = the person came from "Switch workspace": always show the picker (never auto-route). */
export function decide(cards: Card[], opts: { to: CardKey | null; last: CardKey | null; switching?: boolean }): Decision {
  if (opts.to && !opts.switching) {
    const hit = cards.find((c) => c.key === opts.to);
    return hit ? { kind: 'route', card: hit, reason: 'deeplink' } : { kind: 'missing', wanted: opts.to, cards };
  }
  if (cards.length === 0) return { kind: 'empty' };
  if (cards.length === 1 && !opts.switching) return { kind: 'route', card: cards[0]!, reason: 'single' };
  const last = opts.last && cards.some((c) => c.key === opts.last) ? opts.last : null;
  const sorted = last ? [cards.find((c) => c.key === last)!, ...cards.filter((c) => c.key !== last)] : cards;
  return { kind: 'picker', cards: sorted, last };
}

/** Where Home sends the browser. The product completes its OWN silent Passport code flow (the SSO session already exists). */
export function productEntryUrl(card: Pick<Card, 'key' | 'url'>): string {
  const q = new URLSearchParams({ sso: 'passport', from: 'kiorly-home' });
  const ed = PRODUCTS[card.key].edition;
  if (ed) q.set('edition', ed);
  return `${card.url}/login?${q}`;
}
export const signupUrl = (key: CardKey, baseUrl: string): string => `${baseUrl.replace(/\/+$/, '')}${PRODUCTS[key].signupPath}`;
