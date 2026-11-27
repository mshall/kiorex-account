import { test, expect } from '@playwright/test';
import { randomPhone, signIn, useEnglish, nav } from './helpers';

test('org owner creates a SCIM token (shown once), then revokes it', async ({ page }) => {
  await useEnglish(page);
  await signIn(page, randomPhone(), { name: 'Dr Owner' });
  await nav(page, 'Organisations').click();
  await page.getByLabel('Legal name').fill('Delta Lab');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const card = page.getByRole('listitem', { name: 'Delta Lab' });
  await card.getByRole('button', { name: 'Manage members' }).click();

  await expect(card.getByText('No tokens yet.')).toBeVisible();
  await card.getByLabel('Token name').fill('Entra connector');
  await card.getByRole('button', { name: 'Create token' }).click();
  const token = (await card.getByTestId('scim-token').innerText()).trim();
  expect(token).toMatch(/^kxscim_/);
  await expect(card.getByText(/\/scim\/v2$/)).toBeVisible();
  await card.getByRole('button', { name: 'I have copied it' }).click();
  await expect(card.getByTestId('scim-token')).toHaveCount(0);

  const list = card.getByRole('list', { name: 'Directory sync (SCIM) tokens' });
  await expect(list).toContainText('Entra connector');
  await expect(list).toContainText('Never used');
  await list.getByRole('button', { name: 'Revoke - Entra connector' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await expect(list).toContainText('Revoked');
  await expect(list.getByRole('button')).toHaveCount(0);
  // the secret is gone from the page for good
  expect(await page.content()).not.toContain(token);
});
