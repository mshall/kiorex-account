// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { formatMoney, mountPlans, parsePlans, renderPlans, type PlansLabels } from '../src/plans';
import { bindTabs } from '../src/tabs';
import { PLANS } from '../src/content';

const L = (lang: 'ar' | 'en'): PlansLabels => ({ tabs: PLANS.tabs[lang], modules: PLANS.modules[lang], tbd: PLANS.tbd[lang], ask: PLANS.ask[lang], includes: PLANS.includes[lang], free: PLANS.free[lang], unavailable: PLANS.unavailable[lang], marketNote: PLANS.marketNote[lang], perMonth: PLANS.perMonth[lang], perYear: PLANS.perYear[lang], perClinic: PLANS.perClinic[lang], perClinician: PLANS.perClinician[lang], included: PLANS.included[lang], extra: PLANS.extra[lang], noPlans: PLANS.noPlans[lang], more: PLANS.more[lang] });
const loc = (en: string, ar = `ع ${en}`) => ({ en, ar });
const lines = (en: string[]) => ({ en, ar: en.map((x) => `ع ${x}`) });
const plan = (id: string, o: Record<string, unknown> = {}) => ({ id, name: loc(id.toUpperCase()), summary: null, limits: lines([]), features: lines(['Video visits']), priceStatus: 'TO_BE_ANNOUNCED', prices: [], ...o });
const price = (o: Record<string, unknown> = {}) => ({ interval: 'MONTHLY', unit: 'PER_TENANT', amount: '499', currency: 'EGP', includedClinicians: 1, extraClinicianAmount: null, ...o });
const body = (o: Record<string, unknown> = {}) => ({
  contract: 'kiorly.public-plans.v1', generatedAt: 'x', market: { code: 'EG', currency: 'EGP' },
  modules: [{ id: 'clinic', status: 'OK', plans: [plan('lite'), plan('pro', { prices: [price({ unit: 'PER_CLINICIAN', amount: '1299', extraClinicianAmount: '999' }), price({ interval: 'ANNUAL', amount: '9990.50' })] })] }, { id: 'pharmacy', status: 'OK', plans: [plan('lite', { summary: loc('For one pharmacy') })] }, { id: 'lab', status: 'OK', plans: [] }],
  ...o,
});

describe('plans contract reader', () => {
  it('accepts exactly the v1 contract and picks the language', () => {
    const m = parsePlans(body(), 'ar')!;
    expect(m.market).toEqual({ code: 'EG', currency: 'EGP' });
    expect(m.modules.map((x) => x.id)).toEqual(['clinic', 'pharmacy', 'lab']);
    expect(m.modules[0]!.plans[1]!.name).toBe('ع PRO');
    expect(m.modules[0]!.plans[1]!.prices).toHaveLength(2);
  });
  it('refuses anything else, so the fallback text stays', () => {
    for (const bad of [null, 'x', [], {}, { ...body(), contract: 'v2' }, { ...body(), modules: 'no' }, { ...body(), modules: [{ id: 'dental', status: 'OK', plans: [] }] },
      { ...body(), modules: [{ id: 'clinic', status: 'OK', plans: [plan('x', { prices: [price({ amount: 'free' })] })] }] },
      { ...body(), modules: [{ id: 'clinic', status: 'OK', plans: [plan('x', { prices: [price({ amount: '-1' })] })] }] },
      { ...body(), modules: [{ id: 'clinic', status: 'OK', plans: [plan('x', { prices: [price({ currency: 'egp' })] })] }] },
      { ...body(), modules: [{ id: 'clinic', status: 'OK', plans: [plan('x', { name: { en: 'only english' } })] }] },
      { ...body(), modules: [{ id: 'clinic', status: 'OK', plans: [plan('<b>', {})] }] },
      { ...body(), modules: [{ id: 'clinic', status: 'OK', plans: [plan('x', { features: { en: ['a'] } })] }] }]) expect(parsePlans(bad, 'en') === null || parsePlans(bad, 'ar') === null).toBe(true);
  });
});

describe('plans rendering', () => {
  it('shows a price only when the contract carries one, otherwise "Pricing to be announced" and never a number', () => {
    const html = renderPlans(parsePlans(body(), 'en')!, 'en', L('en'))!;
    expect(html).toContain('data-plan="clinic-lite"'); expect(html).toContain('data-price-status="tbd"'); expect(html).toContain('Pricing to be announced');
    const lite = html.slice(html.indexOf('data-plan="clinic-lite"'), html.indexOf('data-plan="clinic-pro"'));
    expect(lite).not.toMatch(/\d{2,}|EGP|E£/);
    const pro = html.slice(html.indexOf('data-plan="clinic-pro"'), html.indexOf('id="ppanel-pharmacy"'));
    expect(pro).toContain('data-price-status="set"'); expect(pro).toMatch(/1,299/); expect(pro).toMatch(/9,990\.50/); expect(pro).toContain('per clinician / month'); expect(pro).toContain('Extra clinician');
    expect(html).toContain('Prices are in EGP for the EG market');
  });
  it('has a tab per product that has plans, in order, with the first selected; an empty product has no tab', () => {
    const html = renderPlans(parsePlans(body(), 'en')!, 'en', L('en'))!;
    expect([...html.matchAll(/role="tab" id="ptab-(\w+)"/g)].map((m) => m[1])).toEqual(['clinic', 'pharmacy']);
    expect(html).toContain('id="ptab-clinic" aria-controls="ppanel-clinic" aria-selected="true"'); expect(html).toContain('id="ppanel-pharmacy" aria-labelledby="ptab-pharmacy" tabindex="0" hidden');
  });
  it('an unreachable Clinic keeps its tab with an honest note while other products still show; nothing to show means null', () => {
    const m = parsePlans(body({ market: null, modules: [{ id: 'clinic', status: 'UNAVAILABLE', plans: [] }, { id: 'pharmacy', status: 'OK', plans: [plan('lite')] }, { id: 'lab', status: 'OK', plans: [] }] }), 'en')!;
    const html = renderPlans(m, 'en', L('en'))!;
    expect(html).toContain('The plans of this product are being finalised.'); expect(html).not.toContain('plans-market');
    expect(renderPlans(parsePlans(body({ modules: [{ id: 'clinic', status: 'UNAVAILABLE', plans: [] }] }), 'en')!, 'en', L('en'))).toBeNull();
  });
  it('a long feature list shows the first six and folds the rest into a disclosure with the count', () => {
    const many = Array.from({ length: 9 }, (_, i) => `Feature ${i + 1}`);
    const html = renderPlans(parsePlans(body({ modules: [{ id: 'clinic', status: 'OK', plans: [plan('big', { features: lines(many) }), plan('small', { features: lines(many.slice(0, 6)) })] }] }), 'en')!, 'en', L('en'))!;
    const big = html.slice(html.indexOf('data-plan="clinic-big"'), html.indexOf('data-plan="clinic-small"'));
    expect(big).toContain('<details class="more"><summary>Show 3 more features</summary>'); expect((big.match(/<li><svg/g) ?? []).length).toBe(9); expect(big.indexOf('Feature 6')).toBeLessThan(big.indexOf('<details'));
    expect(html.slice(html.indexOf('data-plan="clinic-small"'))).not.toContain('<details');
  });
  it('escapes every value', () => {
    const evil = parsePlans(body({ modules: [{ id: 'clinic', status: 'OK', plans: [plan('x', { name: loc('<img src=x onerror=alert(1)>'), features: lines(['<script>1</script>']) })] }] }), 'en')!;
    const html = renderPlans(evil, 'en', L('en'))!;
    expect(html).not.toContain('<img src=x'); expect(html).not.toContain('<script>'); expect(html).toContain('&lt;img');
  });
  it('Arabic uses Arabic words and digits, and every button asks to join with its own product', () => {
    const html = renderPlans(parsePlans(body(), 'ar')!, 'ar', L('ar'))!;
    expect(html).toContain('الأسعار تعلن قريبا'); expect(html).toContain('لكل طبيب'); expect(html).toContain('العيادة'); expect(html).toMatch(/[٠-٩]/);
    expect(html).toContain('data-join-module="CLINIC"'); expect(html).toContain('data-join-module="PHARMACY"');
  });
  it('money formatting: whole numbers without decimals, decimals with two', () => {
    expect(formatMoney('499', 'EGP', 'en')).toMatch(/499/); expect(formatMoney('499', 'EGP', 'en')).not.toMatch(/\./);
    expect(formatMoney('12.5', 'USD', 'en')).toMatch(/12\.50/);
  });
});

describe('mounting', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  const host = () => { const h = document.createElement('div'); h.innerHTML = '<div data-plans-fallback>fallback</div><div data-plans-live hidden></div>'; return h; };
  const ok = (b: unknown): typeof fetch => (async () => new Response(JSON.stringify(b), { status: 200 })) as unknown as typeof fetch;
  it('replaces the fallback with the live plans when the contract is valid, and binds the tabs', async () => {
    const h = host(); document.body.append(h); let bound = 0;
    expect(await mountPlans(h, { endpoint: 'https://x/plans', lang: 'en', labels: L('en'), bind: () => { bound++; }, fetchImpl: ok(body()) })).toBe('live');
    expect(h.querySelector<HTMLElement>('[data-plans-fallback]')!.hidden).toBe(true); expect(h.querySelector<HTMLElement>('[data-plans-live]')!.hidden).toBe(false);
    expect(h.querySelectorAll('.plan').length).toBe(3); expect(bound).toBe(1); expect(h.dataset.state).toBe('live');
  });
  it('keeps the fallback on a network error, a non-200, a bad body and a timeout; sends no credentials and no referrer', async () => {
    let init: RequestInit | undefined;
    const cases: Array<typeof fetch> = [(async () => { throw new TypeError('network'); }) as unknown as typeof fetch, (async () => new Response('x', { status: 503 })) as unknown as typeof fetch, ok({ contract: 'nope' }), ok('garbage'),
      ((_u: unknown, i?: RequestInit) => new Promise((_r, rej) => { init = i; i?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))); })) as unknown as typeof fetch];
    for (const f of cases) {
      const h = host();
      expect(await mountPlans(h, { endpoint: 'https://x/plans', lang: 'en', labels: L('en'), bind: () => undefined, fetchImpl: f, timeoutMs: 30 })).toBe('fallback');
      expect(h.querySelector<HTMLElement>('[data-plans-fallback]')!.hidden).toBe(false); expect(h.querySelector<HTMLElement>('[data-plans-live]')!.hidden).toBe(true); expect(h.dataset.state).toBe('fallback');
    }
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer' });
  });
  it('bindTabs switches panels and wraps with the arrow keys (RTL reverses them)', async () => {
    const h = host(); document.body.append(h);
    await mountPlans(h, { endpoint: 'https://x/plans', lang: 'en', labels: L('en'), bind: bindTabs, fetchImpl: ok(body()) });
    const tabs = [...h.querySelectorAll<HTMLButtonElement>('[role=tab]')];
    tabs[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true'); expect(h.querySelector<HTMLElement>('#ppanel-pharmacy')!.hidden).toBe(false); expect(h.querySelector<HTMLElement>('#ppanel-clinic')!.hidden).toBe(true);
    tabs[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
  });
});
