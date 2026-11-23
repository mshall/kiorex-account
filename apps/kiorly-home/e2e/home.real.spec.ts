import { test, expect, type Page } from '@playwright/test';

/**
 * Kiorly Home x the REAL Clinic / Pharmacy / Lab webs and APIs and the real dev Passport (nothing stubbed).
 * Personas (OTP 000000) come from the demo seed: +201000002031 multi-workspace (Clinic + Pharmacy + Lab), +201000002001 one workspace
 * (Clinic), +201000002032 none. Each product web finishes its OWN Passport code flow after Home's `?sso=passport` redirect, so the only OTP
 * of a test is the one typed at Home; the "no second OTP" assertions count Passport phone/verify submissions after Home.
 */
const IDP = 'http://localhost:4400';
const P = { multi: '+201000002031', one: '+201000002001', none: '+201000002032' };
const ORIGIN = { clinic: 'http://localhost:5174', pharmacy: 'http://localhost:5192', lab: 'http://localhost:5193' } as const;

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { if (!localStorage.getItem('kh.lang')) localStorage.setItem('kh.lang', 'en'); } catch { /* ignore */ } });
  await fetch(`${IDP}/dev/reset-rate-limits`, { method: 'POST' }).catch(() => undefined);
});

/** Passport prompts the person saw (phone / code submissions at the IdP), so a test can prove no OTP was asked twice. */
function trackPrompts(page: Page) {
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && /\/interaction\/[^/]+\/(phone|verify)$/.test(new URL(r.url()).pathname)) posts.push(new URL(r.url()).pathname.split('/').pop()!); });
  return posts;
}

async function signInAtHome(page: Page, phone: string, path = '/signin') {
  await page.goto(path);
  await page.locator(`[data-dev-test-users] [data-phone="${phone}"]`).click();
  await page.waitForURL(/\/interaction\//);
  const code = page.locator('#code');
  if (await code.isVisible({ timeout: 3000 }).catch(() => false)) {
    if (!(await code.inputValue())) await code.fill('000000');
    const verify = page.locator('form[action$="/verify"] button[type=submit]').first();
    if (await verify.isVisible().catch(() => false)) await verify.click().catch(() => undefined);
  }
  const skip = page.locator('form[action$="/finish"] button');
  if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
  await page.waitForURL((u) => !u.href.startsWith(IDP), { timeout: 30_000 });
}

/** The product opened signed in: past its login page, header with the "Switch workspace" link. */
async function expectSignedInProduct(page: Page, origin: string) {
  await expect(page.getByTestId('switch-workspace')).toBeVisible({ timeout: 45_000 });
  expect(new URL(page.url()).origin).toBe(origin);
  expect(new URL(page.url()).pathname).not.toMatch(/^\/(login|auth\/)/);
}

test('several workspaces: picker -> Clinic, Pharmacy and Lab each open signed in with no second OTP, and "Switch workspace" returns to the picker', async ({ page }) => {
  const prompts = trackPrompts(page);
  await signInAtHome(page, P.multi);
  await expect(page).toHaveURL(/localhost:5194\/signin/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Choose a workspace');
  await expect(page.locator('[data-card]')).toHaveCount(3);
  const afterHome = prompts.length; // phone + verify typed at Home

  for (const card of ['clinic', 'pharmacy', 'lab'] as const) {
    await page.locator(`[data-card=${card}]`).click();
    await expectSignedInProduct(page, ORIGIN[card]);
    await page.getByTestId('switch-workspace').click();
    await page.waitForURL(/localhost:5194\/signin/);
    await expect(page.locator('[data-card]')).toHaveCount(3); // switch=1 always shows the picker
  }
  expect(prompts.length).toBe(afterHome); // not one more phone/verify submission at Passport
});

test('one workspace: the persona auto-routes into the real Clinic web, signed in, no picker and no second OTP', async ({ page }) => {
  const prompts = trackPrompts(page);
  await signInAtHome(page, P.one);
  await expectSignedInProduct(page, ORIGIN.clinic);
  expect(prompts.length).toBe(2);
  // the link in the header goes back to the Home picker
  await page.getByTestId('switch-workspace').click();
  await page.waitForURL(/localhost:5194\/signin\?switch=1/);
  await expect(page.locator('[data-card]')).toHaveCount(1);
});

test('no workspace: Create or join, nothing is opened', async ({ page }) => {
  await signInAtHome(page, P.none);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('You do not have a workspace yet');
  await expect(page.locator('[data-create]')).toHaveCount(4);
});

test('a product login opened with ?sso=passport starts Passport by itself; without it the login form stays put', async ({ page }) => {
  for (const [name, path] of [['clinic', '/login'], ['pharmacy', '/login'], ['lab', '/login']] as const) {
    await page.goto(`${ORIGIN[name]}${path}`); // no sso hint: stays on the product login page
    await expect(page.locator('input, button').first()).toBeVisible();
    expect(page.url()).not.toContain(':4400');
    await page.goto(`${ORIGIN[name]}${path}?sso=passport&from=kiorly-home`);
    await page.waitForURL(/localhost:4400\//, { timeout: 30_000 }); // straight to Passport, no click
  }
});

test('sign-out from Home ends the Passport session shared with the products', async ({ page }) => {
  await signInAtHome(page, P.multi);
  await page.locator('[data-card=pharmacy]').click();
  await expectSignedInProduct(page, ORIGIN.pharmacy);
  await page.getByTestId('switch-workspace').click();
  await page.waitForURL(/localhost:5194\/signin/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/localhost:5194\/signin(\?.*)?$/);
  await page.getByRole('button', { name: 'Sign in with Kiorex Passport' }).click();
  await page.waitForURL(/\/interaction\//);
  await expect(page.locator('#phone')).toBeVisible(); // asked for the phone again: the SSO session is gone
});
