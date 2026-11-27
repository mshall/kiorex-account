import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MOCK = Number(process.env.KIORLY_SITE_E2E_PORT ?? 5196);
const LIVE = MOCK + 1;
const LEAD_ENDPOINT = `http://127.0.0.1:${MOCK + 20}/leads`;
const PAGES = ['', 'clinics/', 'pharmacies/', 'labs/', 'how-it-works/', 'plans/', 'onboarding/'];

async function fillValid(page: Page, kindLabel: string) {
  await page.getByLabel(/Type of business|نوع المنشأة/).selectOption({ label: kindLabel });
  await page.locator('#f-organisation').fill('Nile Family Clinic');
  await page.locator('#f-contactName').fill('Dr Salma');
  await page.locator('#f-phone').fill('+20 100 000 0000');
  await page.locator('#f-consent').check();
}

test.describe('language and layout', () => {
  test('the root page sends Arabic browsers to /ar/ and others to /en/', async ({ browser }) => {
    for (const [locale, path] of [['ar-EG', '/ar/'], ['en-GB', '/en/']] as const) {
      const ctx = await browser.newContext({ locale, extraHTTPHeaders: {} });
      const page = await ctx.newPage();
      await page.goto('/');
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await ctx.close();
    }
  });
  test('the language switch keeps the page; Arabic is right to left', async ({ page }) => {
    await page.goto('/en/clinics/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('link', { name: 'العربية' }).click();
    await expect(page).toHaveURL(/\/ar\/clinics\/$/);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('كيورلي كلينيك للعيادات');
    expect(await page.evaluate(() => getComputedStyle(document.body).direction)).toBe('rtl');
  });
  for (const lang of ['en', 'ar']) {
    test(`no horizontal scroll at phone width (${lang}); the menu opens`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      for (const p of PAGES) {
        await page.goto(`/${lang}/${p}`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang}/${p}`).toBe(true);
      }
      await page.goto(`/${lang}/`);
      await page.locator('summary').click();
      await expect(page.getByRole('link', { name: lang === 'ar' ? 'الباقات' : 'Plans' }).first()).toBeVisible();
    });
  }
  test('unknown paths show the 404 page', async ({ page }) => {
    const r = await page.goto('/en/nothing-here/');
    expect(r?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Page not found');
  });
});

test.describe('accessibility (axe, light and dark, both languages)', () => {
  for (const scheme of ['light', 'dark'] as const) for (const lang of ['en', 'ar']) {
    test(`${lang} ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const p of PAGES) {
        await page.goto(`/${lang}/${p}`);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(r.violations.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).join('|')}`), `${lang}/${p} ${scheme}`).toEqual([]);
      }
    });
  }
});

test.describe('onboarding form, mock mode (no endpoint configured)', () => {
  test('validates, then reports the test mode and sends nothing', async ({ page }) => {
    const external: string[] = [];
    page.on('request', (r) => { if (!r.url().startsWith(`http://127.0.0.1:${MOCK}`)) external.push(r.url()); });
    await page.goto('/en/onboarding/');
    await expect(page.locator('[data-mock-banner]')).toContainText('Test mode');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.locator('[data-error-for="kind"]')).toHaveText('This field is required.');
    await expect(page.locator('#f-organisation')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-error-for="consent"]')).toBeVisible();
    await page.locator('#f-kind').selectOption('lab');
    await page.locator('#f-organisation').fill('Nile Lab'); await page.locator('#f-contactName').fill('Dr Salma'); await page.locator('#f-phone').fill('abc'); await page.locator('#f-consent').check();
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.locator('[data-error-for="phone"]')).toHaveText('This value is not valid.');
    await page.locator('#f-phone').fill('+201000000000');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('status')).toContainText('nothing was sent anywhere');
    expect(external).toEqual([]);
  });
  test('Arabic form: errors and the draft consent note are Arabic', async ({ page }) => {
    await page.goto('/ar/onboarding/');
    await page.getByRole('button', { name: 'إرسال الطلب' }).click();
    await expect(page.locator('[data-error-for="organisation"]')).toHaveText('هذا الحقل مطلوب.');
    await expect(page.getByText('صياغة مبدئية بانتظار المراجعة القانونية')).toBeVisible();
  });
  test('the honeypot silently blocks a bot submission', async ({ page }) => {
    await page.goto('/en/onboarding/');
    await fillValid(page, 'Clinic');
    await page.locator('#f-website').evaluate((el: HTMLInputElement) => { el.value = 'http://spam.invalid'; });
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('status')).toHaveText('');
  });
});

test.describe('onboarding form, live endpoint', () => {
  test.use({ baseURL: `http://127.0.0.1:${LIVE}` });
  test('posts the JSON contract to the configured endpoint, with consent version and no cookies', async ({ page }) => {
    let body: Record<string, unknown> | null = null; let credentials: string | undefined;
    await page.route(LEAD_ENDPOINT, async (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST' } });
      body = req.postDataJSON(); credentials = req.headers().cookie;
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: '{"ok":true}' });
    });
    await page.goto('/en/onboarding/');
    await expect(page.locator('[data-mock-banner]')).toHaveCount(0);
    await fillValid(page, 'Pharmacy');
    await page.getByRole('button', { name: 'Send request' }).click();
    await expect(page.getByRole('status')).toHaveText('Your request was sent. We will be in touch.');
    expect(body).toMatchObject({ source: 'kiorly-site', env: 'local', locale: 'en', kind: 'pharmacy', organisation: 'Nile Family Clinic', contactName: 'Dr Salma', phone: '+201000000000', consent: { accepted: true, textVersion: 'draft-1' } });
    expect(credentials).toBeUndefined();
    await expect(page.locator('#f-organisation')).toHaveValue(''); // the form resets after a success
  });
  test('a failing endpoint shows the retry message and keeps what the person typed', async ({ page }) => {
    await page.route(LEAD_ENDPOINT, (route) => route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' } }) : route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: '' }));
    await page.goto('/ar/onboarding/');
    await fillValid(page, 'عيادة');
    await page.getByRole('button', { name: 'إرسال الطلب' }).click();
    await expect(page.getByRole('status')).toHaveText('تعذّر إرسال الطلب. حاول مرة أخرى بعد قليل.');
    await expect(page.locator('#f-organisation')).toHaveValue('Nile Family Clinic');
    await expect(page.getByRole('button', { name: 'إرسال الطلب' })).toBeEnabled();
  });
  test('the plans page lists the configured plans and never a price', async ({ page }) => {
    await page.goto('/en/plans/');
    await expect(page.getByRole('heading', { name: 'First plan' })).toBeVisible();
    await expect(page.getByText('Feature A')).toBeVisible();
    await expect(page.locator('[data-pricing-note]').first()).toHaveText('Pricing is set in Kiorly Ops and is not published on this page.');
    expect(await page.locator('main').innerText()).not.toMatch(/\b(EGP|USD)\b|\$\s?\d|\d\s?(EGP|USD)/);
    await page.goto('/ar/plans/');
    await expect(page.getByRole('heading', { name: 'باقة أولى' })).toBeVisible();
  });
});
