import { test, expect } from '@playwright/test';
import { lastMessage, randomPhone, signIn, useEnglish, nav } from './helpers';

test('organisations: create, invite by phone, invitee accepts (list and link), owner changes role', async ({ browser }) => {
  const ownerCtx = await browser.newContext(); const docCtx = await browser.newContext(); const nurseCtx = await browser.newContext();
  for (const c of [ownerCtx, docCtx, nurseCtx]) await useEnglish(c);
  const owner = await ownerCtx.newPage(); const doc = await docCtx.newPage(); const nurse = await nurseCtx.newPage();
  const docPhone = randomPhone(); const nursePhone = randomPhone();
  await signIn(owner, randomPhone(), { name: 'Dr Owner' });
  await nav(owner, 'Organisations').click();
  await expect(owner.getByText('You are not a member of an organisation.')).toBeVisible();
  await owner.getByLabel('Legal name').fill('Nile Family Clinic');
  await owner.getByRole('button', { name: 'Create', exact: true }).click();
  const card = owner.getByRole('listitem', { name: 'Nile Family Clinic' });
  await expect(card).toContainText('Owner');
  await expect(card).toContainText('A role hint does not grant clinical access.');

  await card.getByRole('button', { name: 'Manage members' }).click();
  await card.getByLabel('Their mobile number').fill(docPhone);
  await card.getByLabel('Role hint').selectOption('doctor');
  await card.getByRole('button', { name: 'Send invitation' }).click();
  await expect(owner.getByRole('status').filter({ hasText: 'Invitation sent by mock WhatsApp.' })).toBeVisible();
  await card.getByLabel('Their mobile number').fill(nursePhone);
  await card.getByLabel('Role hint').selectOption('nurse');
  await card.getByRole('button', { name: 'Send invitation' }).click();

  // invitee 1: sees the pending invitation after signing in and accepts it
  await signIn(doc, docPhone, { name: 'Dr Salma' });
  await nav(doc, 'Organisations').click();
  const invites = doc.getByRole('region', { name: 'Invitations' });
  await expect(invites).toContainText('Dr Owner invited you to join Nile Family Clinic as Doctor.');
  await invites.getByRole('button', { name: 'Accept - Nile Family Clinic' }).click();
  const joined = doc.getByRole('listitem', { name: 'Nile Family Clinic' });
  await expect(joined).toContainText('Doctor');
  await expect(joined.getByRole('button', { name: 'Manage members' })).toHaveCount(0); // a doctor hint cannot manage members

  // invitee 2: opens the invitation link from the (mock) WhatsApp message; the code is prefilled
  const msg = await lastMessage(nursePhone, 'org_invitation');
  await signIn(nurse, nursePhone, { name: 'Nurse Omar', path: `/account/orgs?invite=${msg!.data.token}` });
  await expect(nurse.getByLabel(/Invitation code/)).toHaveValue(msg!.data.token);
  await nurse.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(nurse.getByRole('listitem', { name: 'Nile Family Clinic' })).toContainText('Nurse');

  // owner changes a role hint
  await card.getByRole('button', { name: 'Manage members' }).click().catch(() => undefined);
  await owner.reload();
  await nav(owner, 'Organisations').click();
  const card2 = owner.getByRole('listitem', { name: 'Nile Family Clinic' });
  await card2.getByRole('button', { name: 'Manage members' }).click();
  await expect(card2.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveCount(3);
  await card2.getByLabel('Role - Nurse Omar').selectOption('staff');
  await expect(owner.getByRole('status').filter({ hasText: 'Role updated.' })).toBeVisible();
  await ownerCtx.close(); await docCtx.close(); await nurseCtx.close();
});

test('KA-14 editions: one person holds a Nurse practice and a Clinic membership; edition and new role hints shown in EN and AR', async ({ browser }) => {
  const ctx = await browser.newContext(); await useEnglish(ctx);
  const page = await ctx.newPage();
  await signIn(page, randomPhone(), { name: 'Nurse Omar' });
  await nav(page, 'Organisations').click();
  await page.getByLabel('Legal name').fill('Omar Home Nursing');
  await page.getByLabel('Edition').selectOption('NURSE');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const solo = page.getByRole('listitem', { name: 'Omar Home Nursing' });
  await expect(solo).toContainText('Kiorly Nurse');
  await page.getByLabel('Legal name').fill('Nile Family Clinic');
  await page.getByLabel('Edition').selectOption('CLINIC');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('listitem', { name: 'Nile Family Clinic' })).toContainText('Kiorly Clinic');
  await expect(page.getByText('Your profession, licence and what you may practise are kept and checked inside Kiorly, never in Kiorex Passport.')).toBeVisible();
  // new role hints are offered to managers
  await solo.getByRole('button', { name: 'Manage members' }).click();
  const options = await solo.getByLabel('Role hint').locator('option').allTextContents();
  for (const r of ['Physiotherapist', 'Dispatcher', 'Assistant', 'Front desk']) expect(options).toContain(r);
  // Arabic
  const ar = await browser.newContext(); const arPage = await ar.newPage();
  await signIn(arPage, randomPhone(), { name: 'Nurse Layla' });
  await arPage.goto('/account/orgs');
  await expect(arPage.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(arPage.getByLabel('الإصدار')).toBeVisible();
  await expect(arPage.getByLabel('الإصدار').locator('option')).toHaveText(['كيورلي كلينك', 'كيورلي نيرس']);
  await ar.close();
});
