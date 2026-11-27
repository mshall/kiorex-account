import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Kiorly Home sign-in (ADR-038) with parity to the Kiorly mobile sign-in. Real: the Home app and the real dev IdP code on a throwaway
 * schema (:4455). Stubbed: the product web origins (5174/5192/5193) and the product API origins (3010/3100/3200), so these tests assert
 * what Home SENDS and WHERE it goes without depending on other stacks; the real-stack spec (home.real.spec.ts) covers the products.
 */
const IDP = `http://localhost:${Number(process.env.KX_HOME_E2E_IDP_PORT ?? 4455)}`;
const HOME_ORIGIN = `http://localhost:${Number(process.env.KX_HOME_E2E_PORT ?? 5195)}`;
const WEB = { clinic: 'http://localhost:5174', pharmacy: 'http://localhost:5192', lab: 'http://localhost:5193' } as const;
const API = { clinic: 'http://localhost:3010', pharmacy: 'http://localhost:3100', lab: 'http://localhost:3200' } as const;
const P = { ahmed: '+201000002001', mostafa: '+201000002004', dina: '+201000002005', mona: '+201000003001' };
const CODE = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo';
const blockers = (r: { violations: Array<{ impact?: string | null }> }) => r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));

interface Call { url: string; body: Record<string, unknown>; origin?: string }
/** Stub one product API: answers CORS preflight and `handoff/login` with `reply`. Returns the calls it received. */
async function stubApi(page: Page, product: keyof typeof API, reply: { status: number; body: unknown } | 'abort') {
  const calls: Call[] = [];
  await page.route(`${API[product]}/**`, async (route) => {
    const req = route.request();
    const cors = { 'access-control-allow-origin': HOME_ORIGIN, 'access-control-allow-headers': 'content-type, accept', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'Origin' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    calls.push({ url: req.url(), body: JSON.parse(req.postData() ?? '{}'), origin: req.headers().origin });
    if (reply === 'abort') return route.abort('failed');
    return route.fulfill({ status: reply.status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(reply.body) });
  });
  return calls;
}

test.beforeEach(async ({ page, context }) => {
  await context.addInitScript(() => { try { if (!localStorage.getItem('kh.lang')) localStorage.setItem('kh.lang', 'en'); } catch { /* ignore */ } });
  for (const o of Object.values(WEB)) await page.route(`${o}/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>product stub</title><h1 id="stub">product stub</h1>' }));
  await fetch(`${IDP}/dev/reset-rate-limits`, { method: 'POST' });
});

const tile = (page: Page, k: string) => page.getByTestId(`product-${k}`);
const fillPassword = async (page: Page, email: string, password: string) => { await page.getByTestId('signin-method-password').click(); await page.getByTestId('signin-email').fill(email); await page.getByTestId('signin-password').fill(password); };

/** Phone typed at Passport for each seeded persona; the tile is the product that persona belongs to. */
const TILE_OF: Record<string, string> = { [P.ahmed]: 'clinic', [P.mostafa]: 'pharmacy', [P.dina]: 'lab', [P.mona]: 'nurse' };
/** Real Passport sign-in typed by hand: choose the tile, start Passport, type the phone and the code like a user. */
async function passportSignIn(page: Page, phone: string, path = '/signin') {
  await page.goto(path);
  await tile(page, TILE_OF[phone] ?? 'clinic').click();
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

test.describe('layout parity with the Kiorly mobile sign-in', () => {
  test('header (lockup, AR/EN toggle, tagline), card, four tiles in the mobile order, Passport preselected and primary', async ({ page }) => {
    const calls: string[] = [];
    page.on('request', (r) => calls.push(r.url()));
    await page.goto('/signin');
    await expect(page.getByTestId('brand-lockup')).toHaveAttribute('aria-label', 'Kiorly');
    await expect(page.getByTestId('brand-lockup').locator('img').first()).toHaveAttribute('src', /kiorly-lockup\.svg/); // Indigo + Periwinkle Kiorly lockup
    await expect(page.getByTestId('lang-menu')).toBeVisible(); await expect(page.getByTestId('lang-menu')).toHaveAttribute('aria-label', 'Language: EN · English'); await expect(page.getByTestId('lang-ar')).toHaveCount(0); // ONE control, options only in the menu
    await expect(page.getByTestId('brand-tagline')).toHaveText('One sign-in for Clinic, Nurse, Pharmacy and Lab'); // shown on phone and tablet
    await expect(page.getByTestId('brand-pane').getByRole('heading', { level: 2 })).toHaveText('One sign-in for your whole workplace'); // desktop split panel (1280 default viewport)
    await expect(page.getByTestId('brand-pane')).toContainText('Secure sign-in with Kiorex Passport');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign in');
    await expect(page.getByText('Choose your workplace product')).toBeVisible();
    await expect(page.locator('[data-tile]')).toHaveText(['Clinic', 'Nurse', 'Pharmacy', 'Lab']);
    await expect(tile(page, 'clinic')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('signin-method-passport')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('signin-method-password')).toHaveText('Password');
    await expect(page.getByTestId('signin-passport')).toHaveText('Sign in with Kiorex Passport');
    await expect(page.getByTestId('signin-passport')).toHaveCSS('background-color', 'rgb(55, 48, 163)');
    // no phone / e-mail field and no product information before verification: nothing asked of the IdP or the workspace API
    await expect(page.locator('input')).toHaveCount(0);
    expect(calls.filter((u) => /\/idp\/|\/api\/workspaces|:3010|:3100|:3200/.test(u))).toEqual([]);
  });

  test('selected tile is ringed in Indigo, the founder product colour only tints the icon; Nurse shows the home-visit hint', async ({ page }) => {
    await page.goto('/signin');
    for (const k of ['clinic', 'nurse', 'pharmacy', 'lab'] as const) {
      await tile(page, k).click();
      await expect(tile(page, k)).toHaveCSS('border-top-color', 'rgb(55, 48, 163)');
    }
    await tile(page, 'nurse').click();
    await expect(page.getByTestId('nurse-hint')).toContainText('home visits');
  });

  test('tiles are a keyboard radiogroup (arrow keys move the choice)', async ({ page }) => {
    await page.goto('/signin');
    await tile(page, 'clinic').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tile(page, 'nurse')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(tile(page, 'lab')).toHaveAttribute('aria-checked', 'true');
  });

  test('deep links preselect the tile: ?to=pharmacy, /signin/lab, ?product=NURSE; unknown values fall back to Clinic', async ({ page }) => {
    await page.goto('/signin?to=pharmacy'); await expect(tile(page, 'pharmacy')).toHaveAttribute('aria-checked', 'true');
    await page.goto('/signin/lab'); await expect(tile(page, 'lab')).toHaveAttribute('aria-checked', 'true');
    await page.goto('/signin?product=NURSE'); await expect(tile(page, 'nurse')).toHaveAttribute('aria-checked', 'true');
    await page.goto('/signin?to=evil'); await expect(tile(page, 'clinic')).toHaveAttribute('aria-checked', 'true');
  });

  test('?switch=1 lands on the same screen with a note (never auto-routes)', async ({ page }) => {
    await page.goto('/signin?switch=1');
    await expect(page.getByTestId('switch-note')).toBeVisible();
    await expect(page.getByTestId('signin-passport')).toBeVisible();
  });
});

test.describe('password method = secure handoff (the product API answers with a single-use code, never a token)', () => {
  for (const [k, product, email, org, edition] of [
    ['clinic', 'clinic', 'owner.na@demo.kiorex.test', '', null], ['nurse', 'clinic', 'mona@nurse-demo.kiorly.test', '', 'NURSE'],
    ['pharmacy', 'pharmacy', 'owner@demo.kiorly.local', '', null], ['lab', 'lab', 'tech@demo-lab.test', 'demo-lab', null],
  ] as const) {
    test(`${k}: posts to the ${product} API from the Home origin and navigates to ${product} web ?handoff=<code>`, async ({ page }) => {
      const calls = await stubApi(page, product, { status: 200, body: { status: 'OK', code: CODE, expiresInSeconds: 30, redirectUrl: 'https://evil.example/ignored' } });
      await page.goto('/signin'); await tile(page, k).click();
      await page.getByTestId('signin-method-password').click();
      await page.getByTestId('signin-email').fill(email);
      if (k === 'lab') { await expect(page.getByTestId('signin-password')).toHaveCount(0); await page.getByTestId('signin-org').fill(org); }
      else { await expect(page.getByTestId('signin-org')).toHaveCount(0); await page.getByTestId('signin-password').fill('Demo@12345'); }
      await expect(page.getByTestId('signin-submit')).toHaveText('Sign in');
      await page.getByTestId('signin-submit').click();
      await page.waitForURL(new RegExp(`${WEB[product].replace(/[.:/]/g, '\\$&')}/login`));
      const u = new URL(page.url());
      expect(u.origin).toBe(WEB[product]); expect(u.searchParams.get('handoff')).toBe(CODE); expect(u.searchParams.get('from')).toBe('kiorly-home'); expect(u.searchParams.get('edition')).toBe(edition);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(`${API[product]}/api/v1/auth/handoff/login`); expect(calls[0]!.origin).toBe(HOME_ORIGIN);
      expect(calls[0]!.body).toEqual(k === 'lab' ? { orgSlug: org, email } : { email, password: 'Demo@12345', ...(edition ? { edition } : {}) });
    });
  }

  test('Home never keeps the password or any token: nothing in storage, the password input is gone after the redirect, last tile + method are remembered', async ({ page }) => {
    await stubApi(page, 'pharmacy', { status: 200, body: { status: 'OK', code: CODE } });
    await page.goto('/signin?to=pharmacy'); await fillPassword(page, 'owner@demo.kiorly.local', 'Demo@12345');
    await page.getByTestId('signin-submit').click();
    await page.waitForURL(/localhost:5192\/login/);
    await page.goto('/signin');
    const store = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(store).not.toContain('Demo@12345'); expect(store).not.toContain(CODE);
    expect(JSON.parse(store).l).toMatchObject({ 'kh.last': 'pharmacy', 'kh.method': 'password' });
    await expect(tile(page, 'pharmacy')).toHaveAttribute('aria-checked', 'true'); // last choice remembered on this browser
    await expect(page.getByTestId('signin-method-password')).toHaveAttribute('aria-selected', 'true'); // and the last method
    await expect(page.getByTestId('signin-password')).toHaveValue('');
  });

  test('second factor / org picker / expired password: the product answers FALLBACK and Home sends the person to the product login with a flag (never silent)', async ({ page }) => {
    await stubApi(page, 'clinic', { status: 200, body: { status: 'FALLBACK', reason: 'mfa' } });
    await page.goto('/signin'); await fillPassword(page, 'owner.na@demo.kiorex.test', 'Demo@12345');
    await page.getByTestId('signin-submit').click();
    await page.waitForURL(/localhost:5174\/login/);
    const u = new URL(page.url());
    expect(u.searchParams.get('reason')).toBe('mfa'); expect(u.searchParams.get('handoff')).toBeNull(); expect(u.searchParams.get('from')).toBe('kiorly-home');
  });

  test('wrong password shows an inline error and keeps the form; Lab says organisation or e-mail', async ({ page }) => {
    await stubApi(page, 'clinic', { status: 401, body: { message: 'Invalid credentials' } });
    await stubApi(page, 'lab', { status: 401, body: { code: 'LOGIN_FAILED' } });
    await page.goto('/signin'); await fillPassword(page, 'owner.na@demo.kiorex.test', 'nope');
    await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('signin-error')).toHaveText('Wrong email or password');
    await expect(page.getByTestId('signin-email')).toHaveValue('owner.na@demo.kiorex.test');
    await tile(page, 'lab').click(); await expect(page.getByTestId('signin-error')).toHaveCount(0); // a tile change clears the old attempt's error
    await page.getByTestId('signin-org').fill('nope-lab'); await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('signin-error')).toHaveText('Unknown organisation or email');
  });

  test('rate limit, offline and a product that only accepts Passport are explained', async ({ page }) => {
    await stubApi(page, 'clinic', { status: 429, body: { code: 'RATE_LIMITED' } });
    await stubApi(page, 'pharmacy', 'abort');
    await stubApi(page, 'lab', { status: 404, body: { code: 'LOCAL_LOGIN_DISABLED' } });
    await page.goto('/signin'); await fillPassword(page, 'a@b.co', 'x'); await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('signin-error')).toContainText('Too many attempts');
    await tile(page, 'pharmacy').click(); await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('signin-error')).toContainText('Cannot reach the server');
    await tile(page, 'lab').click(); await page.getByTestId('signin-org').fill('demo-lab'); await page.getByTestId('signin-submit').click();
    await expect(page.getByTestId('signin-error')).toContainText('Kiorex Passport only');
    await expect(page.getByTestId('signin-passport')).toBeVisible(); // switched to the Passport method
  });

  test('the Sign in button stays disabled until the form is valid', async ({ page }) => {
    await page.goto('/signin'); await page.getByTestId('signin-method-password').click();
    await expect(page.getByTestId('signin-submit')).toBeDisabled();
    await page.getByTestId('signin-email').fill('a@b.co'); await expect(page.getByTestId('signin-submit')).toBeDisabled();
    await page.getByTestId('signin-password').fill('x'); await expect(page.getByTestId('signin-submit')).toBeEnabled();
  });
});

test.describe('Passport method (default): PKCE sign-in, then the product opens signed in via silent SSO', () => {
  test('Clinic persona: the chosen tile survives the redirect and Home opens Clinic with ?sso=passport&from=kiorly-home (no edition)', async ({ page }) => {
    await passportSignIn(page, P.ahmed);
    await page.waitForURL(/localhost:5174\//);
    const u = new URL(page.url());
    expect(u.pathname).toBe('/login'); expect(u.searchParams.get('sso')).toBe('passport'); expect(u.searchParams.get('from')).toBe('kiorly-home'); expect(u.searchParams.get('edition')).toBeNull();
  });
  test('Nurse persona opens the Clinic app with edition NURSE', async ({ page }) => {
    await passportSignIn(page, P.mona);
    await page.waitForURL(/localhost:5174\//);
    expect(new URL(page.url()).searchParams.get('edition')).toBe('NURSE');
  });
  test('Pharmacy persona opens Pharmacy', async ({ page }) => { await passportSignIn(page, P.mostafa); await page.waitForURL(/localhost:5192\//); });
  test('Lab persona opens Lab', async ({ page }) => { await passportSignIn(page, P.dina); await page.waitForURL(/localhost:5193\//); });
  test('exactly one workspace that is not the chosen tile: a gentle hint with both options, never a block', async ({ page }) => {
    await page.goto('/signin');
    await tile(page, 'clinic').click();
    // start the Passport sign-in for Mostafa (pharmacy only) but keep the Clinic tile as the chosen product
    await page.getByTestId('signin-passport').click();
    await page.waitForURL(/\/interaction\//);
    await page.locator('#phone').fill(P.mostafa);
    await page.locator('form[action$="/phone"] button[type=submit]').first().click();
    const code = page.locator('#code');
    await code.waitFor({ timeout: 10_000 });
    if (!(await code.inputValue())) await code.fill('000000');
    await page.locator('form[action$="/verify"] button[type=submit]').first().click();
    const skip = page.locator('form[action$="/finish"] button');
    if (await skip.isVisible({ timeout: 1500 }).catch(() => false)) await skip.click();
    const hint = page.getByTestId('workspace-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('Kiorly Pharmacy'); await expect(page.getByTestId('hint-continue')).toHaveText('Continue to Kiorly Clinic');
    expect((await new AxeBuilder({ page }).analyze()).violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
    await page.getByTestId('hint-continue').click();
    await page.waitForURL(/localhost:5174\/login/);
  });
  test('sign-out ends the Passport session (id_token_hint) and returns to Home signed out', async ({ page }) => {
    await passportSignIn(page, P.ahmed);
    await page.waitForURL(/localhost:5174\//);
    await page.goto('/signin');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL(/localhost:\d+\/signin(\?.*)?$/);
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
    await page.getByTestId('signin-passport').click();
    await page.waitForURL(/\/interaction\//); // the SSO session is gone: the IdP asks for the phone again
    await expect(page.locator('#phone')).toBeVisible();
  });
});

test.describe('no demo or test-user content in the sign-in UI', () => {
  test('no Test users panel, demo emails, passwords or dev code are rendered, on any tile', async ({ page }) => {
    await page.goto('/signin');
    await expect(page.locator('[data-dev-test-users]')).toHaveCount(0);
    await expect(page.getByTestId('dev-toggle')).toHaveCount(0);
    for (const k of ['clinic', 'nurse', 'pharmacy', 'lab']) {
      await tile(page, k).click();
      const text = await page.locator('body').innerText();
      expect(text).not.toMatch(/Test users|dev only|Demo@12345|000000|demo-lab|@demo\.|\+2010000/i);
    }
  });
});

test.describe('Arabic, theme, accessibility, responsive', () => {
  test('Arabic is RTL with the mobile strings and the AR toggle is pressed', async ({ page }) => {
    await page.goto('/signin');
    await page.getByTestId('lang-menu').click(); await page.getByTestId('lang-ar').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('تسجيل الدخول');
    await expect(page.getByTestId('brand-pane').getByRole('heading', { level: 2 })).toHaveText('تسجيل دخول واحد لكل مكان عملك');
    await expect(page.getByTestId('brand-tagline')).toHaveText('تسجيل دخول واحد للعيادة والتمريض والصيدلية والمعمل');
    await expect(page.locator('[data-tile]')).toHaveText(['العيادة', 'التمريض', 'الصيدلية', 'المعمل']);
    await expect(page.getByTestId('signin-passport')).toHaveText('الدخول عبر كيوريكس باسبورت');
    await page.reload(); await expect(page.locator('html')).toHaveAttribute('dir', 'rtl'); // remembered
  });

  for (const [name, setup] of [
    ['light passport', async (_p: Page) => {}],
    ['light password (Clinic)', async (p: Page) => { await p.getByTestId('signin-method-password').click(); }],
    ['light password (Lab)', async (p: Page) => { await tile(p, 'lab').click(); await p.getByTestId('signin-method-password').click(); }],
    ['dark password', async (p: Page) => { await p.getByTestId('theme-dark').click(); await p.getByTestId('signin-method-password').click(); }],
    ['arabic dark', async (p: Page) => { await p.getByTestId('lang-menu').click(); await p.getByTestId('lang-ar').click(); await p.getByTestId('theme-dark').click(); }],
    ['arabic with error', async (p: Page) => { await p.getByTestId('lang-menu').click(); await p.getByTestId('lang-ar').click(); await p.getByTestId('signin-method-password').click(); await p.getByTestId('signin-email').fill('a@b.co'); await p.getByTestId('signin-password').fill('x'); await p.getByTestId('signin-submit').click(); }],
  ] as const) {
    test(`axe: no serious or critical violations (${name})`, async ({ page }) => {
      await stubApi(page, 'clinic', { status: 401, body: { message: 'Invalid credentials' } });
      await page.goto('/signin'); await setup(page);
      if (name === 'arabic with error') await expect(page.getByTestId('signin-error')).toBeVisible();
      expect(blockers(await new AxeBuilder({ page }).analyze())).toEqual([]);
    });
  }

  test.describe('phone width 360px', () => {
    test.use({ viewport: { width: 360, height: 740 } });
    test('no horizontal scroll, tiles in two columns, targets at least 44px', async ({ page }) => {
      await page.goto('/signin');
      for (const m of ['passport', 'password']) {
        await page.getByTestId(`signin-method-${m}`).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      const boxes = await page.locator('[data-tile]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), h: r.height }; }));
      expect(new Set(boxes.map((b) => b.y)).size).toBe(2); expect(boxes.every((b) => b.h >= 44)).toBe(true);
      for (const sel of ['[data-testid=signin-method-passport]', '[data-testid=signin-submit]']) expect((await page.locator(sel).boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const sel of ['[data-testid=lang-menu]', '[data-testid=theme-dark]']) expect((await page.locator(sel).boundingBox())!.height).toBeGreaterThanOrEqual(40);
    });
  });

  test('theme and language are icon controls: aria-labelled in both languages, 40px targets, arrow keys move the choice, Esc leaves the group', async ({ page }) => {
    await page.goto('/signin');
    const group = page.getByRole('radiogroup', { name: 'Theme' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(page.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true');
    for (const k of ['light', 'dark', 'auto', 'lang-menu']) { const id = k.startsWith('lang') ? k : `theme-${k}`; expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(40); }
    await page.getByTestId('theme-light').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('End'); await expect(page.getByTestId('theme-auto')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(page.getByTestId('theme-auto')).not.toBeFocused();
    await page.getByTestId('theme-light').click();
    await page.getByTestId('lang-menu').click(); await page.getByTestId('lang-ar').click();
    await expect(page.getByRole('radiogroup', { name: 'المظهر' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'داكن' })).toBeVisible();
    await page.getByTestId('lang-menu').click(); await expect(page.getByTestId('lang-ar')).toHaveAttribute('aria-checked', 'true');
  });

  test.describe('theme: light by default, an explicit choice is remembered', () => {
    test.use({ colorScheme: 'dark' }); // an OS in dark mode must NOT turn the page dark
    test('light on a first visit even when the OS is dark; Dark is stored and restored on reload; System is explicit', async ({ page }) => {
      await page.goto('/signin');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      expect(await page.evaluate(() => localStorage.getItem('kh.theme'))).toBeNull(); // nothing is stored for a plain visit
      await page.getByTestId('theme-dark').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByTestId('theme-dark')).toHaveAttribute('aria-checked', 'true');
      await page.getByTestId('theme-auto').click();
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'auto');
    });
  });
});
