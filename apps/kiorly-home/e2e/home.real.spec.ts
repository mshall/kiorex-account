import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

/**
 * Kiorly Home x the REAL Clinic / Pharmacy / Lab webs and APIs and the real dev Passport (nothing stubbed), both sign-in methods for all
 * four tiles with the demo logins (TEST_DATA.md). Needs the seeded stack: `e2e/scripts/up.sh`, `scripts/seed-all.sh`, the three product webs
 * (:5174 :5192 :5193) and Home (:5194). Passport logins are typed by hand (phone, then the dev code 000000).
 *  - Password: Home posts to the product API handoff, the product web redeems the one-time code and opens signed in. Home never holds a token.
 *  - Passport: PKCE at Home, then the product's own silent code flow: the only OTP of a test is the one typed at Passport.
 */
const IDP = 'http://localhost:4400';
// Clinic defaults to :5174 / :3010. When another checkout owns them (it happens on this Mac: a main-branch Clinic API without the handoff), run THIS
// workspace's kiorex-branch Clinic on a free pair and say so: KX_CLINIC_WEB=http://localhost:5184 KX_CLINIC_API=http://localhost:3011 (Passport client kiorly-clinic registers :5184 as a dev fallback).
const CLINIC_WEB = process.env.KX_CLINIC_WEB ?? 'http://localhost:5174'; const CLINIC_API = process.env.KX_CLINIC_API ?? 'http://localhost:3010';
const WEB = { clinic: CLINIC_WEB, pharmacy: 'http://localhost:5192', lab: 'http://localhost:5193' } as const;
const API = { clinic: CLINIC_API, pharmacy: 'http://localhost:3100', lab: 'http://localhost:3200' } as const;
const HOME = 'http://localhost:5194';
interface Case { tile: 'clinic' | 'nurse' | 'pharmacy' | 'lab'; product: keyof typeof WEB; email: string; org?: string; phone: string }
const CASES: Case[] = [
  { tile: 'clinic', product: 'clinic', email: 'owner.na@demo.kiorex.test', phone: '+201000002001' },
  { tile: 'nurse', product: 'clinic', email: 'mona@nurse-demo.kiorly.test', phone: '+201000003001' },
  { tile: 'pharmacy', product: 'pharmacy', email: 'owner@demo.kiorly.local', phone: '+201000002004' },
  { tile: 'lab', product: 'lab', email: 'tech@demo-lab.test', org: 'demo-lab', phone: '+201000002005' },
];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { if (!localStorage.getItem('kh.lang')) localStorage.setItem('kh.lang', 'en'); } catch { /* ignore */ } });
  if (CLINIC_WEB !== 'http://localhost:5174' || CLINIC_API !== 'http://localhost:3010') {
    await context.addInitScript(([web, api]) => { if (location.origin === 'http://localhost:5194') { try { localStorage.setItem('kh.dev.env', JSON.stringify({ clinic: { web, api } })); } catch { /* ignore */ } } }, [CLINIC_WEB, CLINIC_API]);
  }
  await fetch(`${IDP}/dev/reset-rate-limits`, { method: 'POST' }).catch(() => undefined);
});

/** The product opened signed in: past its login page, header with the "Switch workspace" link. */
async function expectSignedInProduct(page: Page, origin: string) {
  await expect(page.getByTestId('switch-workspace')).toBeVisible({ timeout: 45_000 });
  expect(new URL(page.url()).origin).toBe(origin);
  expect(new URL(page.url()).pathname).not.toMatch(/^\/(login|auth\/)/);
  expect(page.url()).not.toContain('handoff=');
}
function trackPrompts(page: Page) {
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/interaction\/[^/]+\/(phone|verify)$/.test(new URL(r.url()).pathname)) posts.push(new URL(r.url()).pathname.split('/').pop()!); });
  return posts;
}
/** Type the phone and the dev code at Passport like a user (the Home page has no quick-pick panel). */
async function typePassport(page: Page, phone: string) {
  await page.getByTestId('signin-passport').click();
  await page.waitForURL(/\/interaction\//);
  await page.locator('#phone').fill(phone);
  await page.locator('form[action$="/phone"] button[type=submit]').first().click();
  const code = page.locator('#code');
  await code.waitFor({ timeout: 10_000 });
  await code.fill('000000');
  await page.locator('form[action$="/verify"] button[type=submit]').first().click();
  const skip = page.locator('form[action$="/finish"] button');
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
}
const sh = (sql: string) => execFileSync('/Users/postgres/bin/psql', ['-h', '127.0.0.1', '-p', '5433', '-U', 'postgres', '-d', 'kiorly', '-tAc', sql], { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim();

for (const c of CASES) {
  test(`${c.tile}: PASSWORD handoff opens ${c.product} signed in, single-use code stripped from the URL, replay is 401, Home holds no token`, async ({ page }) => {
    const exchange: string[] = [];
    page.on('request', (r) => { if (r.url().endsWith('/auth/handoff/exchange')) exchange.push(JSON.parse(r.postData() ?? '{}').code); });
    await page.goto('/signin');
    await page.getByTestId(`product-${c.tile}`).click();
    await page.getByTestId('signin-method-password').click();
    await page.getByTestId('signin-email').fill(c.email);
    if (c.org) await page.getByTestId('signin-org').fill(c.org); else await page.getByTestId('signin-password').fill('Demo@12345');
    await expect(page.getByTestId('signin-email')).toHaveValue(c.email);
    if (c.org) await expect(page.getByTestId('signin-org')).toHaveValue(c.org); else await expect(page.getByTestId('signin-password')).not.toHaveValue('');
    await page.getByTestId('signin-submit').click();
    await expectSignedInProduct(page, WEB[c.product]);
    expect(exchange).toHaveLength(1);
    // replay of the already redeemed code: 401 (never logged, never reusable)
    const replay = await fetch(`${API[c.product]}/api/v1/auth/handoff/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: exchange[0], ...(c.tile === 'nurse' ? { edition: 'NURSE' } : {}) }) });
    expect(replay.status).toBe(401);
    // Home never saw a session token: neither storage of the Home origin holds a JWT
    const home = await page.context().newPage(); await home.goto(`${HOME}/signin`);
    const store = await home.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(store).not.toMatch(/eyJ/); expect(store).not.toContain('Demo@12345'); expect(store).toContain(`"kh.last":"${c.tile}"`);
    await home.close();
  });

  test(`${c.tile}: PASSPORT (default method) opens ${c.product} signed in with no second OTP`, async ({ page }) => {
    const prompts = trackPrompts(page);
    await page.goto('/signin');
    await page.getByTestId(`product-${c.tile}`).click();
    await expect(page.getByTestId('signin-method-passport')).toHaveAttribute('aria-selected', 'true');
    await typePassport(page, c.phone);
    await expectSignedInProduct(page, WEB[c.product]);
    expect(prompts.length).toBeLessThanOrEqual(2); // phone + verify typed at Passport, nothing more from the product
  });
}

test('handoff API: replay, wrong product, wrong origin, expiry and bad password are all refused', async () => {
  const login = (api: string, body: object, origin = HOME) => fetch(`${api}/api/v1/auth/handoff/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  const redeem = (api: string, code: string) => fetch(`${api}/api/v1/auth/handoff/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
  const ph = { email: 'owner@demo.kiorly.local', password: 'Demo@12345' };
  const a = await (await login(API.pharmacy, ph)).json() as { code: string; expiresInSeconds: number };
  expect(a.code).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(a.expiresInSeconds).toBe(30);
  expect((await redeem(API.lab, a.code)).status).toBe(401); // another product's API: unknown there
  expect((await redeem(API.pharmacy, a.code)).status).toBe(200);
  expect((await redeem(API.pharmacy, a.code)).status).toBe(401); // replay
  expect((await login(API.pharmacy, ph, 'https://evil.example')).status).toBe(403); // only Home's origin may start a handoff
  expect((await login(API.pharmacy, { ...ph, password: 'wrong-password' })).status).toBe(401);
  expect((await login(API.clinic, { email: 'owner.na@demo.kiorex.test', password: 'wrong-password' })).status).toBe(401);
  expect((await login(API.lab, { orgSlug: 'demo-lab', email: 'nobody@demo-lab.test' })).status).toBe(401);
  const wp = await (await login(API.pharmacy, ph)).json() as { code: string };
  await new Promise((r) => setTimeout(r, 31_000)); // 30 s lifetime
  expect((await redeem(API.pharmacy, wp.code)).status).toBe(401);
});

test('second factor cannot complete in the handoff: Clinic answers FALLBACK and the product login explains it (never fails silently)', async ({ page }) => {
  const email = 'accountant.na@demo.kiorex.test';
  try {
    sh(`UPDATE "User" SET "mfaEnabled"=true WHERE email='${email}'`);
    await page.goto('/signin');
    await page.getByTestId('signin-method-password').click();
    await page.getByTestId('signin-email').fill(email); await page.getByTestId('signin-password').fill('Demo@12345');
    await page.getByTestId('signin-submit').click();
    await page.waitForURL(new RegExp(`${CLINIC_WEB.replace(/[.:/]/g, '\\$&')}/login`));
    await expect(page.getByTestId('handoff-reason')).toContainText('second factor');
    expect(page.url()).not.toContain('reason='); // the flag is consumed from the address bar
    await expect(page.getByTestId('signin-password-panel')).toBeVisible(); // the product's own form, ready for the code
  } finally { sh(`UPDATE "User" SET "mfaEnabled"=false WHERE email='${email}'`); }
});

test('exactly one workspace that is not the chosen tile: hint, then Pharmacy opens signed in', async ({ page }) => {
  await page.goto('/signin');
  await page.getByTestId('signin-passport').click(); // Clinic tile + Passport, but Mostafa only belongs to Pharmacy
  await page.waitForURL(/\/interaction\//);
  await page.locator('#phone').fill('+201000002004');
  await page.locator('form[action$="/phone"] button[type=submit]').first().click();
  await page.locator('#code').fill('000000');
  await page.locator('form[action$="/verify"] button[type=submit]').first().click();
  const skip = page.locator('form[action$="/finish"] button');
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
  await expect(page.getByTestId('workspace-hint')).toBeVisible();
  await page.getByTestId('hint-open-own').click();
  await expectSignedInProduct(page, WEB.pharmacy);
});

test('a product login opened with ?sso=passport starts Passport by itself; ?handoff= with a bad code shows the form and an error', async ({ page }) => {
  for (const name of ['clinic', 'pharmacy', 'lab'] as const) {
    await page.goto(`${WEB[name]}/login?sso=passport&from=kiorly-home`);
    await page.waitForURL(/localhost:4400\//, { timeout: 30_000 });
    await page.goto(`${WEB[name]}/login?handoff=${'A'.repeat(43)}&from=kiorly-home`);
    await expect(page.getByTestId('signin-password-panel').or(page.getByTestId('signin-passport-panel'))).toBeVisible({ timeout: 20_000 });
    expect(page.url()).not.toContain('handoff='); // stripped even when the code is bad
    expect(page.url()).not.toContain(':4400');
  }
});

test('sign-out from Home ends the Passport session shared with the products', async ({ page }) => {
  await page.goto('/signin');
  await page.getByTestId('product-pharmacy').click();
  await typePassport(page, '+201000002004');
  await expectSignedInProduct(page, WEB.pharmacy);
  await page.getByTestId('switch-workspace').click();
  await page.waitForURL(/localhost:5194\/signin/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/localhost:5194\/signin(\?.*)?$/);
  await page.getByTestId('signin-passport').click();
  await page.waitForURL(/\/interaction\//);
  await expect(page.locator('#phone')).toBeVisible(); // asked for the phone again: the SSO session is gone
});

/** Real-stack layout smoke across the viewport matrix: no horizontal overflow, product chosen + both methods usable, desktop split panel at >= 1024. */
for (const [w, h] of [[360, 740], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]] as const) {
  test(`layout ${w}x${h}: no horizontal overflow, split panel only on desktop, both methods visible`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('/signin');
    await expect(page.getByTestId('signin-passport')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId('brand-pane')).toBeVisible({ visible: w >= 1024 });
    await page.getByTestId('signin-method-password').click();
    await expect(page.getByTestId('signin-email')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
