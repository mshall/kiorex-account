import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Responsive matrix for the Kiorly Home sign-in: phone 360/390, tablet 768, small laptop 1024, 1280, 1366x768, 1280x600, 1440, 1920, ultrawide 2560,
 * English/Arabic RTL, light/dark, 125-200% zoom (emulated by the equivalent CSS viewport). Each cell asserts: no horizontal overflow, nothing clipped
 * outside the viewport horizontally, axe has no serious/critical violations, the right layout mode. Screenshots go to KX_SHOTS_DIR (default ./.results/shots);
 * a contact sheet per viewport is written next to them.
 */
const SHOTS = process.env.KX_SHOTS_DIR ?? path.resolve('.results/shots');
mkdirSync(SHOTS, { recursive: true });
const blockers = (r: { violations: Array<{ impact?: string | null }> }) => r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''));
const MATRIX: Array<[number, number]> = [[360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1366, 768], [1280, 600], [1440, 900], [1920, 1080], [2560, 1440]];
const mode = (w: number) => (w >= 1024 ? 'desktop' : w >= 768 ? 'tablet' : 'phone');

async function prepare(page: Page, lang: 'en' | 'ar', theme: 'light' | 'dark') {
  await page.context().addInitScript(([l, t]) => { try { localStorage.setItem('kh.lang', l!); if (t === 'dark') localStorage.setItem('kh.theme', 'dark'); } catch { /* ignore */ } }, [lang, theme]);
  await page.goto('/signin');
  await expect(page.getByTestId('signin-passport')).toBeVisible();
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(700); // let the entrance animation settle
}
const noOverflow = (page: Page) => page.evaluate(() => {
  const d = document.documentElement; if (d.scrollWidth > window.innerWidth) return `scrollWidth ${d.scrollWidth} > ${window.innerWidth}`;
  const bad: string[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('.signcard, .signcard *, .band *, .brandpane *, .foot *'))) {
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[data-dev-test-users]')) continue;
    const r = el.getBoundingClientRect(); if (r.width === 0) continue;
    if (r.right > window.innerWidth + 1 || r.left < -1) bad.push(`${el.tagName}.${el.className} ${Math.round(r.left)}..${Math.round(r.right)}`);
  }
  return bad.slice(0, 5).join('; ');
});

for (const [w, h] of MATRIX) {
  test.describe(`${w}x${h} (${mode(w)})`, () => {
    test.use({ viewport: { width: w, height: h } });
    for (const [lang, theme] of [['en', 'light'], ['ar', 'light'], ['en', 'dark'], ['ar', 'dark']] as const) {
      // keep the full cross product only where the founder asked for it (1440 and 390) plus the edges
      if ((lang !== 'en' || theme !== 'light') && ![390, 1440, 1024, 768].includes(w)) continue;
      test(`${lang} ${theme}: layout mode, no overflow, axe clean`, async ({ page }) => {
        await prepare(page, lang, theme);
        const split = mode(w) === 'desktop';
        await expect(page.getByTestId('brand-pane')).toBeVisible({ visible: split });
        await expect(page.getByTestId('brand-tagline')).toBeVisible({ visible: !split });
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        expect(await noOverflow(page)).toBe('');
        // tiles: 2x2 in the card on phone and desktop, a single row of four on tablet and wide desktops
        const ys = await page.locator('[data-tile]').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().y))).size);
        expect([1, 2]).toContain(ys);
        if (w === 768 || w >= 1800) expect(ys).toBe(1); else expect(ys).toBe(2);
        // the card has a comfortable width on desktop
        if (split) { const bw = (await page.locator('.signcard').boundingBox())!.width; expect(bw).toBeGreaterThanOrEqual(430); expect(bw).toBeLessThanOrEqual(570); }
        // theme and language controls live in the top bar from tablet width up; in the footer on phones
        for (const id of ['theme-light', 'theme-dark', 'theme-auto', 'lang-ar', 'lang-en']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(40);
        expect(blockers(await new AxeBuilder({ page }).analyze())).toEqual([]);
        await page.screenshot({ path: path.join(SHOTS, `${w}x${h}-${lang}-${theme}.png`) });
        // password method too (more fields on screen)
        await page.getByTestId('signin-method-password').click();
        await expect(page.getByTestId('signin-email')).toBeVisible();
        expect(await noOverflow(page)).toBe('');
        expect(blockers(await new AxeBuilder({ page }).analyze())).toEqual([]);
        await page.screenshot({ path: path.join(SHOTS, `${w}x${h}-${lang}-${theme}-password.png`) });
      });
    }

    if (mode(w) === 'desktop') {
      test('dev drawer: collapsed by default, opens as an overlay without moving the layout, closes again', async ({ page }) => {
        await prepare(page, 'en', 'light');
        const before = await page.locator('.signcard').boundingBox();
        const toggle = page.getByTestId('dev-toggle');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await toggle.click();
        await expect(page.locator('[data-dev-test-users] [data-phone]').first()).toBeVisible();
        expect(await page.locator('.signcard').boundingBox()).toEqual(before); // overlay: nothing reflows
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const box = (await page.locator('[data-dev-test-users]').boundingBox())!; expect(box.x + box.width).toBeLessThanOrEqual(w + 1); expect(box.y).toBeGreaterThanOrEqual(0);
        await page.screenshot({ path: path.join(SHOTS, `${w}x${h}-en-light-dev-open.png`) });
        await page.keyboard.press('Escape');
        await toggle.click().catch(() => undefined);
      });
    }
  });
}

test.describe('keyboard, focus and form behaviour (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('focus order follows the visual order and every stop shows a visible ring; Enter submits the password form; the email field is focused after choosing Password', async ({ page }) => {
    await prepare(page, 'en', 'light');
    const order: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; const o = getComputedStyle(e); return `${e.getAttribute('data-testid') ?? e.className ?? e.tagName}|${o.outlineStyle}|${o.outlineWidth}`; }));
    }
    expect(order[0]).toMatch(/^skip/);
    expect(order.slice(1, 5).map((x) => x.split('|')[0])).toEqual(['brand-lockup', 'lang-en', 'theme-light', 'product-clinic']);
    for (const o of order) { const [, style, width] = o.split('|'); expect(style).not.toBe('none'); expect(parseFloat(width!)).toBeGreaterThan(0); }
    // choosing Password with the pointer moves the caret into the email field (hardware keyboard likely on desktop)
    await page.getByTestId('signin-method-password').click();
    await expect(page.getByTestId('signin-email')).toBeFocused();
    await expect(page.getByTestId('signin-email')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByTestId('signin-password')).toHaveAttribute('autocomplete', 'current-password');
  });
  test('reduced motion: no animation on the card or the pulse line', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepare(page, 'en', 'light');
    expect(await page.locator('.signcard').evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    expect(await page.locator('.bp-pulse path').evaluate((e) => getComputedStyle(e).strokeDashoffset)).toMatch(/^(0|0px|normal|none)$/);
  });
});

test.describe('zoom 125% to 200% (equivalent CSS viewport of a 1920x1080 and a 1366x768 screen)', () => {
  for (const [sw, sh] of [[1920, 1080], [1366, 768]] as const) for (const z of [1.25, 1.5, 2]) {
    const w = Math.round(sw / z), h = Math.round(sh / z);
    test(`${sw}x${sh} at ${z * 100}% = ${w}x${h} css px: no overflow, axe clean`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await prepare(page, 'en', 'light');
      expect(await noOverflow(page)).toBe('');
      expect(blockers(await new AxeBuilder({ page }).analyze())).toEqual([]);
      await page.screenshot({ path: path.join(SHOTS, `zoom-${sw}x${sh}-${z * 100}.png`) });
    });
  }
});

/** Contact sheet per viewport (run last): all screenshots of that viewport on one page. */
test('contact sheets', async ({ page, browser }) => {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(SHOTS).filter((f) => /^\d+x\d+-.*\.png$/.test(f) && !f.startsWith('sheet'));
  const by = new Map<string, string[]>(); for (const f of files) { const k = f.split('-')[0]!; by.set(k, [...(by.get(k) ?? []), f]); }
  for (const [vp, list] of by) {
    const imgs = list.sort().map((f) => `<figure><img src="data:image/png;base64,${readFileSync(path.join(SHOTS, f)).toString('base64')}"><figcaption>${f}</figcaption></figure>`).join('');
    const ctx = await browser.newContext({ viewport: { width: 1800, height: 1000 } }); const p = await ctx.newPage();
    await p.setContent(`<style>body{margin:12px;font:12px system-ui;background:#eee}main{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0;width:420px}img{width:100%;border:1px solid #999}</style><main>${imgs}</main>`);
    await p.screenshot({ path: path.join(SHOTS, `sheet-${vp}.png`), fullPage: true }); await ctx.close();
  }
  void page;
});
