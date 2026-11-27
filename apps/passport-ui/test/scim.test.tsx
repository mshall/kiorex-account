// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type Membership } from '../src/api';
import { OrgsPage } from '../src/pages/Orgs';
import { a11yViolations, fakeApi, renderApp } from './harness';

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const owner: Membership = { org_id: 'O1', legal_name: 'Nile Clinic', country: 'EG', edition: 'CLINIC', membership_id: 'M1', role_hint: 'owner', status: 'active', effective_from: iso(-30) };
const base = { orgs: async () => [owner], orgMembers: async () => [], sentInvitations: async () => [] };

async function open(a: ReturnType<typeof fakeApi>, lang: 'en' | 'ar' = 'en') {
  const view = renderApp(<OrgsPage />, { api: a, lang });
  const card = await screen.findByRole('listitem', { name: 'Nile Clinic' });
  await userEvent.click(within(card).getByRole('button', { name: lang === 'en' ? 'Manage members' : /الأعضاء|إدارة/ }));
  return view;
}

describe('SCIM token management (org owners and admins)', () => {
  it('lists tokens (never used, used, revoked) and only active ones can be revoked, after confirmation', async () => {
    const tokens = [
      { token_id: 'T1', label: 'Entra connector', created_at: iso(-3), last_used_at: iso(-1), revoked_at: null },
      { token_id: 'T2', label: 'Old test', created_at: iso(-30), last_used_at: null, revoked_at: iso(-10) },
    ];
    const a = fakeApi({ ...base, scimTokens: async () => tokens, revokeScimToken: async () => undefined });
    const { container } = await open(a);
    const list = await screen.findByRole('list', { name: 'Directory sync (SCIM) tokens' });
    expect(within(list).getByText('Entra connector')).toBeInTheDocument();
    expect(within(list).getByText('Revoked')).toBeInTheDocument();
    expect(list).toHaveTextContent('Never used');
    expect(within(list).getAllByRole('button')).toHaveLength(1);
    await userEvent.click(within(list).getByRole('button', { name: 'Revoke - Entra connector' }));
    expect(a.revokeScimToken).not.toHaveBeenCalled();
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(a.revokeScimToken).toHaveBeenCalledWith('O1', 'T1'));
    expect(await a11yViolations(container)).toEqual([]);
  });

  it('creates a token: shows it once with the connector URL, then hides it', async () => {
    const a = fakeApi({ ...base, scimTokens: async () => [], createScimToken: async () => ({ token_id: 'T9', label: 'Entra', token: 'kxscim_SECRET', scim_base_url: 'https://idp.example/scim/v2' }) });
    await open(a);
    expect(await screen.findByText('No tokens yet.')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Token name'), 'Entra');
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }));
    await waitFor(() => expect(a.createScimToken).toHaveBeenCalledWith('O1', 'Entra'));
    expect(await screen.findByTestId('scim-token')).toHaveTextContent('kxscim_SECRET');
    expect(screen.getByText('https://idp.example/scim/v2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'I have copied it' }));
    expect(screen.queryByTestId('scim-token')).toBeNull();
    expect(document.body.textContent).not.toContain('kxscim_SECRET');
  });

  it('says so when directory sync is switched off, and renders in Arabic', async () => {
    const a = fakeApi({ ...base, scimTokens: async () => [], createScimToken: async () => { throw new ApiError(403, 'feature_disabled'); } });
    await open(a);
    await userEvent.click(await screen.findByRole('button', { name: 'Create token' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Directory sync is not available right now.');
  });
  it('Arabic heading', async () => {
    await open(fakeApi({ ...base, scimTokens: async () => [] }), 'ar');
    expect(await screen.findByRole('heading', { name: 'رموز مزامنة الدليل (SCIM)' })).toBeInTheDocument();
  });
});
