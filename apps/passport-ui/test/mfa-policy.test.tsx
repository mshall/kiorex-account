// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type MfaChange, type MfaPolicyState } from '../src/api';
import { translate } from '../src/i18n';
import { OpsMfaPage } from '../src/pages/OpsMfa';
import { SecurityPage } from '../src/pages/Security';
import { ACCOUNT, a11yViolations, fakeApi, renderApp } from './harness';

const ops = { ...ACCOUNT, sub: 'OPS1', roles: ['ops_admin'], mfa_required: true, totp_enrolled: true };
const change = (over: Partial<MfaChange> = {}): MfaChange => ({
  id: 'C1', proposed_by: 'OTHER', proposed_by_name: 'Nour', policy: { enabled: true, rules: [{ scope: 'org_type', value: 'pharmacy', roles: ['owner', 'pharmacist'] }] }, note: 'pharmacies first', base_version: 0,
  status: 'pending', decided_by: null, decided_by_name: null, decided_at: null, decision_note: null, applied_directly: false, created_at: new Date().toISOString(), impact: { people: 3, without_factor: 2 }, ...over,
});
const state = (over: Partial<MfaPolicyState> = {}): MfaPolicyState => ({
  policy: { enabled: false, rules: [] }, version: 0, updated_by_name: null, updated_at: null, impact: { people: 0, without_factor: 0 }, pending: [], changes: [],
  options: { roles: ['owner', 'pharmacist', 'branch_manager'], org_types: ['clinic', 'nurse', 'pharmacy', 'lab'], orgs: [{ org_id: 'O1', legal_name: 'Nile Pharmacy', types: ['pharmacy'] }], baseline_roles: ['ops_admin', 'super_admin'] },
  me: { sub: 'OPS1', can_apply_directly: false }, ...over,
});

describe('Ops MFA policy page', () => {
  it('is closed to non-ops accounts', async () => {
    renderApp(<OpsMfaPage />);
    expect(await screen.findByText('This page is for operations staff.')).toBeInTheDocument();
  });

  it('shows the default (optional for everyone) and the always-mandatory baseline', async () => {
    renderApp(<OpsMfaPage />, { api: fakeApi({ account: async () => ops, opsMfaPolicy: async () => state() }) });
    expect(await screen.findByText('Optional (switch off)')).toBeInTheDocument();
    expect(screen.getByText(/Always mandatory, set in the configuration/)).toHaveTextContent('ops_admin, super_admin');
    expect(screen.getByText('No proposals are waiting.')).toBeInTheDocument();
  });

  it('builds a rule for a role per organisation type and submits it for approval with a note', async () => {
    const a = fakeApi({ account: async () => ops, opsMfaPolicy: async () => state(), opsMfaPropose: async () => change({ status: 'pending' }) });
    renderApp(<OpsMfaPage />, { api: a });
    await screen.findByText('Optional (switch off)');
    const submit = screen.getByRole('button', { name: 'Submit for approval' });
    await userEvent.click(screen.getByLabelText('Make two-step verification mandatory for the rules below'));
    await userEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    expect(submit).toBeDisabled(); // a rule needs a role
    await userEvent.selectOptions(screen.getByLabelText('Applies to'), 'org_type');
    await userEvent.selectOptions(screen.getByLabelText('Organisation type'), 'pharmacy');
    await userEvent.click(screen.getByLabelText('owner'));
    await userEvent.click(screen.getByLabelText('pharmacist'));
    await userEvent.type(screen.getByLabelText('Reason for the change (optional)'), 'why');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    await waitFor(() => expect(a.opsMfaPropose).toHaveBeenCalledWith({ enabled: true, rules: [{ scope: 'org_type', value: 'pharmacy', roles: ['owner', 'pharmacist'] }] }, 'why', false));
    expect(await screen.findByText('Submitted. A second person must approve it.')).toBeInTheDocument();
  });

  it('a rule for one organisation needs the organisation picked; the wildcard role excludes the others', async () => {
    const a = fakeApi({ account: async () => ops, opsMfaPolicy: async () => state(), opsMfaPropose: async () => change() });
    renderApp(<OpsMfaPage />, { api: a });
    await screen.findByText('Optional (switch off)');
    await userEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    await userEvent.selectOptions(screen.getByLabelText('Applies to'), 'org');
    await userEvent.click(screen.getByLabelText('Every member (any role)'));
    expect(screen.getByRole('button', { name: 'Submit for approval' })).toBeDisabled(); // no organisation yet
    await userEvent.selectOptions(screen.getByLabelText('Organisation'), 'O1');
    await userEvent.click(screen.getByLabelText('owner')); // picking a real role drops the wildcard
    expect(screen.getByLabelText('Every member (any role)')).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Submit for approval' }));
    await waitFor(() => expect(a.opsMfaPropose).toHaveBeenCalledWith({ enabled: false, rules: [{ scope: 'org', value: 'O1', roles: ['owner'] }] }, '', false));
  });

  it('a proposal by someone else can be approved (after a confirmation) or rejected; the maker only sees withdraw', async () => {
    const pend = [change(), change({ id: 'C2', proposed_by: 'OPS1', proposed_by_name: 'Me' })];
    const a = fakeApi({ account: async () => ops, opsMfaPolicy: async () => state({ pending: pend }), opsMfaDecide: async () => change({ status: 'applied' }) });
    renderApp(<OpsMfaPage />, { api: a });
    const items = await screen.findAllByText(/pharmacist in Pharmacy organisations/);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/2 of them have no authenticator yet/).length).toBe(2);
    const other = document.querySelector('[data-change="C1"]') as HTMLElement;
    const mine = document.querySelector('[data-change="C2"]') as HTMLElement;
    expect(within(mine).queryByRole('button', { name: 'Approve and apply' })).toBeNull();
    expect(within(mine).getByText('You proposed this, so someone else must approve it.')).toBeInTheDocument();
    await userEvent.click(within(mine).getByRole('button', { name: 'Withdraw' }));
    await waitFor(() => expect(a.opsMfaDecide).toHaveBeenCalledWith('C2', 'withdraw'));
    await userEvent.click(within(other).getByRole('button', { name: 'Approve and apply' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve and apply' }));
    await waitFor(() => expect(a.opsMfaDecide).toHaveBeenCalledWith('C1', 'approve'));
  });

  it('only a super admin sees Apply now, and it asks for confirmation', async () => {
    const a = fakeApi({ account: async () => ({ ...ops, roles: ['ops_admin', 'super_admin'] }), opsMfaPolicy: async () => state({ me: { sub: 'OPS1', can_apply_directly: true } }), opsMfaPropose: async () => change({ status: 'applied' }) });
    renderApp(<OpsMfaPage />, { api: a });
    await screen.findByText('Optional (switch off)');
    await userEvent.click(screen.getByLabelText('Make two-step verification mandatory for the rules below'));
    await userEvent.click(screen.getByRole('button', { name: 'Apply now (super admin)' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Apply now (super admin)' }));
    await waitFor(() => expect(a.opsMfaPropose).toHaveBeenCalledWith({ enabled: true, rules: [] }, '', true));
    expect(await screen.findByText('Policy applied.')).toBeInTheDocument();
  });

  it('shows API refusals in words (second person required)', async () => {
    const a = fakeApi({ account: async () => ops, opsMfaPolicy: async () => state({ pending: [change()] }), opsMfaDecide: async () => { throw new ApiError(403, 'second_person_required'); } });
    renderApp(<OpsMfaPage />, { api: a });
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    expect((await screen.findAllByText('You proposed this change, so a different person must approve it.')).length).toBeGreaterThan(0);
  });

  it('renders history with who decided and the direct mark, in Arabic RTL with no accessibility violations', async () => {
    const hist = [change({ id: 'H1', status: 'applied', decided_by_name: 'Sara', decided_at: new Date().toISOString(), applied_directly: true })];
    const { container } = renderApp(<OpsMfaPage />, { lang: 'ar', api: fakeApi({ account: async () => ops, opsMfaPolicy: async () => state({ changes: hist, pending: [change()] }) }) });
    expect(await screen.findByText('سياسة التحقق بخطوتين')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(translate('ar', 'mfa.direct')))).toBeInTheDocument();
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(await a11yViolations(container)).toEqual([]);
  });

  it('English page has no accessibility violations either, including the rule editor', async () => {
    const { container } = renderApp(<OpsMfaPage />, { api: fakeApi({ account: async () => ops, opsMfaPolicy: async () => state({ policy: { enabled: true, rules: [{ scope: 'all', roles: ['owner'] }] }, pending: [change()] }) }) });
    await screen.findAllByText('Mandatory');
    await userEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    expect(await a11yViolations(container)).toEqual([]);
  });
});

describe('Security page: policy-required wording', () => {
  it('tells a person their organisation requires it, and nudges one who has not set it up', async () => {
    renderApp(<SecurityPage />, { api: fakeApi({ account: async () => ({ ...ACCOUNT, mfa_required: true, mfa_required_by: 'policy' as const, totp_enrolled: false }) }) });
    expect(await screen.findByText(/Two-step verification is required for your account. Set it up now/)).toBeInTheDocument();
  });
  it('an enrolled person under a policy cannot turn it off', async () => {
    renderApp(<SecurityPage />, { api: fakeApi({ account: async () => ({ ...ACCOUNT, mfa_required: true, mfa_required_by: 'policy' as const, totp_enrolled: true }) }) });
    expect(await screen.findByText('Your organisation requires two-step verification, so it cannot be turned off.')).toBeInTheDocument();
  });
});
