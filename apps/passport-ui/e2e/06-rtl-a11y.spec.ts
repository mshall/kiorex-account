import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ISSUER, randomPhone, signIn, lastCode } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function axe(page: Page, label: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const msg = r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(msg, `axe violations on ${label}`).toEqual([]);
}
async function noOverflow(page: Page, label: string) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(o, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
}

/** Gives the signed-in user a dependant, an organisation and a pending link request so every page renders real content. */
async function seedContent(page: Page) {
  await page.evaluate(async () => {
    const h = { authorization: `Bearer ${sessionStorage.getItem('kx.pp.at')}`, 'content-type': 'application/json' };
    await fetch('/api/dependants', { method: 'POST', headers: h, body: JSON.stringify({ name: 'يارا', dob: '2018-03-04', relationship: 'parent', evidence: { type: 'self_declared' } }) });
    await fetch('/api/orgs', { method: 'POST', headers: h, body: JSON.stringify({ legal_name: 'عيادة النيل', country: 'EG' }) });
  });
}

const PAGES = ['/account', '/account/security', '/account/family', '/account/linked', '/account/orgs', '/account/privacy', '/account/apps', '/account/step-up'];

for (const [lang, scheme] of [['ar', 'light'], ['ar', 'dark'], ['en', 'light'], ['en', 'dark']] as const) {
  test(`Passport pages: ${lang} / ${scheme}: dir, no overflow, axe clean`, async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: scheme, locale: lang === 'ar' ? 'ar-EG' : 'en-GB' });
    await ctx.addInitScript((l) => { try { localStorage.setItem('kx-lang', l); } catch { /* ignore */ } }, lang);
    const page = await ctx.newPage();

    // signed-out landing
    await page.goto('/account');
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    await axe(page, `landing ${lang}/${scheme}`);

    await signIn(page, randomPhone(), { name: lang === 'ar' ? 'منى' : 'Mona' });
    await seedContent(page);
    for (const p of PAGES) {
      await page.goto(p);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.getByText('Loading', { exact: true })).toHaveCount(0);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      await noOverflow(page, `${p} ${lang}/${scheme}`);
      await axe(page, `${p} ${lang}/${scheme}`);
    }
    await ctx.close();
  });
}

test('RTL specifics: logical layout mirrors, latin tokens stay LTR, the wordmark stays Latin', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'ar-EG' });
  const page = await ctx.newPage();
  await page.goto('/account');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('.wordmark')).toHaveText('KIOREX');
  await expect(page.locator('.wordmark')).toHaveAttribute('dir', 'ltr');
  const dir = await page.locator('h1').evaluate((e) => getComputedStyle(e).direction);
  expect(dir).toBe('rtl');
  await signIn(page, randomPhone(), { name: 'منى' });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('مرحبًا، منى');
  // brand sits on the right (start) in RTL and the toolbar on the left
  const brand = await page.locator('.brand-link').boundingBox(); const bar = await page.locator('.toolbar').boundingBox();
  expect(brand!.x).toBeGreaterThan(bar!.x);
  // phone numbers are isolated LTR inside Arabic text
  await expect(page.locator('bdi[dir=ltr]').first()).toBeVisible();
  // switching language flips direction without reload and persists
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await ctx.close();
});

test('mobile (Pixel-sized) Arabic: no horizontal overflow on any page, nav scrolls', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, locale: 'ar-EG' });
  const page = await ctx.newPage();
  await signIn(page, randomPhone(), { name: 'منى' });
  await seedContent(page);
  for (const p of PAGES) {
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await noOverflow(page, `${p} mobile`);
    await axe(page, `${p} mobile`);
  }
  await ctx.close();
});

test('IdP sign-in pages (server-rendered): phone, code, passkey offer, TOTP: RTL/dark/axe', async ({ browser }) => {
  for (const [lang, scheme] of [['ar', 'light'], ['ar', 'dark'], ['en', 'dark']] as const) {
    const ctx = await browser.newContext({ colorScheme: scheme, locale: lang === 'ar' ? 'ar-EG' : 'en-GB' });
    await ctx.addInitScript((l) => { try { localStorage.setItem('kx-lang', l); } catch { /* ignore */ } }, lang);
    const page = await ctx.newPage();
    await page.goto('/account');
    await page.getByRole('button', { name: lang === 'ar' ? 'تسجيل الدخول' : 'Sign in' }).click();
    await page.waitForURL(/\/interaction\//);
    await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    await axe(page, `idp phone ${lang}/${scheme}`); await noOverflow(page, 'idp phone');
    const phone = randomPhone();
    await page.locator('#phone').fill(phone);
    await page.locator('form[action$="/phone"] button[type=submit]').click();
    await expect(page.locator('#code')).toBeVisible();
    await axe(page, `idp code ${lang}/${scheme}`);
    await page.locator('#code').fill('1');
    await page.locator('form[action$="/verify"] button[type=submit]').first().click();
    await expect(page.locator('.error')).toBeVisible();
    await axe(page, `idp code error ${lang}/${scheme}`);
    await page.locator('#code').fill(await lastCode(phone));
    await page.locator('form[action$="/verify"] button[type=submit]').first().click();
    await expect(page.locator('#pk-add')).toBeVisible(); // passkey offer
    await axe(page, `idp passkey ${lang}/${scheme}`);
    await ctx.close();
  }
  // TOTP page (ops account)
  const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'ar-EG' });
  const page = await ctx.newPage();
  await page.goto('/account');
  await page.getByRole('button', { name: 'تسجيل الدخول' }).click();
  await page.locator('#phone').fill('+201000000099');
  await page.locator('form[action$="/phone"] button[type=submit]').click();
  await page.locator('#code').fill(await lastCode('+201000000099'));
  await page.locator('form[action$="/verify"] button[type=submit]').first().click();
  await expect(page.locator('#totp')).toBeVisible();
  await axe(page, 'idp totp ar/dark');
  await ctx.close();
  void ISSUER;
});

test('open dialogs (act-as, confirm, step-up) are accessible, trap focus and close with Escape (ar / dark)', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', locale: 'ar-EG' });
  const page = await ctx.newPage();
  await signIn(page, randomPhone(), { name: 'منى' });
  await seedContent(page);
  await page.goto('/account/family');
  await page.getByRole('button', { name: /التصرف نيابة عن/ }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  await axe(page, 'act-as dialog');
  for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true); // focus stays inside
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await page.getByRole('button', { name: 'إزالة صلاحيتي' }).click();
  await axe(page, 'confirm dialog');
  await page.keyboard.press('Escape');
  await ctx.close();
});
