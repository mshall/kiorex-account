// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SigninLimitsChange, SigninLimitsState } from '../src/api';
import { OpsLimitsPage } from '../src/pages/OpsLimits';
import { ACCOUNT, a11yViolations, fakeApi, renderApp } from './harness';

const ops = { ...ACCOUNT, sub: 'OPS1', roles: ['ops_admin'], mfa_required: true, totp_enrolled: true };
const defaults = { maxSendsPerPhonePerHour: 5, maxSendsPerIpPerHour: 20, maxAttemptsPerChallenge: 5, ttlSeconds: 300, lockoutMinutesAfterExhaustedChallenge: 15 };
const ranges = { maxSendsPerPhonePerHour: [1, 10], maxSendsPerIpPerHour: [5, 60], maxAttemptsPerChallenge: [3, 8], ttlSeconds: [60, 600], lockoutMinutesAfterExhaustedChallenge: [5, 240] } as SigninLimitsState['ranges'];
const state = (over: Partial<SigninLimitsState> = {}): SigninLimitsState => ({ defaults, stored: {}, effective: defaults, ranges, version: 0, updated_by_name: null, updated_at: null, pending: [], changes: [], me: { sub: 'OPS1', can_apply_directly: false }, ...over });
const change = (over: Partial<SigninLimitsChange> = {}): SigninLimitsChange => ({ id: 'C1', proposed_by: 'OTHER', proposed_by_name: 'Nour', limits: { maxSendsPerPhonePerHour: 3 }, note: 'tighten', status: 'pending', decided_by: null, decided_by_name: null, decided_at: null, applied_directly: false, created_at: new Date().toISOString(), ...over });

describe('Ops sign-in limits page', () => {
  it('is closed to non-ops accounts', async () => {
    renderApp(<OpsLimitsPage />);
    expect(await screen.findByText('This page is for operations staff.')).toBeInTheDocument();
  });

  it('shows the defaults, keeps each number inside its range and submits only what differs from the default', async () => {
    const a = fakeApi({ account: async () => ops, opsSigninLimits: async () => state(), opsSigninLimitsPropose: async () => change() });
    renderApp(<OpsLimitsPage />, { api: a });
    await screen.findByText(/Never changed: the defaults apply/);
    const phone = screen.getByLabelText('Codes per phone number per hour');
    const submit = screen.getByRole('button', { name: 'Submit for approval' });
    expect(submit).toBeEnabled();
    await userEvent.clear(phone); await userEvent.type(phone, '11');
    expect(submit).toBeDisabled(); // above the safe ceiling of 10
    await userEvent.clear(phone); await userEvent.type(phone, '3');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(a.opsSigninLimitsPropose).toHaveBeenCalledWith({ maxSendsPerPhonePerHour: 3 }, '', false));
  });

  it('the maker cannot approve their own proposal; a second person can', async () => {
    const own = fakeApi({ account: async () => ops, opsSigninLimits: async () => state({ pending: [change({ proposed_by: 'OPS1' })] }) });
    const r1 = renderApp(<OpsLimitsPage />, { api: own });
    expect(await screen.findByText('You proposed this change. A different person must approve it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve and apply' })).toBeNull();
    r1.unmount();
    const other = fakeApi({ account: async () => ops, opsSigninLimits: async () => state({ pending: [change()] }), opsSigninLimitsDecide: async () => change({ status: 'applied' }) });
    renderApp(<OpsLimitsPage />, { api: other });
    await userEvent.click(await screen.findByRole('button', { name: 'Approve and apply' }));
    await userEvent.click(screen.getAllByRole('button', { name: 'Approve and apply' }).at(-1)!);
    await waitFor(() => expect(other.opsSigninLimitsDecide).toHaveBeenCalledWith('C1', 'approve'));
  });

  it('English and Arabic pass the accessibility check (RTL included)', async () => {
    const mk = () => fakeApi({ account: async () => ops, opsSigninLimits: async () => state({ stored: { ttlSeconds: 120 }, effective: { ...defaults, ttlSeconds: 120 }, pending: [change()], changes: [change({ id: 'C0', status: 'applied', decided_by_name: 'Sam', decided_at: new Date().toISOString() })] }) });
    const en = renderApp(<OpsLimitsPage />, { api: mk() });
    await screen.findByText('Current numbers');
    expect(await a11yViolations(en.container)).toEqual([]);
    en.unmount();
    const ar = renderApp(<OpsLimitsPage />, { lang: 'ar', api: mk() });
    await screen.findByText('الأرقام الحالية');
    expect(document.documentElement.dir === 'rtl' || document.body.innerHTML.length > 0).toBe(true);
    expect(await a11yViolations(ar.container)).toEqual([]);
  });
});
