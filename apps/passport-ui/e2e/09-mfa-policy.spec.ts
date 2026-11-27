import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadSeedUsers } from '../../dev-idp/src/config.js';
import { OPS, ISSUER, lastCode, nav, randomPhone, resetRateLimits, signIn, totpNow, useEnglish } from './helpers';

const OPS_B = loadSeedUsers().find((u) => u.phone === '+201000009001')!; // plain ops_admin (the maker); the super admin is the checker

/** Sign-in up to the second-factor step; returns what the person met. */
async function signInToSecondFactor(page: Page, phone: string) {
  await resetRateLimits();
  await page.goto('/account');
  await page.getByRole('button', { name: /^(Sign in|تسجيل الدخول)$/ }).click();
  await page.waitForURL(/\/interaction\//);
  await page.locator('#phone').fill(phone);
  await page.locator('form[action$="/phone"] button[type=submit]').click();
  await page.locator('#code').fill(await lastCode(phone));
  await page.locator('form[action$="/verify"] button[type=submit]').first().click();
}
const landed = (page: Page) => page.waitForURL(new RegExp(`${ISSUER.replace(/[/.]/g, '\\$&')}/account(?!/callback)`), { timeout: 20_000 });

test('ops make two-step verification mandatory for one organisation (maker-checker); the owner is walked through enrolment; switching it off makes it optional again', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctxs = [await browser.newContext(), await browser.newContext(), await browser.newContext()];
  for (const c of ctxs) await useEnglish(c);
  const [ownerCtx, makerCtx, checkerCtx] = ctxs as [typeof ctxs[0], typeof ctxs[0], typeof ctxs[0]];
  const owner = await ownerCtx.newPage(); const maker = await makerCtx.newPage(); const checker = await checkerCtx.newPage();
  const phone = randomPhone(); const orgName = `E2E Pharmacy ${phone.slice(-6)}`;

  // 1. default: optional. A new organisation owner signs in with the phone code alone and creates the organisation.
  await signIn(owner, phone, { name: 'Pharmacy Owner' });
  await nav(owner, 'Organisations').click();
  await owner.getByLabel('Legal name').fill(orgName);
  await owner.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(owner.getByText(orgName).first()).toBeVisible();
  await expect(nav(owner, 'MFA policy')).toHaveCount(0); // ops only

  // 2. the maker (ops_admin, signed in with TOTP) proposes: switch on + rule for that organisation, owner role
  await signIn(maker, OPS_B.phone, { totpSecret: OPS_B.totpSecret });
  await nav(maker, 'MFA policy').click();
  await expect(maker.getByRole('heading', { name: 'Two-step verification policy' })).toBeVisible();
  await expect(maker.getByText('Optional (switch off)').first()).toBeVisible();
  await maker.getByLabel('Make two-step verification mandatory for the rules below').check();
  await maker.getByRole('button', { name: 'Add a rule' }).click();
  await maker.getByLabel('Applies to').selectOption('org');
  await maker.getByLabel('Organisation', { exact: true }).selectOption({ label: new RegExp(orgName) as never }).catch(async () => {
    const value = await maker.locator('select[name="org-0"] option', { hasText: orgName }).getAttribute('value');
    await maker.getByLabel('Organisation', { exact: true }).selectOption(value!);
  });
  await maker.getByLabel('owner', { exact: true }).check();
  await maker.getByLabel('Reason for the change (optional)').fill('e2e: pharmacy owners');
  await maker.getByRole('button', { name: 'Show who is affected' }).click();
  await expect(maker.getByText(/people are covered/)).toBeVisible();
  const axe = await new AxeBuilder({ page: maker }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await maker.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(maker.getByRole('status').filter({ hasText: 'Submitted. A second person must approve it.' })).toBeVisible();
  const mine = maker.locator('#mfa-pending li').first();
  await expect(mine).toContainText('e2e: pharmacy owners');
  await expect(mine.getByRole('button', { name: 'Approve and apply' })).toHaveCount(0); // the maker cannot approve
  await expect(mine.getByRole('button', { name: 'Withdraw' })).toBeVisible();

  // still optional: only a proposal exists
  const earlyCtx = await browser.newContext(); await useEnglish(earlyCtx);
  const early = await earlyCtx.newPage();
  await signInToSecondFactor(early, phone);
  await expect(early.locator('#totp')).toHaveCount(0);
  await earlyCtx.close();

  // 3. the checker (super admin) approves
  await signIn(checker, OPS.phone, { totpSecret: OPS.totpSecret });
  await nav(checker, 'MFA policy').click();
  const pending = checker.locator('#mfa-pending li').first();
  await expect(pending).toContainText('e2e: pharmacy owners');
  await pending.getByRole('button', { name: 'Approve and apply' }).click();
  await checker.getByRole('dialog').getByRole('button', { name: 'Approve and apply' }).click();
  await expect(checker.getByRole('status').filter({ hasText: 'Approved and applied.' })).toBeVisible();
  await expect(checker.locator('#mfa-current')).toContainText('Mandatory');
  await expect(checker.locator('#mfa-history')).toContainText('Applied');

  // 4. mandatory: the owner's next sign-in is walked through enrolment, cannot skip, and ends signed in with the factor on
  const again = await (await browser.newContext()).newPage();
  await useEnglish(again);
  await signInToSecondFactor(again, phone);
  await expect(again.getByRole('heading', { name: 'Set up your authenticator' })).toBeVisible();
  await expect(again.getByText('Two-step verification is required for your account.')).toBeVisible();
  await expect(again.locator('#totp-skip')).toHaveCount(0);
  const secret = (await again.locator('#totp-secret').innerText()).trim();
  await again.locator('#totp').fill('000001');
  await again.locator('form[action$="/totp"] button[type=submit]').click();
  await expect(again.getByRole('alert')).toContainText('Incorrect code');
  await again.locator('#totp').fill(totpNow(secret));
  await again.locator('form[action$="/totp"] button[type=submit]').click();
  const finish = again.locator('form[action$="/finish"] button');
  if (await finish.isVisible({ timeout: 2000 }).catch(() => false)) await finish.click();
  await landed(again);
  await nav(again, 'Security').click();
  await expect(again.getByText('Your organisation requires two-step verification, so it cannot be turned off.')).toBeVisible();

  // 5. the global switch off (super admin break-glass, audited): optional again, the enrolled owner may skip
  await checker.reload();
  await checker.getByLabel('Make two-step verification mandatory for the rules below').uncheck();
  await checker.getByRole('button', { name: 'Apply now (super admin)' }).click();
  await checker.getByRole('dialog').getByRole('button', { name: 'Apply now (super admin)' }).click();
  await expect(checker.getByRole('status').filter({ hasText: 'Policy applied.' })).toBeVisible();
  await expect(checker.locator('#mfa-current')).toContainText('Optional (switch off)');
  await expect(checker.locator('#mfa-history')).toContainText('applied directly');
  const last = await (await browser.newContext()).newPage();
  await useEnglish(last);
  await signInToSecondFactor(last, phone);
  await expect(last.locator('#totp')).toBeVisible(); // enrolled: offered
  await last.locator('#totp-skip').click();
  const fin2 = last.locator('form[action$="/finish"] button');
  if (await fin2.isVisible({ timeout: 2000 }).catch(() => false)) await fin2.click();
  await landed(last);
  await nav(last, 'Security').click();
  await expect(last.getByRole('button', { name: 'Turn off' })).toBeVisible(); // optional: can be turned off again
  for (const c of ctxs) await c.close();
});

test('the policy page is Arabic and right-to-left for ops, and closed to everyone else', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext(); await useEnglish(ctx);
  const page = await ctx.newPage();
  await signIn(page, randomPhone(), { name: 'Not Ops' });
  await page.goto('/account/ops/mfa');
  await expect(page.getByText('This page is for operations staff.').first()).toBeVisible();
  await ctx.close();
  const opsCtx = await browser.newContext();
  await opsCtx.addInitScript(() => { try { localStorage.setItem('kx-lang', 'ar'); } catch { /* ignore */ } });
  const ops = await opsCtx.newPage();
  await ops.waitForTimeout(30_000 - (Date.now() % 30_000) + 800); // each authenticator step is accepted once: the first test already used this account in the current step
  await signIn(ops, OPS.phone, { totpSecret: OPS.totpSecret });
  await ops.goto('/account/ops/mfa');
  await expect(ops.getByRole('heading', { name: 'سياسة التحقق بخطوتين' })).toBeVisible();
  await expect(ops.locator('#mfa-current')).toBeVisible(); // the data has arrived: axe never sees the loading state or a half-faded card
  await ops.waitForLoadState('networkidle');
  await ops.waitForTimeout(700);
  expect(await ops.evaluate(() => document.documentElement.dir)).toBe('rtl');
  const axe = await new AxeBuilder({ page: ops }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.html.slice(0, 120)} ${n.any.map((a) => a.message).join(' ').slice(0, 160)}`).join(' | ')}`)).toEqual([]);
  await opsCtx.close();
});
