import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { lastMessage, randomPhone, signIn, useEnglish, nav } from './helpers';

/** Optional verified e-mail, mock messaging: the code is read from the dev inbox (the mock e-mail channel). */
test.describe('e-mail verification (mock messaging)', () => {
  test('add an address, reject a wrong code, confirm with the right one, then remove it', async ({ page }) => {
    await useEnglish(page);
    const email = `e2e-${Date.now()}@example.org`;
    await signIn(page, randomPhone(), { name: 'Huda' });
    await nav(page, 'Security').click();
    const card = page.locator('#email');
    await expect(card.getByText('No e-mail address on this account.')).toBeVisible();

    await card.getByLabel('E-mail address').fill('not-an-address');
    await expect(card.getByRole('button', { name: 'Send code' })).toBeDisabled();
    await card.getByLabel('E-mail address').fill(email);
    await card.getByRole('button', { name: 'Send code' }).click();
    await expect(card.getByText(`We sent a 6-digit code to ${email}`)).toBeVisible();

    await card.getByLabel('E-mail code').fill('000000');
    await card.getByRole('button', { name: 'Confirm e-mail' }).click();
    await expect(card.getByRole('alert')).toContainText('That code is not right.');

    // the mock e-mail channel writes the dev inbox
    let msg = await lastMessage(email, 'kx_email_verify');
    for (let i = 0; i < 20 && !msg; i++) { await new Promise((r) => setTimeout(r, 150)); msg = await lastMessage(email, 'kx_email_verify'); }
    expect(msg?.data.code).toMatch(/^\d{6}$/);
    await card.getByLabel('E-mail code').fill(msg!.data.code);
    await card.getByRole('button', { name: 'Confirm e-mail' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'E-mail confirmed.' })).toBeVisible();
    await expect(card.getByText('Confirmed', { exact: true })).toBeVisible();

    await expect(page.getByRole('list', { name: 'Recent sign-in activity' })).toContainText('E-mail confirmed');
    const a11y = await new AxeBuilder({ page }).include('#email').analyze();
    expect(a11y.violations).toEqual([]);

    await card.getByRole('button', { name: 'Remove e-mail' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(card.getByText('No e-mail address on this account.')).toBeVisible();
  });

  test('Arabic: the card is right-to-left', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('kx-lang', 'ar'); } catch { /* ignore */ } });
    await signIn(page, randomPhone(), { name: 'Huda' });
    await page.goto('/account/security');
    await expect(page.locator('#email h2')).toHaveText('عنوان البريد الإلكتروني (اختياري)');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });
});
