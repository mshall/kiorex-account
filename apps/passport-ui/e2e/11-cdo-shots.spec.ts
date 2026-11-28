import { test } from '@playwright/test';
import path from 'node:path';
import { randomPhone, signIn } from './helpers';

// Review screenshots of the self-service site (set CDO_SHOTS=<dir> to run; skipped otherwise).
const OUT = process.env.CDO_SHOTS;
test.skip(!OUT, 'CDO_SHOTS not set');

for (const [lang, scheme] of [['en', 'light'], ['ar', 'dark']] as const) {
  test(`shots ${lang}/${scheme}`, async ({ browser }) => {
    for (const [w, h, tag] of [[1440, 900, 'd'], [390, 844, 'm']] as const) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: w, height: h }, locale: lang === 'ar' ? 'ar-EG' : 'en-GB' });
      await ctx.addInitScript(([l, th]) => { try { localStorage.setItem('kx-lang', l!); localStorage.setItem('kx-theme', th!); } catch { /* */ } }, [lang, scheme]);
      const page = await ctx.newPage();
      await page.goto('/account'); await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT!, `signedout-${tag}-${lang}-${scheme}.png`) });
      await signIn(page, randomPhone(), { name: lang === 'ar' ? 'منى' : 'Mona' });
      for (const [p, n] of [['/account', 'home'], ['/account/security', 'security'], ['/account/apps', 'apps'], ['/account/nope', '404']] as const) {
        await page.goto(p); await page.waitForLoadState('networkidle'); await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT!, `${n}-${tag}-${lang}-${scheme}.png`) });
      }
      await ctx.close();
    }
  });
}
