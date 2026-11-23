import { describe, it, expect } from 'vitest';
import { decide, parseTo, productEntryUrl, signupUrl, toCards, type ApiWorkspace, PRODUCTS, CARD_KEYS } from '../src/core';
import { DICT } from '../src/i18n';

const w = (product: ApiWorkspace['product'], edition: ApiWorkspace['edition'], org: string, role = 'owner'): ApiWorkspace =>
  ({ id: `${org}:${product}`, product, edition, org_id: org, org_name: org, role, product_url: { clinic: 'http://localhost:5174', pharmacy: 'http://localhost:5192/', lab: 'http://localhost:5193' }[product] });

describe('toCards', () => {
  it('groups orgs inside a product (the product keeps its own org picker); Nurse is its own card of the Clinic app', () => {
    const cards = toCards([w('clinic', 'CLINIC', 'a'), w('clinic', 'CLINIC', 'b'), w('clinic', 'NURSE', 'n'), w('pharmacy', null, 'p'), w('lab', null, 'l')]);
    expect(cards.map((c) => c.key)).toEqual(['clinic', 'nurse', 'pharmacy', 'lab']);
    expect(cards[0]!.orgs).toHaveLength(2);
    expect(cards[2]!.url).toBe('http://localhost:5192');
  });
});

describe('decide', () => {
  const one = toCards([w('lab', null, 'l')]);
  const many = toCards([w('clinic', 'CLINIC', 'a'), w('pharmacy', null, 'p'), w('lab', null, 'l')]);
  it('exactly one workspace skips the picker', () => expect(decide(one, { to: null, last: null })).toMatchObject({ kind: 'route', reason: 'single', card: { key: 'lab' } }));
  it('several workspaces show the picker with the last used first', () => {
    const d = decide(many, { to: null, last: 'lab' });
    expect(d.kind).toBe('picker');
    if (d.kind === 'picker') { expect(d.cards.map((c) => c.key)).toEqual(['lab', 'clinic', 'pharmacy']); expect(d.last).toBe('lab'); }
  });
  it('a stale last-used value is ignored', () => { const d = decide(many, { to: null, last: 'nurse' }); expect(d).toMatchObject({ kind: 'picker', last: null }); });
  it('no workspace shows Create or join', () => expect(decide([], { to: null, last: null }).kind).toBe('empty'));
  it('deep link bypasses the picker', () => expect(decide(many, { to: 'pharmacy', last: 'lab' })).toMatchObject({ kind: 'route', reason: 'deeplink', card: { key: 'pharmacy' } }));
  it('deep link to a product the person is not in', () => expect(decide(one, { to: 'clinic', last: null })).toMatchObject({ kind: 'missing', wanted: 'clinic' }));
  it('"Switch workspace" always shows the picker, even with one workspace', () => expect(decide(one, { to: null, last: null, switching: true }).kind).toBe('picker'));
});

describe('urls', () => {
  it('parseTo reads ?to=, ?product= and /signin/<product>; ignores junk', () => {
    expect(parseTo('?to=nurse')).toBe('nurse'); expect(parseTo('?product=LAB')).toBe('lab'); expect(parseTo('', '/signin/pharmacy')).toBe('pharmacy');
    expect(parseTo('?to=evil')).toBeNull(); expect(parseTo('', '/signin/callback')).toBeNull(); expect(parseTo('')).toBeNull();
  });
  it('product entry url carries the silent-SSO hint; Nurse routes into the Clinic app with edition NURSE', () => {
    expect(productEntryUrl({ key: 'pharmacy', url: 'http://localhost:5192' })).toBe('http://localhost:5192/login?sso=passport&from=kiorly-home');
    const n = new URL(productEntryUrl({ key: 'nurse', url: 'https://nurse.kiorly.com' }));
    expect(n.origin).toBe('https://nurse.kiorly.com'); expect(n.searchParams.get('edition')).toBe('NURSE'); expect(n.searchParams.get('sso')).toBe('passport');
  });
  it('sign-up links point at each product\'s existing sign-up', () => {
    expect(signupUrl('clinic', 'http://localhost:5174/')).toBe('http://localhost:5174/signup');
    expect(signupUrl('lab', 'http://localhost:5193')).toBe('http://localhost:5193/onboarding');
    expect(signupUrl('nurse', 'https://nurse.kiorly.com')).toBe('https://nurse.kiorly.com/signup?edition=nurse');
  });
  it('product accents are the founder ones', () => {
    expect([PRODUCTS.clinic.accent, PRODUCTS.lab.accent, PRODUCTS.pharmacy.accent]).toEqual(['#0D9488', '#7C3AED', '#16A34A']);
  });
});

describe('i18n', () => {
  const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  it('Arabic and English have the same keys; staff app never called "Kiorly Team"', () => {
    expect(keys(DICT.ar).sort()).toEqual(keys(DICT.en).sort());
    expect(JSON.stringify(DICT)).not.toMatch(/Kiorly Team|Kiorly Work/);
    for (const k of CARD_KEYS) expect(DICT.en.product[k]).toMatch(/^Kiorly .* by Kiorex$/);
  });
});
