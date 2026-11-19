import { test, expect } from '@playwright/test';
import { OPS, lastCode, randomPhone, signIn, useEnglish, nav, totpNow } from './helpers';

test('account linking: request with OTP, conflict review by an ops reviewer (MFA), approve and reverse', async ({ browser }) => {
  const userCtx = await browser.newContext(); const secondCtx = await browser.newContext(); const opsCtx = await browser.newContext();
  for (const c of [userCtx, secondCtx, opsCtx]) await useEnglish(c);
  const user = await userCtx.newPage(); const second = await secondCtx.newPage(); const ops = await opsCtx.newPage();
  const secondPhone = randomPhone();
  await signIn(second, secondPhone, { name: 'Monica' }); // the old account, different spelling => blocking name conflict
  await signIn(user, randomPhone(), { name: 'Mona' });

  await nav(user, 'Linked accounts').click();
  await expect(user.getByText('No link requests.')).toBeVisible();
  await user.getByLabel('Mobile number of the other account').fill(secondPhone);
  await user.getByRole('button', { name: 'Send verification code' }).click();
  await expect(user.getByText('We sent a code to the other number.').first()).toBeVisible();
  const form = user.getByRole('region', { name: 'Link another account' });
  await form.getByLabel('Verification code').fill('111111'); // wrong code first
  await form.getByRole('button', { name: 'Verify' }).click();
  await expect(form.getByRole('alert')).toContainText('not correct');
  await form.getByLabel('Verification code').fill(await lastCode(secondPhone));
  await form.getByRole('button', { name: 'Verify' }).click();
  await expect(user.getByRole('status').filter({ hasText: 'Verified. Your request is waiting for review.' })).toBeVisible();
  const mine = user.getByRole('region', { name: 'Your requests' });
  await expect(mine).toContainText('Waiting for review');
  await expect(mine).toContainText('The names differ');

  // reviewer (ops + TOTP at sign-in = fresh MFA)
  await signIn(ops, OPS.phone, { totpSecret: OPS.totpSecret });
  await nav(ops, 'Link review').click();
  const item = ops.locator('li[data-status="pending_review"]').first();
  await expect(item).toContainText('The names differ');
  await expect(item.getByRole('button', { name: 'Approve merge' })).toBeDisabled(); // blocking conflict needs a decision
  await item.getByLabel('Other account: Monica').check();
  await item.getByLabel('Note for the record (optional)').fill('Verified by phone');
  await item.getByRole('button', { name: 'Approve merge' }).click();
  await ops.getByRole('dialog').getByRole('button', { name: 'Approve merge' }).click();
  await expect(ops.getByRole('status').filter({ hasText: 'Merge approved.' })).toBeVisible();

  await ops.getByRole('tab', { name: 'Merged' }).click();
  const merged = ops.locator('li[data-status="merged"]').first();
  await expect(merged).toBeVisible();
  await merged.getByRole('button', { name: 'Reverse merge' }).click();
  await ops.getByRole('dialog').getByRole('button', { name: 'Reverse merge' }).click();
  await expect(ops.getByRole('status').filter({ hasText: 'Merge reversed.' })).toBeVisible();
  await ops.getByRole('tab', { name: 'Reversed' }).click();
  await expect(ops.locator('li[data-status="reversed"]').first()).toBeVisible();

  // a non-ops user never sees the review page
  await expect(nav(user, 'Link review')).toHaveCount(0);
  await user.goto('/account/ops/links');
  await expect(user.getByText('This page is for operations staff.').first()).toBeVisible();
  await userCtx.close(); await secondCtx.close(); await opsCtx.close();
});

test('the standalone step-up page verifies a fresh authenticator code and returns to the requested page', async ({ page }) => {
  await useEnglish(page);
  await signIn(page, randomPhone(), { name: 'Reviewer Candidate' });
  await nav(page, 'Security').click();
  await page.getByRole('button', { name: 'Set up' }).click();
  const secret = (await page.locator('#totp-secret').innerText()).trim();
  await page.getByLabel('Authenticator code').fill(totpNow(secret));
  await page.getByRole('button', { name: 'Confirm and turn on' }).click();
  await expect(page.getByText('Authenticator app is on.')).toBeVisible();

  await page.goto('/account/step-up?return=/account/privacy');
  await expect(page.getByRole('heading', { level: 1, name: 'Extra verification' })).toBeVisible();
  await page.getByLabel('Authenticator code').fill('000000');
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page.getByRole('alert')).toContainText('not correct');
  await page.getByLabel('Authenticator code').fill(totpNow(secret, 30));
  await page.getByRole('button', { name: 'Verify' }).click();
  await expect(page).toHaveURL(/\/account\/privacy$/);
});
