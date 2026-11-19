import { test, expect } from '@playwright/test';
import { randomPhone, signIn, useEnglish, nav } from './helpers';
import { readFileSync } from 'node:fs';

test.describe('data and privacy', () => {
  test('exports the identity data as a JSON file', async ({ page }) => {
    await useEnglish(page);
    const phone = randomPhone();
    await signIn(page, phone, { name: 'Laila' });
    await nav(page, 'Data & privacy').click();
    await expect(page.locator('[data-needs-human="export"]')).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download my data' }).click()]);
    expect(download.suggestedFilename()).toBe('kiorex-passport-export.json');
    const json = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(json.subject).toMatchObject({ name: 'Laila', phone_number: phone });
    expect(json.note).toContain('Clinical data is never held');
    await expect(page.getByRole('status').filter({ hasText: 'Your file was downloaded.' }).first()).toBeVisible();
  });

  test('deleting the account needs the acknowledgement, the typed word and a confirmation; then signs out', async ({ page }) => {
    await useEnglish(page);
    const phone = randomPhone();
    await signIn(page, phone, { name: 'Hana' });
    await nav(page, 'Data & privacy').click();
    await expect(page.getByRole('list').filter({ hasText: 'You are signed out everywhere, immediately.' })).toContainText('Every Kiorex and Kiorly product is told');
    await expect(page.locator('[data-needs-human="deletion"]')).toBeVisible();
    const del = page.getByRole('button', { name: 'Delete my account permanently' });
    await expect(del).toBeDisabled();
    await page.getByLabel('I understand that my account will be deleted permanently.').check();
    await expect(del).toBeDisabled();
    await page.getByLabel('Type DELETE to confirm').fill('delete');
    await expect(del).toBeEnabled();
    await del.click();
    const dlg = page.getByRole('dialog', { name: 'Delete your account now?' });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(page).toHaveURL(/\/account\/privacy$/);
    await del.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete my account permanently' }).click();
    await expect(page.getByText('Your account was deleted')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('connected apps lists granted apps and lets you remove one', async ({ page }) => {
    await useEnglish(page);
    await signIn(page, randomPhone(), { name: 'Kareem' });
    await nav(page, 'Connected apps').click();
    const me = page.getByRole('listitem', { name: 'Kiorex Passport' });
    await expect(me).toContainText('This app (Passport)');
    await expect(me).toContainText('Your mobile number');
    await expect(page.locator('[data-needs-human="consent"]')).toBeVisible();
    await expect(me.getByRole('button', { name: /Remove access/ })).toHaveCount(0);
  });
});
