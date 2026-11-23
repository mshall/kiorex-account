import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const IDP = `http://localhost:${Number(process.env.KX_HOME_E2E_IDP_PORT ?? 4455)}`;
const PRODUCT_ORIGINS = ['http://localhost:5174', 'http://localhost:5192', 'http://localhost:5193'];
const P = { ahmed: '+201000002001', mostafa: '+201000002004', multi: '+201000002031', none: '+201000002032', mona: '+201000003001' };

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => { try { if (!localStorage.getItem('kh.lang')) localStorage.setItem('kh.lang', 'en'); } catch { /* ignore */ } });
  for (const o of PRODUCT_ORIGINS) await page.route(`${o}/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>product stub</title><h1 id="stub">product stub</h1>' }));
  await fetch(`${IDP}/dev/reset-rate-limits`, { method: 'POST' });
});

/** Real Passport sign-in through Home's dev "Test users" panel (login_hint), finishing the dev code if the IdP did not auto-submit it. */
async function signIn(page: Page, phone: string, path = '/signin') {
  await page.goto(path);
  await page.locator(`[data-dev-test-users] [data-phone="${phone}"]`).click();
  await page.waitForURL(/\/interaction\//);
  const done = page.waitForURL((u) => u.port !== String(new URL(IDP).port) && !u.pathname.startsWith('/signin/callback'), { timeout: 20_000 });
  const code = page.locator('#code');
  if (await code.isVisible({ timeout: 3000 }).catch(() => false)) {
    if (!(await code.inputValue())) await code.fill('000000');
    const verify = page.locator('form[action$="/verify"] button[type=submit]').first();
    if (await verify.isVisible().catch(() => false)) await verify.click().catch(() => undefined);
  }
  const skip = page.locator('form[action$="/finish"] button');
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
  await done;
}
const lastUrl = (page: Page) => new URL(page.url());

test('signed out: no phone field and no product information; nothing is asked of the workspace API before sign-in (no enumeration)', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', (r) => calls.push(r.url()));
  await page.goto('/signin');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in to Kiorly');
  await expect(page.locator('input')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in with Kiorex Passport' })).toBeVisible();
  expect(calls.filter((u) => /\/idp\/|\/api\/workspaces/.test(u))).toEqual([]);
  expect(await page.locator('[data-card],[data-create]').count()).toBe(0);
});

test('one workspace goes straight to the product (Clinic) with the silent-SSO hint', async ({ page }) => {
  await signIn(page, P.ahmed);
  await page.waitForURL(/localhost:5174\//);
  const u = lastUrl(page);
  expect(u.origin).toBe('http://localhost:5174'); expect(u.pathname).toBe('/login');
  expect(u.searchParams.get('sso')).toBe('passport'); expect(u.searchParams.get('from')).toBe('kiorly-home'); expect(u.searchParams.get('edition')).toBeNull();
});

test('one workspace: Pharmacy', async ({ page }) => {
  await signIn(page, P.mostafa);
  await page.waitForURL(/localhost:5192\//);
  expect(lastUrl(page).origin).toBe('http://localhost:5192');
});

test('Nurse is an edition of Clinic: solo + agency orgs are ONE card and route into the Clinic app with edition NURSE', async ({ page }) => {
  await signIn(page, P.mona);
  await page.waitForURL(/localhost:5174\//);
  const u = lastUrl(page);
  expect(u.origin).toBe('http://localhost:5174'); expect(u.searchParams.get('edition')).toBe('NURSE');
});

test('several workspaces: picker, product accents, last used remembered, then one click into the product', async ({ page }) => {
  await signIn(page, P.multi);
  await expect(page).toHaveURL(/localhost:5194\/signin/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a workspace');
  const cards = page.locator('[data-card]');
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute('data-card', 'clinic');
  await expect(page.locator('[data-card=lab]')).toHaveCSS('border-top-color', 'rgb(124, 58, 237)');
  await expect(page.locator('[data-card=clinic]')).toHaveCSS('border-top-color', 'rgb(13, 148, 136)');
  await expect(page.locator('[data-card=pharmacy]')).toHaveCSS('border-top-color', 'rgb(22, 163, 74)');
  await expect(page.locator('[data-card=lab] img')).toHaveAttribute('src', /lab-lockup/);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  await page.locator('[data-card=lab]').click();
  await page.waitForURL(/localhost:5193\//);
  expect(lastUrl(page).searchParams.get('sso')).toBe('passport');
  await page.goto('/signin'); // still signed in to Home: lab is now first with the badge
  await expect(page.locator('[data-card]').first()).toHaveAttribute('data-card', 'lab');
  await expect(page.locator('[data-card=lab]')).toContainText('Last used');
});

test('deep link bypasses the picker; a deep link into a product you are not in explains it', async ({ page }) => {
  await signIn(page, P.multi, '/signin?to=pharmacy');
  await page.waitForURL(/localhost:5192\//);
  expect(lastUrl(page).origin).toBe('http://localhost:5192');
  await page.goto('/signin?switch=1');
  await expect(page.locator('[data-card]')).toHaveCount(3); // "Switch workspace" always shows the picker
  await page.goto('/signin/lab');
  await page.waitForURL(/localhost:5193\//);
});

test('deep link to a product without a workspace', async ({ page }) => {
  await signIn(page, P.ahmed, '/signin?to=lab');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('No Kiorly Lab workspace');
  await expect(page.locator('[data-create]')).toHaveCount(1);
  await expect(page.locator('[data-create=lab]')).toHaveAttribute('href', 'http://localhost:5193/onboarding');
  await page.getByRole('button', { name: 'Choose another workspace' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a workspace'); // switch=1 shows the one workspace
  await expect(page.locator('[data-card]')).toHaveCount(1);
});

test('no workspace: Create or join for Clinic, Nurse, Pharmacy and Lab, linking to each existing sign-up', async ({ page }) => {
  await signIn(page, P.none);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You do not have a workspace yet');
  const hrefs = await page.locator('[data-create]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-create'), e.getAttribute('href')]));
  expect(hrefs).toEqual([['clinic', 'http://localhost:5174/signup'], ['nurse', 'http://localhost:5174/signup?edition=nurse'], ['pharmacy', 'http://localhost:5192/signup'], ['lab', 'http://localhost:5193/onboarding']]);
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});

test('sign-out ends the Passport session (id_token_hint) and returns to Home signed out', async ({ page }) => {
  await signIn(page, P.multi);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/localhost:5194\/signin(\?.*)?$/);
  await expect(page.getByRole('button', { name: 'Sign in with Kiorex Passport' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in with Kiorex Passport' }).click();
  await page.waitForURL(/\/interaction\//); // the Passport SSO session is gone: the IdP asks for the phone again instead of silently signing in
  await expect(page.locator('#phone')).toBeVisible();
});

test('Arabic is RTL and dark theme applies', async ({ page }) => {
  await page.goto('/signin');
  await page.getByRole('button', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('تسجيل الدخول إلى كيورلي');
  await page.getByLabel('المظهر').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
});
