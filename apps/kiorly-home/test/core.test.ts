import { describe, it, expect } from 'vitest';
import { handoffRedirect, initialTile, needsOrg, parseMethod, parseTo, productEntryUrl, signupUrl, toCards, workspaceHint, type ApiWorkspace, PRODUCTS, CARD_KEYS } from '../src/core';
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

describe('workspaceHint (gentle hint, never a block)', () => {
  const one = toCards([w('lab', null, 'l')]);
  const many = toCards([w('clinic', 'CLINIC', 'a'), w('pharmacy', null, 'p'), w('lab', null, 'l')]);
  it('exactly one workspace that is not the chosen tile gives a hint', () => expect(workspaceHint(one, 'clinic')?.key).toBe('lab'));
  it('exactly one workspace that IS the chosen tile gives no hint', () => expect(workspaceHint(one, 'lab')).toBeNull());
  it('several workspaces or none never hint (the chosen product just opens)', () => { expect(workspaceHint(many, 'nurse')).toBeNull(); expect(workspaceHint([], 'clinic')).toBeNull(); });
  it('Nurse is a different tile from Clinic for the hint', () => expect(workspaceHint(toCards([w('clinic', 'NURSE', 'n')]), 'clinic')?.key).toBe('nurse'));
});

describe('tile and method defaults', () => {
  it('deep link wins over the remembered tile; junk is ignored; default is Clinic', () => {
    expect(initialTile('pharmacy', 'lab')).toBe('pharmacy'); expect(initialTile(null, 'lab')).toBe('lab'); expect(initialTile(null, 'evil')).toBe('clinic'); expect(initialTile(null, null)).toBe('clinic');
  });
  it('Passport is the default method; only an explicit password choice flips it', () => {
    expect(parseMethod(null)).toBe('passport'); expect(parseMethod('junk')).toBe('passport'); expect(parseMethod('password')).toBe('password'); expect(parseMethod('passport')).toBe('passport');
  });
  it('only Lab shows the optional organisation field', () => expect(CARD_KEYS.filter(needsOrg)).toEqual(['lab']));
});

describe('handoffRedirect (password handoff answer -> where the browser goes)', () => {
  const CODE = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo';
  it('OK: <product>/login?handoff=<code>&from=kiorly-home, Nurse adds edition NURSE', () => {
    const r = handoffRedirect('pharmacy', 'http://localhost:5192/', 200, { status: 'OK', code: CODE, redirectUrl: 'https://evil.example/x' });
    expect(r).toEqual({ kind: 'redirect', fallback: false, url: `http://localhost:5192/login?handoff=${CODE}&from=kiorly-home` });
    const n = handoffRedirect('nurse', 'https://nurse.kiorly.com', 200, { status: 'OK', code: CODE });
    expect(n.kind === 'redirect' && new URL(n.url).searchParams.get('edition')).toBe('NURSE');
    expect(n.kind === 'redirect' && new URL(n.url).origin).toBe('https://nurse.kiorly.com');
  });
  it('the product-supplied redirectUrl is never trusted: the URL is always built on the domain-table origin', () => {
    const r = handoffRedirect('lab', 'https://lab.kiorly.com', 200, { status: 'OK', code: CODE, redirectUrl: 'https://evil.example/login' });
    expect(r.kind === 'redirect' && new URL(r.url).origin).toBe('https://lab.kiorly.com');
  });
  it('FALLBACK (second factor, expired password, org picker) goes to the product login with a flag and NO code', () => {
    const r = handoffRedirect('clinic', 'http://localhost:5174', 200, { status: 'FALLBACK', reason: 'mfa' });
    expect(r).toEqual({ kind: 'redirect', fallback: true, url: 'http://localhost:5174/login?from=kiorly-home&reason=mfa' });
    const o = handoffRedirect('nurse', 'http://localhost:5174', 200, { status: 'FALLBACK', reason: 'Bad Reason!' });
    expect(o.kind === 'redirect' && o.url).toBe('http://localhost:5174/login?from=kiorly-home&reason=other&edition=NURSE');
  });
  it('a malformed success answer is an error, never a silent redirect', () => {
    for (const body of [null, {}, { status: 'OK' }, { status: 'OK', code: 'short' }, { status: 'OK', code: 'a b'.repeat(10) }]) expect(handoffRedirect('clinic', 'http://x', 200, body)).toEqual({ kind: 'error', code: 'server' });
  });
  it('errors map to stable codes', () => {
    expect(handoffRedirect('clinic', 'http://x', 401, { message: 'Invalid credentials' })).toEqual({ kind: 'error', code: 'invalid' });
    expect(handoffRedirect('pharmacy', 'http://x', 401, { code: 'BAD_CREDENTIALS' })).toEqual({ kind: 'error', code: 'invalid' });
    expect(handoffRedirect('lab', 'http://x', 401, { code: 'LOGIN_FAILED' })).toEqual({ kind: 'error', code: 'invalid' });
    expect(handoffRedirect('clinic', 'http://x', 429, {})).toEqual({ kind: 'error', code: 'rateLimited' });
    expect(handoffRedirect('clinic', 'http://x', 403, { errorCode: 'HANDOFF_ORIGIN_NOT_ALLOWED' })).toEqual({ kind: 'error', code: 'notAllowed' });
    expect(handoffRedirect('pharmacy', 'http://x', 404, { code: 'LOCAL_LOGIN_DISABLED' })).toEqual({ kind: 'error', code: 'passwordDisabled' });
    expect(handoffRedirect('clinic', 'http://x', 500, {})).toEqual({ kind: 'error', code: 'server' });
  });
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

describe('theme: light is the default, an explicit choice is kept', () => {
  it('falls back to light for nothing / garbage and keeps light, dark and the explicit System (auto) choice', async () => {
    const { DEFAULT_THEME, parseTheme } = await import('../src/core');
    expect(DEFAULT_THEME).toBe('light');
    for (const v of [null, undefined, '', 'purple', 1]) expect(parseTheme(v)).toBe('light');
    expect(parseTheme('dark')).toBe('dark'); expect(parseTheme('auto')).toBe('auto'); expect(parseTheme('light')).toBe('light');
  });
});
