import { test, expect } from '@playwright/test';
import { randomPhone, signIn, useEnglish, nav } from './helpers';

test.describe('family and guardians', () => {
  test('adds a dependant, shows the age-of-majority notice, acts as the dependant, invites and accepts a co-guardian', async ({ browser }) => {
    const parentCtx = await browser.newContext(); const coCtx = await browser.newContext();
    await useEnglish(parentCtx); await useEnglish(coCtx);
    const parent = await parentCtx.newPage(); const co = await coCtx.newPage();
    const coPhone = randomPhone();
    await signIn(co, coPhone, { name: 'Grandma Hoda' }); // the co-guardian needs a Passport first
    await signIn(parent, randomPhone(), { name: 'Mona' });

    await nav(parent, 'Family').click();
    await expect(parent.getByText('You have not added a dependant yet.')).toBeVisible();

    // client-side validation: a 14-digit national-ID-like reference is refused
    await parent.getByLabel('Full name').fill('Yara');
    await parent.getByLabel('Date of birth').fill('2018-03-04');
    await parent.getByLabel('Evidence type').selectOption('birth_certificate_ref');
    await parent.getByLabel('Document reference').fill('29801011234567');
    await parent.getByRole('button', { name: 'Add dependant' }).click();
    await expect(parent.getByText('This looks like a national ID number. Enter a document reference instead.')).toBeVisible();
    await parent.getByLabel('Document reference').fill('BC-2018-0042');
    await parent.getByRole('button', { name: 'Add dependant' }).click();
    await expect(parent.getByRole('status').filter({ hasText: 'Dependant added.' })).toBeVisible();

    const card = parent.getByRole('listitem', { name: 'Yara' });
    await expect(card).toContainText('Birth certificate reference');
    await expect(card).toContainText('Your guardian access ends automatically on');
    await expect(card.locator('[data-needs-human="majority"]')).toBeVisible();

    // act-as entry point: choose scopes, get a short-lived scoped access
    await card.getByRole('button', { name: 'Act as Yara' }).click();
    const dlg = parent.getByRole('dialog', { name: 'Act on behalf of Yara' });
    await dlg.getByLabel('Give and withdraw consent for them').uncheck();
    await dlg.getByRole('button', { name: 'Continue as guardian' }).click();
    await expect(dlg.getByTestId('act-as-ready')).toContainText('You can act for Yara for 10 minute(s).');
    await expect(dlg.getByText('Book and manage appointments')).toBeVisible();
    await expect(dlg.getByText('Give and withdraw consent for them')).toHaveCount(0);
    await dlg.getByRole('button', { name: 'Close' }).last().click();

    // co-guardian invitation: sent by phone, accepted by the invitee
    await card.getByRole('button', { name: 'Invite another guardian' }).click();
    const inv = parent.getByRole('dialog');
    await inv.getByLabel('Their mobile number').fill(coPhone);
    await inv.getByLabel('Your relationship').selectOption('grandparent');
    await inv.getByRole('button', { name: 'Invite another guardian' }).click();
    await expect(parent.getByRole('status').filter({ hasText: 'Invitation sent.' })).toBeVisible();

    await nav(co, 'Family').click();
    const pending = co.getByRole('region', { name: 'Invitations to be a guardian' });
    await expect(pending).toContainText('You were invited to help look after Yara.');
    await pending.getByRole('button', { name: 'Accept - Yara' }).click();
    await expect(co.getByRole('listitem', { name: 'Yara' })).toBeVisible();

    // the parent can remove their own access (confirmation first)
    await card.getByRole('button', { name: 'Remove my access' }).click();
    await parent.getByRole('dialog').getByRole('button', { name: 'Remove my access' }).click();
    await expect(parent.getByText('You have not added a dependant yet.')).toBeVisible();
    await parentCtx.close(); await coCtx.close();
  });

  test('a declined co-guardian invitation disappears', async ({ browser }) => {
    const a = await browser.newContext(); const b = await browser.newContext();
    await useEnglish(a); await useEnglish(b);
    const pa = await a.newPage(); const pb = await b.newPage();
    const phoneB = randomPhone();
    await signIn(pb, phoneB, { name: 'Uncle Sami' });
    await signIn(pa, randomPhone(), { name: 'Dina' });
    await nav(pa, 'Family').click();
    await pa.getByLabel('Full name').fill('Omar');
    await pa.getByLabel('Date of birth').fill('2020-01-10');
    await pa.getByRole('button', { name: 'Add dependant' }).click();
    await pa.getByRole('button', { name: 'Invite another guardian' }).click();
    await pa.getByRole('dialog').getByLabel('Their mobile number').fill(phoneB);
    await pa.getByRole('dialog').getByRole('button', { name: 'Invite another guardian' }).click();
    await nav(pb, 'Family').click();
    await pb.getByRole('button', { name: 'Decline - Omar' }).click();
    await expect(pb.getByRole('region', { name: 'Invitations to be a guardian' })).toHaveCount(0);
    await a.close(); await b.close();
  });
});
