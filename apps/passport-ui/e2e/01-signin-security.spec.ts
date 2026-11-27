import { test, expect } from '@playwright/test';
import { addVirtualAuthenticator, randomPhone, signIn, useEnglish, nav, totpNow } from './helpers';

test.describe('sign-in -> security -> passkey (virtual authenticator)', () => {
  test('signs in, adds and removes a passkey, then signs in with it', async ({ page }) => {
    await useEnglish(page);
    const va = await addVirtualAuthenticator(page);
    const phone = randomPhone();
    await signIn(page, phone, { name: 'Salma' });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Salma');

    await nav(page, 'Security').click();
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByText('No passkeys yet.')).toBeVisible();

    await page.getByRole('button', { name: 'Add a passkey' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Passkey added.' })).toBeVisible();
    const list = page.getByRole('list', { name: 'Passkeys' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    expect(await va.credentials()).toHaveLength(1);

    // sessions + recent activity are listed
    await expect(page.getByRole('list', { name: 'Active sessions' }).getByText('This session')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Recent sign-in activity' })).toContainText('Passkey added');

    // sign out, then sign back in with the passkey on the IdP login page
    await page.getByRole('button', { name: 'Sign out' }).click();
    // the IdP's end-session confirmation page is skipped when the id_token_hint is accepted; click it only when it is shown
    const yes = page.getByRole('button', { name: 'Yes, sign out' });
    if (await yes.isVisible({ timeout: 3000 }).catch(() => false)) await yes.click();
    await page.waitForURL(/\/account(\?.*)?$/).catch(() => undefined);
    await signIn(page, phone, { passkeyLogin: true });
    await nav(page, 'Security').click();
    await expect(page.getByRole('list', { name: 'Recent sign-in activity' })).toContainText('Signed in with a passkey');

    // remove it (confirmation first)
    await page.getByRole('list', { name: 'Passkeys' }).getByRole('button', { name: /^Remove/ }).click();
    const dlg = page.getByRole('dialog', { name: 'Remove this passkey?' });
    await dlg.getByRole('button', { name: 'Cancel' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await page.getByRole('list', { name: 'Passkeys' }).getByRole('button', { name: /^Remove/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByText('No passkeys yet.')).toBeVisible();
  });

  test('authenticator app: enrol, then disabling asks for fresh step-up', async ({ page }) => {
    await useEnglish(page);
    const phone = randomPhone();
    await signIn(page, phone, { name: 'Nour' });
    await nav(page, 'Security').click();
    await page.getByRole('button', { name: 'Set up' }).click();
    const secret = (await page.locator('#totp-secret').innerText()).trim();
    await page.getByLabel('Authenticator code').fill(totpNow(secret));
    await page.getByRole('button', { name: 'Confirm and turn on' }).click();
    await expect(page.getByText('Authenticator app is on.')).toBeVisible();

    // disabling needs acr=mfa + fresh: the step-up dialog appears (code from the next 30 s window, replay protection)
    await page.getByRole('button', { name: 'Turn off' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Turn off' }).click();
    const su = page.getByRole('dialog', { name: 'Extra verification' });
    await expect(su).toBeVisible();
    await su.getByLabel('Authenticator code').fill(totpNow(secret, 30));
    await su.getByRole('button', { name: 'Verify' }).click();
    await expect(page.getByText('Authenticator app is off.')).toBeVisible();
  });
});
