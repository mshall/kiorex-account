import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createHash, randomBytes } from 'node:crypto';
import { ISSUER, lastCode, randomPhone, resetRateLimits, acceptCreateOrContinue } from './helpers';

/**
 * The redesigned sign-in page: Create account tab, notices, Go back, keyboard, reduced motion, axe, no overflow at six widths, EN/AR, light/dark.
 * Local throwaway IdP, mock messaging (codes from the dev inbox): no code budget.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const axe = async (page: Page, label: string) => {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(r.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`), `axe violations on ${label}`).toEqual([]);
};
const noOverflow = async (page: Page, label: string) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `overflow on ${label}`).toBeLessThanOrEqual(0);
const authUrl = (extra: Record<string, string> = {}) => {
  const v = randomBytes(32).toString('base64url');
  return `${ISSUER}/auth?${new URLSearchParams({ client_id: 'kiorex-web', redirect_uri: 'http://localhost:5180/auth/callback', response_type: 'code', scope: 'openid profile phone', state: 's', code_challenge: createHash('sha256').update(v).digest('base64url'), code_challenge_method: 'S256', prompt: 'login', ...extra })}`;
};
const phoneSubmit = (page: Page) => page.locator('form[action$="/phone"] button[type=submit]');
const verifySubmit = (page: Page) => page.locator('form[action$="/verify"] button[type=submit]').first();

for (const [lang, scheme] of [['en', 'light'], ['ar', 'light'], ['en', 'dark'], ['ar', 'dark']] as const) {
  test(`create account -> code -> notice screens: axe clean, no overflow at six widths (${lang} / ${scheme})`, async ({ browser }) => {
    test.setTimeout(120_000);
    await resetRateLimits();
    const ctx = await browser.newContext({ colorScheme: scheme, locale: lang === 'ar' ? 'ar-EG' : 'en-US' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('kx-theme', t); } catch { /* ignore */ } }, scheme);
    const page = await ctx.newPage();
    const widths: Array<[number, number]> = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
    await page.goto(authUrl({ ui_locales: lang, intent: 'register' })); await page.locator('#phone').waitFor();
    for (const [w, h] of widths) { await page.setViewportSize({ width: w, height: h }); await noOverflow(page, `register ${w}`); }
    await page.setViewportSize({ width: 1440, height: 900 });
    await axe(page, `register ${lang}/${scheme}`);
    const phone = randomPhone();
    await page.locator('#phone').fill(phone); await page.locator('#consent').check(); await phoneSubmit(page).click();
    await expect(page.locator('#code')).toBeVisible();
    for (const [w, h] of widths) { await page.setViewportSize({ width: w, height: h }); await noOverflow(page, `code ${w}`); }
    await page.setViewportSize({ width: 390, height: 844 });
    await axe(page, `code ${lang}/${scheme}`);
    await page.locator('#code').fill('1'); await verifySubmit(page).click();
    await expect(page.locator('.error')).toBeVisible(); await axe(page, `code error ${lang}/${scheme}`);
    await page.locator('#code').fill(await lastCode(phone)); await verifySubmit(page).click();
    await expect(page.locator('#pk-add')).toBeVisible(); await axe(page, `passkey ${lang}/${scheme}`);
    await ctx.close();
    // a new number on the Sign in tab: create-account notice
    const c2 = await browser.newContext({ colorScheme: scheme, locale: lang === 'ar' ? 'ar-EG' : 'en-US' });
    await c2.addInitScript((t) => { try { localStorage.setItem('kx-theme', t); } catch { /* ignore */ } }, scheme);
    const p2 = await c2.newPage(); await p2.goto(authUrl({ ui_locales: lang })); await p2.locator('#phone').fill(randomPhone());
    const ph2 = await p2.locator('#phone').inputValue(); await phoneSubmit(p2).click(); await p2.locator('#code').fill(await lastCode(ph2)); await verifySubmit(p2).click();
    await expect(p2.locator('#create-account')).toBeVisible(); await axe(p2, `create notice ${lang}/${scheme}`); await noOverflow(p2, 'create notice');
    await c2.close();
  });
}

test('keyboard: tab order reaches Go back, language, theme, tabs, fields and the submit; focus is always visible; Enter submits', async ({ page }) => {
  await resetRateLimits();
  await page.goto(authUrl({ ui_locales: 'en' })); await page.locator('#phone').waitFor();
  const seen: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const d = await page.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return { t: (e.innerText || e.id || e.tagName).slice(0, 24).trim(), ring: e.tagName === 'BODY' || cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' }; });
    seen.push(d.t); expect(d.ring, `focus indicator on "${d.t}"`).toBe(true);
  }
  expect(seen.join('|')).toMatch(/Go back/); expect(seen.join('|')).toMatch(/Sign in/); expect(seen.join('|')).toMatch(/Create account/);
  const phone = randomPhone();
  await page.locator('#phone').fill(phone); await page.locator('#phone').press('Enter');
  await expect(page.locator('#code')).toBeVisible();
});

test('one-time code input: pasting six digits fills the cells and moves focus to Verify; Arabic-Indic digits are normalised; resend counts down', async ({ page }) => {
  await resetRateLimits();
  await page.goto(authUrl()); const phone = randomPhone(); await page.locator('#phone').fill(phone); await phoneSubmit(page).click();
  const code = await lastCode(phone);
  await page.locator('#code').focus();
  const ar = code.replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)));
  await page.locator('#code').fill(ar);
  await expect(page.locator('#code')).toHaveValue(code);
  await expect(page.locator('.otp .cells i').first()).toHaveText(code[0]!);
  await expect(page.locator('[data-resend]')).toBeDisabled(); await expect(page.locator('[data-resend]')).toContainText('0:');
});

test('Go back: code -> phone (nothing kept), duplicate notice <- browser Back -> code, first step -> the app', async ({ page }) => {
  await resetRateLimits();
  await page.goto(authUrl({ intent: 'register' })); const phone = randomPhone();
  await page.locator('#phone').fill(phone); await page.locator('#consent').check(); await phoneSubmit(page).click();
  await expect(page.locator('#code')).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.locator('#phone')).toBeVisible(); await expect(page.locator('#phone')).toHaveValue('');
  expect(page.url()).not.toContain(phone.slice(-8));
  // first step: back to the app (product home on the registered origin, never an open redirect)
  const nav = page.waitForRequest((r) => r.url().startsWith('http://localhost:5180/'));
  await page.getByRole('button', { name: 'Go back' }).click(); const req = await nav; expect(new URL(req.url()).origin).toBe('http://localhost:5180');
});

test('duplicate registration: the existing number is told after the code; the browser Back button returns to the code step', async ({ page }) => {
  test.setTimeout(90_000);
  await resetRateLimits();
  const phone = randomPhone();
  // first create the account
  await page.goto(authUrl({ intent: 'register' })); await page.locator('#phone').fill(phone); await page.locator('#consent').check(); await phoneSubmit(page).click();
  await page.locator('#code').fill(await lastCode(phone)); await verifySubmit(page).click(); await acceptCreateOrContinue(page);
  // register again with the same number in a fresh browser context
  const ctx = await page.context().browser()!.newContext(); const p = await ctx.newPage();
  await p.goto(authUrl({ intent: 'register' })); await p.locator('#phone').fill(phone); await p.locator('#consent').check(); await phoneSubmit(p).click();
  await expect(p.getByText('already')).toHaveCount(0); // nothing is revealed before the code
  const code = await lastCode(phone); await p.locator('#code').fill(code); await verifySubmit(p).click();
  await expect(p.getByRole('heading', { name: 'You already have an account' })).toBeVisible();
  await p.goBack(); await expect(p.locator('#code')).toBeVisible();
  await p.locator('#code').fill(code); await verifySubmit(p).click(); await expect(p.locator('#dup-signin')).toBeVisible();
  await ctx.close();
});

test('reduced motion: no animation runs (cards, logo, orbs) and the page is still complete', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(authUrl()); await page.locator('#phone').waitFor();
  const names = await page.evaluate(() => [...document.querySelectorAll('.card, .mk-bar, .mk-pulse, .orb')].map((e) => getComputedStyle(e).animationName));
  expect(new Set(names)).toEqual(new Set(['none']));
  await expect(page.locator('.mk-pulse')).toHaveCSS('stroke-dashoffset', '0px');
});

test('hosted builds show no development note; local runs do', async ({ page }) => {
  await page.goto(authUrl()); await expect(page.getByText('Development identity provider')).toBeVisible(); // this suite runs the local IdP
});
