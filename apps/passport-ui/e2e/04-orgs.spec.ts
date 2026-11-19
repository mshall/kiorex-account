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
  await owner.getByLabel('Country (2 letters)').fill('eg');
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
