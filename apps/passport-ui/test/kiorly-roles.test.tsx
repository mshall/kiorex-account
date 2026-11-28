// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type KiorlyRolesState } from '../src/api';
import { OpsKiorlyRolesPage } from '../src/pages/OpsKiorlyRoles';
import { ACCOUNT, a11yViolations, fakeApi, renderApp } from './harness';

const sup = { ...ACCOUNT, sub: 'SUP1', roles: ['super_admin'], mfa_required: true, totp_enrolled: true };
const state = (over: Partial<KiorlyRolesState> = {}): KiorlyRolesState => ({ holders: [], history: [], roles: ['kiorly_ops', 'kiorly_admin'], me: { sub: 'SUP1' }, ...over });

describe('Ops Kiorly roles page (ADR-062)', () => {
  it('is closed to everybody but a super admin (an ops_admin sees the denial, not the form)', async () => {
    renderApp(<OpsKiorlyRolesPage />, { api: fakeApi({ account: async () => ({ ...sup, roles: ['ops_admin'] }) }) });
    expect(await screen.findByText('Only a super admin can manage Kiorly roles.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Grant role' })).toBeNull();
  });

  it('shows holders with masked phones, test tags and the history; empty states are honest', async () => {
    renderApp(<OpsKiorlyRolesPage />, { api: fakeApi({ account: async () => sup, opsKiorlyRoles: async () => state() }) });
    expect(await screen.findByText('Nobody holds a Kiorly role yet.')).toBeInTheDocument();
    expect(screen.getByText('No grant or revoke yet.')).toBeInTheDocument();
    renderApp(<OpsKiorlyRolesPage />, { api: fakeApi({ account: async () => sup, opsKiorlyRoles: async () => state({ holders: [{ sub: 'K1', name: 'Dina', phone: '+201****700', role: 'kiorly_admin', test: true }], history: [{ at: new Date().toISOString(), type: 'kiorly.role.granted', actor: 'SUP1', actor_name: 'Founder', target: 'K1', target_name: 'Dina', role: 'kiorly_admin', note: 'joins onboarding' }] }) }) });
    expect(await screen.findByText('Dina')).toBeInTheDocument();
    expect(screen.getByText('test account')).toBeInTheDocument();
    expect(screen.getByText('Founder granted Kiorly admin (changes within Kiorly) to Dina')).toBeInTheDocument();
  });

  it('grants a role: needs a valid phone and a reason, asks for confirmation, sends exactly phone, role and reason', async () => {
    const a = fakeApi({ account: async () => sup, opsKiorlyRoles: async () => state(), opsKiorlyRoleGrant: async () => ({ sub: 'K1', role: 'kiorly_ops' }) });
    renderApp(<OpsKiorlyRolesPage />, { api: a });
    await screen.findByText('Nobody holds a Kiorly role yet.');
    const submit = screen.getByRole('button', { name: 'Grant role' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Phone number of the person (with country code)'), '+20 100 970 2000');
    await userEvent.type(screen.getByLabelText('Reason (required, 3 to 300 characters)'), 'joins the Kiorly team');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await userEvent.click(await screen.findByRole('dialog').then(() => screen.getAllByRole('button', { name: 'Grant role' }).at(-1)!));
    await waitFor(() => expect(a.opsKiorlyRoleGrant).toHaveBeenCalledWith({ phone: '+201009702000', role: 'kiorly_ops', note: 'joins the Kiorly team' }));
    expect(await screen.findByText('Role granted.')).toBeInTheDocument();
  });

  it('shows the server refusal for an account that holds Kiorex roles in plain words', async () => {
    const a = fakeApi({ account: async () => sup, opsKiorlyRoles: async () => state(), opsKiorlyRoleGrant: async () => { throw new ApiError(409, 'mixed_roles'); } });
    renderApp(<OpsKiorlyRolesPage />, { api: a });
    await screen.findByText('Nobody holds a Kiorly role yet.');
    await userEvent.type(screen.getByLabelText('Phone number of the person (with country code)'), '+201000009001');
    await userEvent.type(screen.getByLabelText('Reason (required, 3 to 300 characters)'), 'must fail');
    await userEvent.click(screen.getByRole('button', { name: 'Grant role' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Grant role' }).at(-1)!);
    expect((await screen.findAllByText('That account holds Kiorex roles. A Kiorly role needs a separate account.')).length).toBeGreaterThan(0);
  });

  it('is accessible and has an Arabic version', async () => {
    const { container } = renderApp(<OpsKiorlyRolesPage />, { api: fakeApi({ account: async () => sup, opsKiorlyRoles: async () => state() }) });
    await screen.findByText('Nobody holds a Kiorly role yet.');
    expect(await a11yViolations(container)).toEqual([]);
    renderApp(<OpsKiorlyRolesPage />, { api: fakeApi({ account: async () => sup, opsKiorlyRoles: async () => state() }), lang: 'ar' });
    expect(await screen.findByText('أدوار كيورلي')).toBeInTheDocument();
  });
});
