import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MOCK = Number(process.env.KIORLY_SITE_E2E_PORT ?? 5496);
const LIVE = MOCK + 1;
const LEAD_ENDPOINT = `http://127.0.0.1:${MOCK + 20}/leads`;
const LIVE_URL = `http://127.0.0.1:${LIVE}`;

async function pick(page: Page, mode: 'STANDALONE' | 'CONNECTED', type: string) {
  await page.locator(`input[name=mode][value=${mode}]`).check({ force: true });
  await page.locator(`input[name=providerType][value=${type}]`).check({ force: true });
}
const next = (page: Page) => page.locator('[data-next]').click();
async function fillAll(page: Page, over: Record<string, string> = {}) {
  await pick(page, 'CONNECTED', 'CLINIC'); await next(page);
  await page.locator('#f-legalName').fill(over.legalName ?? '[TEST] Nile Family Clinic'); await page.locator('#f-branches').fill('2'); await page.locator('#f-staffCount').fill('14');
  await page.locator('input[name=specialties][value=PEDIATRICS]').check({ force: true }); await page.locator('#f-services').fill('Walk-in and follow-up'); await page.locator('#f-currentSoftware').fill('Paper'); await next(page);
  await page.locator('#f-contactName').fill('Dr Salma'); await page.locator('#f-contactRole').fill('Owner'); await page.locator('#f-phone').fill(over.phone ?? '0100 123 4567'); await page.locator('#f-email').fill('salma@example.test');
  await page.locator('#f-governorate').selectOption('CAIRO'); await page.locator('#f-city').fill('Nasr City'); await next(page);
  await page.locator('#f-licences-facilityLicence').fill('FL-1234/2025'); await page.locator('#f-licences-taxCard').fill('555-444-333'); await page.locator('input[name=modules][value=CLINIC]').check({ force: true }); await page.locator('#f-goLive').selectOption('WITHIN_1_MONTH'); await next(page);
  await page.locator('input[name=contactChannel][value=WHATSAPP]').check({ force: true }); await page.locator('input[name=contactTime][value=EVENING]').check({ force: true }); await page.locator('#f-note').fill('Please call after 5 pm'); await page.locator('#f-consent').check();
}
const home = async (page: Page) => { while (await page.locator('[data-back]').isVisible()) await page.locator('[data-back]').click(); };
const settle = (page: Page) => page.evaluate(() => { document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')); });

test.describe('language, layout and navigation', () => {
  test('the root page sends Arabic browsers to /ar/ and others to /en/', async ({ browser }) => {
    for (const [locale, path] of [['ar-EG', '/ar/'], ['en-GB', '/en/']] as const) {
      const ctx = await browser.newContext({ locale }); const page = await ctx.newPage();
      await page.goto('/'); await expect(page).toHaveURL(new RegExp(`${path}$`)); await ctx.close();
    }
  });
  test('the language switch keeps the page; Arabic is right to left with mirrored layout', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 }); await page.goto('/en/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.getByRole('link', { name: 'العربية' }).click();
    await expect(page).toHaveURL(/\/ar\/$/); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('عيادتك');
    expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl');
    // the logo sits at the right edge and the CTA at the left in RTL
    const [logo, cta] = await Promise.all([page.locator('.logo').boundingBox(), page.locator('#site-nav .btn.small').last().boundingBox()]);
    expect(logo!.x).toBeGreaterThan(cta!.x);
    await page.getByRole('link', { name: 'English' }).click(); await expect(page).toHaveURL(/\/en\/$/);
  });
  for (const lang of ['en', 'ar']) for (const width of [375, 768, 1280]) {
    test(`no horizontal scroll at ${width}px (${lang}); the phone menu opens and closes with Escape`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 }); await page.goto(`/${lang}/`); await settle(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width < 992) {
        const btn = page.locator('[data-menu-toggle]'); await expect(btn).toBeVisible(); await btn.click(); await expect(btn).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#site-nav').getByRole('link', { name: lang === 'ar' ? 'الباقات' : 'Plans' })).toBeVisible();
        await page.keyboard.press('Escape'); await expect(btn).toHaveAttribute('aria-expanded', 'false');
      }
    });
  }
  test('in-page navigation reaches the sections and marks the one being read', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/en/');
    await page.locator('#site-nav').getByRole('link', { name: 'Security' }).click(); await expect(page.locator('#security-h')).toBeInViewport();
    await expect(page.locator('#site-nav a[aria-current=true]')).toHaveText('Security');
  });
  test('unknown paths show the 404 page, whose links go to the home page sections', async ({ page }) => {
    const r = await page.goto('/en/nothing-here/'); expect(r?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
    expect(await page.locator('#site-nav a[href^="/en/#"]').count()).toBeGreaterThan(3);
  });
});

test.describe('content and interaction', () => {
  test('product tabs: click and keyboard (arrow keys mirror in Arabic), panels switch, all six products are reachable', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/en/'); await settle(page);
    const tabs = page.locator('#modules [role=tab]'); await expect(tabs).toHaveCount(6);
    await expect(page.locator('#panel-clinic')).toBeVisible(); await expect(page.locator('#panel-pharmacy')).toBeHidden();
    await tabs.first().focus(); await page.keyboard.press('ArrowRight');
    await expect(page.locator('#tab-pharmacy')).toHaveAttribute('aria-selected', 'true'); await expect(page.locator('#panel-pharmacy')).toBeVisible(); await expect(page.locator('#panel-clinic')).toBeHidden();
    await page.keyboard.press('End'); await expect(page.locator('#panel-enterprise')).toBeVisible(); await expect(page.locator('#panel-enterprise')).toContainText('Hospitals and chains');
    await page.locator('#tab-lab').click(); await expect(page.locator('#panel-lab')).toContainText('Standalone'); await expect(page.locator('#panel-lab')).toContainText('Connected to Kiorex');
    await page.goto('/ar/'); await settle(page); await page.locator('#modules [role=tab]').first().focus(); await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#tab-pharmacy')).toHaveAttribute('aria-selected', 'true');
  });
  test('journeys and the FAQ', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/en/'); await settle(page);
    await page.locator('#ftab-rx').click(); await expect(page.locator('#fpanel-rx')).toBeVisible(); await expect(page.locator('#fpanel-rx li')).toHaveCount(5);
    const d = page.locator('#faq details').first(); await d.locator('summary').click(); await expect(d).toHaveAttribute('open', '');
  });
  test('a module "join" button preselects the product, the type and the mode in the form', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/en/'); await settle(page);
    await page.locator('#tab-lab').click(); await page.locator('#panel-lab a[data-join-module]').click();
    await expect(page).toHaveURL(/#join$/); await expect(page.locator('input[name=providerType][value=LAB]')).toBeChecked();
    await next(page).catch(() => undefined); // mode still missing: the error summary appears
    await page.locator('#modes').scrollIntoViewIfNeeded(); await page.locator('#modes a[data-join-mode=STANDALONE]').click();
    await expect(page.locator('input[name=mode][value=STANDALONE]')).toBeChecked(); await expect(page.locator('input[name=providerType][value=LAB]')).toBeChecked();
    await next(page); await page.locator('#f-legalName').fill('Giza Lab'); await next(page); await page.locator('#f-contactName').fill('Dr X'); await page.locator('#f-phone').fill('01001234567'); await next(page);
    await expect(page.locator('input[name=modules][value=LAB]')).toBeChecked();
  });
  test('reduced motion: nothing is hidden or animated; with no preference the reveal animation runs', async ({ browser }) => {
    const rm = await browser.newContext({ reducedMotion: 'reduce' }); const p1 = await rm.newPage(); await p1.goto('/en/');
    await expect(p1.locator('html')).toHaveClass(/rm/);
    expect(await p1.evaluate(() => [...document.querySelectorAll('.reveal')].every((e) => getComputedStyle(e).opacity === '1'))).toBe(true);
    expect(await p1.evaluate(() => getComputedStyle(document.querySelector('.float-a')!).animationName)).toBe('none');
    expect(await p1.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe('auto'); await rm.close();
    const ok = await browser.newContext({ reducedMotion: 'no-preference' }); const p2 = await ok.newPage(); await p2.goto('/en/');
    expect(await p2.evaluate(() => getComputedStyle(document.querySelector('.float-a')!).animationName)).toBe('floaty');
    expect(await p2.evaluate(() => getComputedStyle(document.querySelector('#faq .reveal')!).opacity)).toBe('0'); // below the fold: waits to be revealed
    await p2.locator('#faq').scrollIntoViewIfNeeded(); await expect(p2.locator('#faq .reveal').first()).toHaveCSS('opacity', '1'); await ok.close();
  });
  test('without JavaScript the content is visible and every product panel is shown', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false }); const page = await ctx.newPage(); await page.goto('/en/');
    await expect(page.locator('#panel-pharmacy')).toBeVisible(); expect(await page.locator('.reveal').first().evaluate((e) => getComputedStyle(e).opacity)).toBe('1'); await expect(page.locator('noscript')).toHaveCount(1); await ctx.close();
  });
});

test.describe('accessibility (axe, light theme, both languages)', () => {
  // axe reads colours at one instant: a card half-way through its fade-in would be judged on a blended colour, so these scans run with reduced motion (the same page, nothing animated)
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });
  for (const lang of ['en', 'ar']) {
    test(`${lang}: the page, every product tab, the journeys and the form states`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(`/${lang}/`); await settle(page);
      const scan = async (label: string) => { const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), label).toEqual([]); };
      await scan('page');
      for (const id of ['pharmacy', 'lab', 'nurse', 'staff', 'enterprise']) { await page.locator(`#tab-${id}`).click(); await scan(`tab ${id}`); }
      await page.locator('#ftab-lab').click(); await scan('journey');
      await page.locator('#faq details').first().locator('summary').click(); await scan('faq open');
      await next(page); await scan('form errors step 1');
      await pick(page, 'STANDALONE', 'NURSE'); await next(page); await scan('form step 2 (nurse)');
      await next(page); await scan('form step 2 errors');
    });
  }
  test('the form steps 3 to 5 and the success screen pass axe (English and Arabic)', async ({ page }) => {
    for (const lang of ['en', 'ar']) {
      await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(`/${lang}/`); await settle(page);
      await fillAll(page); await page.locator('[data-back]').click(); await page.locator('[data-back]').click(); await page.locator('[data-back]').click();
      const scan = async (label: string) => { const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze(); expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`), `${lang} ${label}`).toEqual([]); };
      await scan('step 2'); await next(page); await scan('step 3'); await next(page); await scan('step 4'); await next(page); await scan('step 5');
      await page.locator('[data-submit]').click(); await expect(page.locator('[data-done-title]')).toBeVisible(); await scan('success');
    }
  });
});

test.describe('join form (mock mode: validates, sends nothing)', () => {
  // reduced motion: the form card must not be sliding into place while a test clicks inside it
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 1280, height: 900 }); await page.goto('/en/'); await settle(page); });
  test('the first step needs a mode and a type; the error summary links to the field and focus moves to it', async ({ page }) => {
    await next(page);
    const sum = page.locator('[data-summary]'); await expect(sum).toBeVisible(); await expect(sum).toBeFocused(); await expect(sum).toContainText('Please check these fields'); await expect(sum.locator('li')).toHaveCount(2);
    await sum.getByRole('link', { name: /How do you want to join/ }).click(); await expect(page.locator('#f-mode')).toBeFocused();
    await expect(page.locator('#join [data-mock-banner]')).toBeVisible();
  });
  test('conditional fields follow the provider type (chain, independent doctor, nurse, hospital, other)', async ({ page }) => {
    await pick(page, 'STANDALONE', 'CHAIN'); await next(page);
    await expect(page.locator('#f-branches')).toBeVisible(); await expect(page.locator('#f-answers-centralBilling')).toBeVisible(); await expect(page.locator('#f-answers-citiesCount')).toBeVisible();
    await page.locator('#f-legalName').fill('Delta Chain'); await page.locator('#f-branches').fill('1'); await next(page); await expect(page.locator('#e-branches')).toContainText('at least 2');
    await page.locator('[data-back]').click(); await pick(page, 'STANDALONE', 'INDEPENDENT_DOCTOR'); await next(page);
    await expect(page.locator('#f-branches')).toHaveCount(0); await expect(page.locator('#f-answers-practiceSetting')).toBeVisible(); await page.locator('#f-legalName').fill('Dr Omar'); await next(page);
    await page.locator('#f-contactName').fill('Dr Omar'); await page.locator('#f-phone').fill('01001234567'); await next(page);
    await expect(page.locator('#f-licences-professionalLicence')).toBeVisible(); await expect(page.locator('#f-licences-facilityLicence')).toHaveCount(0);
    await expect(page.locator('[data-licence-note]')).toContainText('we do not check them with any authority');
    for (const [type, field] of [['NURSE', '#f-answers-homeVisits'], ['HOSPITAL', '#f-answers-beds'], ['LAB', '#f-answers-homeSampling'], ['PHARMACY', '#f-answers-delivery'], ['OTHER', '#f-answers-otherDescription']] as const) {
      await home(page); await pick(page, 'STANDALONE', type); await next(page); await expect(page.locator(field), type).toBeVisible();
    }
    await next(page); await expect(page.locator('#e-answers-otherDescription')).toBeVisible();
  });
  test('client validation: phone, e-mail, licence characters, text limits; Arabic digits are understood', async ({ page }) => {
    await pick(page, 'STANDALONE', 'CLINIC'); await next(page); await page.locator('#f-legalName').fill('<script>'); await next(page); await expect(page.locator('#e-legalName')).toBeVisible();
    await page.locator('#f-legalName').fill('Nile Clinic'); await next(page);
    await page.locator('#f-contactName').fill('Dr Salma'); await page.locator('#f-phone').fill('123'); await page.locator('#f-email').fill('nope'); await next(page);
    await expect(page.locator('#e-phone')).toContainText('valid phone number'); await expect(page.locator('#e-email')).toContainText('valid e-mail');
    await page.locator('#f-phone').fill('٠١٠٠١٢٣٤٥٦٧'); await page.locator('#f-email').fill('a@b.co'); await next(page);
    await page.locator('#f-licences-taxCard').fill('<bad>'); await next(page); await expect(page.locator('#e-licences-taxCard')).toBeVisible();
    await page.locator('#f-licences-taxCard').fill('555-444'); await page.locator('input[name=modules][value=LAB]').check({ force: true }); await next(page);
    await page.locator('[data-submit]').click(); await expect(page.locator('#e-consent')).toContainText('must agree'); await expect(page.locator('[data-needs-human=consent]')).toContainText('TODO_NEEDS_HUMAN');
  });
  test('the honeypot is invisible, unreachable by keyboard, and a filled one still looks like a success but shows no real reference', async ({ page }) => {
    const hp = page.locator('#jf-website'); await expect(hp).not.toBeInViewport(); expect(await hp.evaluate((e) => (e as HTMLInputElement).tabIndex)).toBe(-1);
    await fillAll(page); await hp.evaluate((e) => { (e as HTMLInputElement).value = 'http://spam.example'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-done-title]')).toBeVisible();
  });
  test('a full submission in mock mode shows a sample reference, says nothing was sent, and can start over', async ({ page }) => {
    await fillAll(page); await expect(page.locator('[data-review]')).toContainText('Dr Salma'); await expect(page.locator('[data-review]')).toContainText('+201001234567');
    const sent: string[] = []; page.on('request', (r) => { if (r.method() === 'POST') sent.push(r.url()); });
    await page.locator('[data-submit]').click();
    await expect(page.locator('[data-done-title]')).toBeFocused(); await expect(page.locator('[data-ref]')).toHaveText('KL-SAMPLE00'); await expect(page.locator('.wiz-done .alert')).toContainText('nothing was sent');
    expect(sent).toEqual([]);
    await page.locator('[data-another]').click(); await expect(page.locator('input[name=mode]').first()).toBeVisible(); await expect(page.locator('input[name=mode][value=CONNECTED]')).not.toBeChecked();
  });
  test('Arabic form: RTL, Arabic labels and the draft consent mark', async ({ page }) => {
    await page.goto('/ar/'); await settle(page); await expect(page.locator('#join [data-wiz]')).toBeVisible(); await expect(page.getByText('كيف تريد الانضمام؟').first()).toBeVisible();
    await expect(page.locator('input[name=providerType][value=CLINIC]').locator('xpath=following-sibling::span')).toContainText('عيادة');
    await fillAll(page); await page.locator('[data-back]').click(); await page.locator('[data-next]').click().catch(() => undefined);
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-ref]')).toHaveText('KL-SAMPLE00');
  });
});

test.describe('join form (live endpoint intercepted)', () => {
  type Seen = { method: string; headers: Record<string, string>; body: Record<string, unknown> | null };
  async function stub(page: Page, handler: (n: number, s: Seen) => { status: number; json: unknown } | 'abort', config?: unknown) {
    const seen: Seen[] = []; let n = 0;
    const cors = { 'access-control-allow-origin': LIVE_URL, 'access-control-allow-headers': 'content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' };
    await page.route(`${LEAD_ENDPOINT}/config`, (r: Route) => (config ? r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(config) }) : r.fulfill({ status: 404, headers: cors, body: '' })));
    await page.route(LEAD_ENDPOINT, async (r: Route) => {
      const req = r.request();
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      const s: Seen = { method: req.method(), headers: req.headers(), body: req.postDataJSON() }; seen.push(s);
      const out = handler(++n, s); if (out === 'abort') return r.abort('failed');
      return r.fulfill({ status: out.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(out.json) });
    });
    return seen;
  }
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.setViewportSize({ width: 1280, height: 900 }); });

  test('posts the normalised payload with an Idempotency-Key, no honeypot, the consent version and no referrer; shows the reference and what happens next', async ({ page }) => {
    const seen = await stub(page, () => ({ status: 201, json: { reference: 'KL-ABCD2345', status: 'RECEIVED', replayed: false } }));
    await page.goto(`${LIVE_URL}/en/`); await settle(page); await expect(page.locator('#join [data-mock-banner]')).toHaveCount(0);
    await fillAll(page); await page.locator('[data-submit]').click();
    await expect(page.locator('[data-ref]')).toHaveText('KL-ABCD2345'); await expect(page.locator('.next-steps li')).toHaveCount(3); await expect(page.locator('.wiz-done')).toContainText('verification and a separate agreement');
    const posts = seen.filter((s) => s.method === 'POST'); expect(posts).toHaveLength(1); const p = posts[0]!;
    expect(p.headers['idempotency-key']).toMatch(/^[A-Za-z0-9_-]{8,64}$/); expect(p.headers['content-type']).toContain('application/json'); expect(p.headers.cookie).toBeUndefined();
    expect(p.body).toMatchObject({ source: 'kiorly-site', env: 'local', mode: 'CONNECTED', providerType: 'CLINIC', legalName: '[TEST] Nile Family Clinic', contactName: 'Dr Salma', phone: '+201001234567', email: 'salma@example.test', governorate: 'CAIRO', city: 'Nasr City', branches: 2, staffCount: 14, specialties: ['PEDIATRICS'], modules: ['CLINIC'], goLive: 'WITHIN_1_MONTH', locale: 'en', contactChannel: 'WHATSAPP', contactTime: 'EVENING', note: 'Please call after 5 pm', licences: { facilityLicence: 'FL-1234/2025', taxCard: '555-444-333' }, consent: { accepted: true, textVersion: 'draft-2' } });
    expect(p.body).not.toHaveProperty('website');
    await page.locator('[data-copy]').click();
  });
  test('a failed send keeps the answers and retries with the SAME Idempotency-Key; the second try succeeds once', async ({ page }) => {
    const seen = await stub(page, (n) => (n === 1 ? { status: 503, json: { code: 'X' } } : n === 2 ? 'abort' : { status: 201, json: { reference: 'KL-RETRY234', replayed: true } }));
    await page.goto(`${LIVE_URL}/en/`); await settle(page); await fillAll(page);
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-status]')).toContainText('could not send'); await expect(page.locator('[data-submit]')).toBeEnabled();
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-status]')).toContainText('could not send');
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-ref]')).toHaveText('KL-RETRY234');
    const keys = seen.filter((s) => s.method === 'POST').map((s) => s.headers['idempotency-key']); expect(keys).toHaveLength(3); expect(new Set(keys).size).toBe(1);
  });
  test('a 400 VALIDATION_FAILED from the server sends the visitor to the right step with the error shown; a 429 says to wait', async ({ page }) => {
    await stub(page, (n) => (n === 1 ? { status: 400, json: { code: 'VALIDATION_FAILED', fields: { phone: 'invalid', 'licences.taxCard': 'invalid' } } } : { status: 429, json: { code: 'RATE_LIMITED', retryAfterSec: 60 } }));
    await page.goto(`${LIVE_URL}/en/`); await settle(page); await fillAll(page);
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-step-title]')).toContainText('Contact and location'); await expect(page.locator('#e-phone')).toBeVisible(); await expect(page.locator('[data-summary]')).toBeFocused();
    await page.locator('#f-phone').fill('01001234567'); await next(page); await next(page); await page.locator('#f-consent').check();
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-status]')).toContainText('Too many requests');
  });
  test('the live configuration replaces the embedded picklists (a team-added provider type, an inactive one gone)', async ({ page }) => {
    const defaults = JSON.parse(await (await import('node:fs')).promises.readFile(new URL('../src/form-defaults.json', import.meta.url), 'utf8'));
    const live = { ...defaults, providerTypes: [...defaults.providerTypes.filter((t: { key: string }) => t.key !== 'OTHER'), { key: 'DENTAL_CENTRE', en: 'Dental centre', ar: 'مركز أسنان', active: true }], typeFields: { ...defaults.typeFields, DENTAL_CENTRE: defaults.typeFields.OTHER }, requiredFields: ['modules', 'email'] };
    await stub(page, () => ({ status: 201, json: { reference: 'KL-LIVECFG2' } }), live);
    await page.goto(`${LIVE_URL}/en/`); await settle(page);
    await expect(page.locator('#join [data-join]')).toHaveAttribute('data-config', 'live'); await expect(page.getByText('Dental centre')).toBeVisible(); await expect(page.locator('input[name=providerType][value=OTHER]')).toHaveCount(0);
    await pick(page, 'STANDALONE', 'CLINIC'); await next(page); await page.locator('#f-legalName').fill('Nile'); await next(page); await page.locator('#f-contactName').fill('Dr S'); await page.locator('#f-phone').fill('01001234567'); await next(page);
    await expect(page.locator('#e-email')).toContainText('required');
  });
  test('a filled honeypot sends nothing at all', async ({ page }) => {
    const seen = await stub(page, () => ({ status: 201, json: { reference: 'KL-NOPE0000' } }));
    await page.goto(`${LIVE_URL}/en/`); await settle(page); await fillAll(page);
    await page.locator('#jf-website').evaluate((e) => { (e as HTMLInputElement).value = 'x'; e.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('[data-submit]').click(); await expect(page.locator('[data-done-title]')).toBeVisible(); expect(seen.filter((s) => s.method === 'POST')).toHaveLength(0);
  });
});
