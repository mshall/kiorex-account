// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type Dependant, type LinkView } from '../src/api';
import { SecurityPage } from '../src/pages/Security';
import { FamilyPage } from '../src/pages/Family';
import { PrivacyPage } from '../src/pages/Privacy';
import { OrgsPage } from '../src/pages/Orgs';
import { OpsLinksPage } from '../src/pages/OpsLinks';
import { AppsPage } from '../src/pages/Apps';
import { StepUpPage } from '../src/pages/StepUp';
import { ACCOUNT, a11yViolations, fakeApi, renderApp } from './harness';

const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const dep = (over: Partial<Dependant> = {}): Dependant => ({ link_id: 'L1', dependant_sub: 'D1', name: 'Yara', dob: '2018-03-04', relationship: 'parent', evidence_type: 'self_declared', status: 'active', expires_at: iso(3000), ended_reason: null, ...over });

describe('Security page', () => {
  const sessions = [
    { session_id: 's1', current: true, device: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0 Safari/537.36', ip: '127.0.0.1', created_at: iso(-1), last_seen_at: iso(0), clients: ['kiorex-passport-web'] },
    { session_id: 's2', current: false, device: null, ip: null, created_at: iso(-2), last_seen_at: null, clients: ['kiorex-web', 'kiorex-mobile'] },
  ];
  const api = () => fakeApi({
    passkeys: async () => [{ credential_id: 'abcdef123456', device_type: 'multiDevice', backed_up: true, created_at: iso(-3) }],
    sessions: async () => sessions, securityEvents: async () => [{ id: 1, at: iso(-1), type: 'login.success', data: { client: 'kiorex-web' } }, { id: 2, at: iso(-1), type: 'passkey.registered', data: {} }],
    passkeyRemove: async () => undefined, revokeSession: async () => undefined, revokeOtherSessions: async () => undefined,
  });

  it('lists passkeys, sessions (current marked) and friendly recent events', async () => {
    renderApp(<SecurityPage />, { api: api() });
    expect(await screen.findByText('Synced passkey')).toBeInTheDocument();
    const ses = await screen.findByRole('list', { name: 'Active sessions' });
    expect(within(ses).getByText('This session')).toBeInTheDocument();
    expect(within(ses).getByText('Chrome - macOS')).toBeInTheDocument();
    expect(within(ses).getByText('Unknown device')).toBeInTheDocument();
    expect(within(ses).getByText(/Kiorex patient web, Kiorex mobile app/)).toBeInTheDocument();
    const ev = await screen.findByRole('list', { name: 'Recent sign-in activity' });
    expect(within(ev).getByText('Signed in (via Kiorex patient web)')).toBeInTheDocument();
    expect(within(ev).getByText('Passkey added')).toBeInTheDocument();
  });

  it('removing a passkey asks first, then calls the API and reloads', async () => {
    const a = api(); renderApp(<SecurityPage />, { api: a });
    await userEvent.click(await screen.findByRole('button', { name: /Remove - abcdef12/ }));
    expect(await screen.findByRole('dialog', { name: 'Remove this passkey?' })).toBeInTheDocument();
    expect(a.passkeyRemove).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(a.passkeyRemove).toHaveBeenCalledWith('abcdef123456'));
  });

  it('only other sessions can be signed out; "sign out all others" calls the API', async () => {
    const a = api(); renderApp(<SecurityPage />, { api: a });
    const ses = await screen.findByRole('list', { name: 'Active sessions' });
    expect(within(ses).getAllByRole('button', { name: 'Sign out' })).toHaveLength(1); // not for the current session
    await userEvent.click(screen.getByRole('button', { name: 'Sign out all other sessions' }));
    await waitFor(() => expect(a.revokeOtherSessions).toHaveBeenCalled());
  });

  it('shows the authenticator-app state: required roles cannot turn it off; others get a step-up retry on disable', async () => {
    const a = fakeApi({ account: async () => ({ ...ACCOUNT, totp_enrolled: true, mfa_required: true }), securityEvents: async () => [] });
    const first = renderApp(<SecurityPage />, { api: a });
    expect(await screen.findByText('Your role requires two-step verification, so it cannot be turned off.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
    first.unmount();

    const calls: string[] = [];
    const b = fakeApi({
      account: async () => ({ ...ACCOUNT, totp_enrolled: true }), securityEvents: async () => [],
      totpDisable: async () => { calls.push('disable'); if (calls.length === 1) throw new ApiError(403, 'step_up_required', { max_age: 300 }); },
      stepUpTotp: async () => { calls.push('stepup'); return { access_token: 'FRESH', expires_in: 300, acr: 'mfa', amr: ['totp', 'mfa'] }; },
    });
    const { auth } = renderApp(<SecurityPage />, { api: b });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Turn off' }));
    const su = await screen.findByRole('dialog', { name: 'Extra verification' });
    await userEvent.type(within(su).getByLabelText('Authenticator code'), '123456');
    await userEvent.click(within(su).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(calls).toEqual(['disable', 'stepup', 'disable']));
    expect(auth.token()).toBe('FRESH'); // the fresh acr=mfa token replaced the old one
  });

  it('has no axe violations in English and Arabic', async () => {
    for (const lang of ['en', 'ar'] as const) {
      const { container, unmount } = renderApp(<SecurityPage />, { api: api(), lang });
      await screen.findByRole('list', { name: lang === 'en' ? 'Active sessions' : 'الجلسات النشطة' });
      expect(await a11yViolations(container)).toEqual([]);
      unmount();
    }
  });
});

describe('Family page', () => {
  it('validates a national-ID-like reference and a future birth date before calling the API', async () => {
    const a = fakeApi({ dependants: async () => [], addDependant: async () => ({ dependant_sub: 'D' }) });
    renderApp(<FamilyPage />, { api: a });
    await screen.findByText('You have not added a dependant yet.');
    await userEvent.type(screen.getByLabelText('Full name'), 'Yara');
    await userEvent.type(screen.getByLabelText('Date of birth'), '2018-03-04');
    await userEvent.selectOptions(screen.getByLabelText('Evidence type'), 'birth_certificate_ref');
    await userEvent.type(screen.getByLabelText('Document reference'), '29801011234567');
    await userEvent.click(screen.getByRole('button', { name: 'Add dependant' }));
    expect(await screen.findByText(/looks like a national ID number/)).toBeInTheDocument();
    expect(a.addDependant).not.toHaveBeenCalled();
  });

  it('submits the evidence the way the API expects and refreshes the list', async () => {
    const a = fakeApi({ dependants: vi.fn().mockResolvedValueOnce([]).mockResolvedValue([dep()]), addDependant: async () => ({ dependant_sub: 'D1' }) });
    renderApp(<FamilyPage />, { api: a });
    await screen.findByText('You have not added a dependant yet.');
    await userEvent.type(screen.getByLabelText('Full name'), 'Yara');
    await userEvent.type(screen.getByLabelText('Date of birth'), '2018-03-04');
    await userEvent.click(screen.getByRole('button', { name: 'Add dependant' }));
    await waitFor(() => expect(a.addDependant).toHaveBeenCalledWith({ name: 'Yara', dob: '2018-03-04', relationship: 'parent', evidence: { type: 'self_declared' } }));
    expect(await screen.findByRole('listitem', { name: 'Yara' })).toBeInTheDocument();
  });

  it('shows the age-of-majority notice: a warning when it is near, an informational line otherwise', async () => {
    renderApp(<FamilyPage />, { api: fakeApi({ dependants: async () => [dep({ name: 'Near', dob: '2008-12-04', expires_at: iso(14) }), dep({ link_id: 'L2', dependant_sub: 'D2', name: 'Far', expires_at: iso(2000) })] }) });
    const near = await screen.findByRole('listitem', { name: 'Near' });
    expect(within(near).getByText(/Turns 18 on .*, in 14 day\(s\)/)).toBeInTheDocument();
    const far = screen.getByRole('listitem', { name: 'Far' });
    expect(within(far).getByText(/ends automatically on .*when Far reaches the age of majority \(18\)/)).toBeInTheDocument();
    expect(far.querySelector('[data-needs-human="majority"]')).not.toBeNull();
  });

  it('accepts and declines co-guardian invitations', async () => {
    const a = fakeApi({ dependants: async () => [dep({ status: 'pending', link_id: 'P1', name: 'Omar' }), dep({ status: 'pending', link_id: 'P2', name: 'Nour' })], acceptGuardianLink: async () => undefined, declineGuardianLink: async () => undefined });
    renderApp(<FamilyPage />, { api: a });
    await userEvent.click(await screen.findByRole('button', { name: 'Accept - Omar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decline - Nour' }));
    await waitFor(() => { expect(a.acceptGuardianLink).toHaveBeenCalledWith('P1'); expect(a.declineGuardianLink).toHaveBeenCalledWith('P2'); });
  });

  it('act-as: requires at least one scope and requests exactly the selected scopes', async () => {
    const a = fakeApi({ dependants: async () => [dep()], actAs: async () => ({ access_token: 'T', expires_in: 600, scope: 'dependant:profile dependant:booking', link_id: 'L1' }) });
    renderApp(<FamilyPage />, { api: a });
    await userEvent.click(await screen.findByRole('button', { name: 'Act as Yara' }));
    const dlg = screen.getByRole('dialog');
    await userEvent.click(within(dlg).getByLabelText('Give and withdraw consent for them'));
    await userEvent.click(within(dlg).getByRole('button', { name: 'Continue as guardian' }));
    await waitFor(() => expect(a.actAs).toHaveBeenCalledWith('D1', ['dependant:profile', 'dependant:booking']));
    expect(await within(dlg).findByTestId('act-as-ready')).toHaveTextContent('You can act for Yara for 10 minute(s).');
    expect(within(dlg).getByRole('link', { name: 'Open Kiorex as Yara' })).toHaveAttribute('href', 'http://localhost:5180');
  });

  it('has no axe violations (Arabic, RTL) with content', async () => {
    const { container } = renderApp(<FamilyPage />, { api: fakeApi({ dependants: async () => [dep(), dep({ status: 'pending', link_id: 'P', name: 'Omar' })] }), lang: 'ar' });
    await screen.findByRole('listitem', { name: 'Yara' });
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(await a11yViolations(container)).toEqual([]);
  });
});

describe('Privacy page', () => {
  it('delete needs the acknowledgement AND the typed word, then a confirmation, then calls the API', async () => {
    const a = fakeApi({ deleteAccount: async () => undefined });
    renderApp(<PrivacyPage />, { api: a });
    const del = await screen.findByRole('button', { name: 'Delete my account permanently' });
    expect(del).toBeDisabled();
    await userEvent.click(screen.getByLabelText('I understand that my account will be deleted permanently.'));
    expect(del).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Type DELETE to confirm'), 'delete');
    expect(del).toBeEnabled();
    await userEvent.click(del);
    expect(a.deleteAccount).not.toHaveBeenCalled();
    const dlg = await screen.findByRole('dialog', { name: 'Delete your account now?' });
    await userEvent.click(within(dlg).getByRole('button', { name: 'Delete my account permanently' }));
    await waitFor(() => expect(a.deleteAccount).toHaveBeenCalled());
  });

  it('lists every consequence and flags the wording as draft; Arabic uses the Arabic confirmation word', async () => {
    const en = renderApp(<PrivacyPage />);
    await screen.findByRole('button', { name: 'Download my data' });
    expect(screen.getAllByRole('listitem').filter((li) => li.closest('.consequences'))).toHaveLength(7);
    expect(en.container.querySelector('[data-needs-human="deletion"]')).not.toBeNull();
    en.unmount();
    renderApp(<PrivacyPage />, { lang: 'ar' });
    await userEvent.type(await screen.findByLabelText('اكتب حذف للتأكيد'), 'حذف');
    await userEvent.click(screen.getByLabelText('أفهم أن حسابي سيُحذف نهائيًا.'));
    expect(screen.getByRole('button', { name: 'حذف حسابي نهائيًا' })).toBeEnabled();
  });
});

describe('Organisations page', () => {
  const m = (role: string) => ({ org_id: 'O1', legal_name: 'Nile Clinic', country: 'EG', membership_id: 'M1', role_hint: role, status: 'active', effective_from: iso(-30) });
  it('accepts a pending invitation by id and explains that a role is only a hint', async () => {
    const a = fakeApi({ orgs: async () => [], pendingInvitations: async () => [{ invitation_id: 'I1', org_id: 'O1', legal_name: 'Nile Clinic', role_hint: 'doctor', expires_at: iso(5), invited_by_name: 'Dr Owner' }], acceptInvitation: async () => ({ org_id: 'O1', role_hint: 'doctor' }) });
    renderApp(<OrgsPage />, { api: a });
    expect(await screen.findByText('Dr Owner invited you to join Nile Clinic as Doctor.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept - Nile Clinic' }));
    await waitFor(() => expect(a.acceptInvitation).toHaveBeenCalledWith('I1'));
  });
  it('lists sent invitations with masked phone and revokes a pending one after confirmation', async () => {
    const sent = [
      { invitation_id: 'V1', role_hint: 'nurse', invitee_phone_masked: '+201****03', invited_by: 'S1', created_at: iso(-1), expires_at: iso(6), status: 'pending' as const },
      { invitation_id: 'V2', role_hint: 'doctor', invitee_phone_masked: '+201****04', invited_by: 'S1', created_at: iso(-9), expires_at: iso(-2), status: 'expired' as const },
    ];
    const a = fakeApi({ orgs: async () => [m('owner')], orgMembers: async () => [], sentInvitations: async () => sent, revokeInvitation: async () => undefined });
    renderApp(<OrgsPage />, { api: a });
    const card = await screen.findByRole('listitem', { name: 'Nile Clinic' });
    await userEvent.click(within(card).getByRole('button', { name: 'Manage members' }));
    const list = await screen.findByRole('list', { name: 'Sent invitations' });
    expect(list).toHaveTextContent('+201****03');
    expect(within(list).getAllByRole('button')).toHaveLength(1); // only the pending one can be revoked
    await userEvent.click(within(list).getByRole('button', { name: /Revoke/ }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(a.revokeInvitation).toHaveBeenCalledWith('O1', 'V1'));
  });
  it('shows member management only to owners/admins; every role carries the no-clinical-access note', async () => {
    const owner = renderApp(<OrgsPage />, { api: fakeApi({ orgs: async () => [m('owner')] }) });
    const card = await screen.findByRole('listitem', { name: 'Nile Clinic' });
    expect(within(card).getByRole('button', { name: 'Manage members' })).toBeInTheDocument();
    expect(card).toHaveTextContent('A role hint does not grant clinical access.');
    owner.unmount();
    renderApp(<OrgsPage />, { api: fakeApi({ orgs: async () => [m('doctor')] }) });
    const c2 = await screen.findByRole('listitem', { name: 'Nile Clinic' });
    expect(within(c2).queryByRole('button', { name: 'Manage members' })).toBeNull();
    expect(within(c2).getByRole('button', { name: 'Leave organisation' })).toBeInTheDocument();
  });
  it('shows each membership with its edition (Clinic and Nurse side by side), AR and EN; create form offers the edition', async () => {
    const mm = (id: string, name: string, edition: string, role: string) => ({ ...m(role), org_id: id, membership_id: `M-${id}`, legal_name: name, edition });
    const a = fakeApi({ orgs: async () => [mm('O1', 'Nile Clinic', 'CLINIC', 'nurse'), mm('O2', 'Omar Home Nursing', 'NURSE', 'owner'), mm('O3', 'Giza Agency', 'NURSE', 'physiotherapist')], createOrg: vi.fn(async () => ({ org_id: 'O9' })) });
    renderApp(<OrgsPage />, { api: a });
    expect(await screen.findByRole('listitem', { name: 'Nile Clinic' })).toHaveTextContent('Kiorly Clinic');
    expect(screen.getByRole('listitem', { name: 'Omar Home Nursing' })).toHaveTextContent('Kiorly Nurse');
    expect(screen.getByRole('listitem', { name: 'Giza Agency' })).toHaveTextContent('Physiotherapist');
    await userEvent.type(screen.getByLabelText('Legal name'), 'New Agency');
    await userEvent.selectOptions(screen.getByLabelText('Edition'), 'NURSE');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(a.createOrg).toHaveBeenCalledWith({ legal_name: 'New Agency', country: 'EG', edition: 'NURSE' }));
  });
  it('accepts an invitation code from the link (?invite=) and shows API errors in words', async () => {
    const token = 'x'.repeat(32);
    const a = fakeApi({ orgs: async () => [], acceptInvitationToken: async () => { throw new ApiError(410, 'invitation_used'); } });
    renderApp(<OrgsPage />, { api: a, path: `/account/orgs?invite=${token}` });
    const input = await screen.findByLabelText(/Invitation code/);
    expect(input).toHaveValue(token);
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(await screen.findByText('That invitation was already used.')).toBeInTheDocument();
  });
});

describe('Ops link review page', () => {
  const link = (over: Partial<LinkView> = {}): LinkView => ({ link_id: 'K1', status: 'pending_review', primary_sub: 'P', secondary_sub: 'S', conflicts: [{ code: 'name_mismatch', severity: 'blocking', detail: { primary: 'Mona', secondary: 'Monica' } }], resolution: null, requested_at: iso(-1), verified_at: iso(-1), reviewed_by: null, reviewed_at: null, review_note: null, ...over });
  const ops = { ...ACCOUNT, roles: ['ops_admin'], mfa_required: true, totp_enrolled: true };

  it('is closed to non-ops accounts', async () => {
    renderApp(<OpsLinksPage />);
    expect(await screen.findByText('This page is for operations staff.')).toBeInTheDocument();
  });
  it('approve stays disabled until every blocking conflict has a decision, then sends the resolution + note', async () => {
    const a = fakeApi({ account: async () => ops, opsLinks: async () => [link()], opsLinkAction: async () => link({ status: 'merged' }) });
    renderApp(<OpsLinksPage />, { api: a });
    const approve = await screen.findByRole('button', { name: 'Approve merge' });
    expect(approve).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Other account: Monica'));
    await userEvent.type(screen.getByLabelText('Note for the record (optional)'), 'ok');
    expect(approve).toBeEnabled();
    await userEvent.click(approve);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve merge' }));
    await waitFor(() => expect(a.opsLinkAction).toHaveBeenCalledWith('K1', 'approve', { resolution: { name: 'secondary' }, note: 'ok' }));
  });
  it('a reviewer needing a fresh MFA step-up gets the step-up dialog and the action is retried once', async () => {
    let n = 0;
    const a = fakeApi({ account: async () => ops, opsLinks: async () => [link({ conflicts: [] })],
      opsLinkAction: async () => { n += 1; if (n === 1) throw new ApiError(403, 'step_up_required'); return link({ status: 'merged' }); },
      stepUpTotp: async () => ({ access_token: 'F', expires_in: 300, acr: 'mfa', amr: ['mfa'] }) });
    renderApp(<OpsLinksPage />, { api: a });
    await userEvent.click(await screen.findByRole('button', { name: 'Approve merge' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve merge' }));
    const su = await screen.findByRole('dialog', { name: 'Extra verification' });
    await userEvent.type(within(su).getByLabelText('Authenticator code'), '654321');
    await userEvent.click(within(su).getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(n).toBe(2));
  });
  it('cancelling the step-up leaves the request untouched', async () => {
    const a = fakeApi({ account: async () => ops, opsLinks: async () => [link({ conflicts: [] })], opsLinkAction: async () => { throw new ApiError(403, 'step_up_required'); } });
    renderApp(<OpsLinksPage />, { api: a });
    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject' }));
    const su = await screen.findByRole('dialog', { name: 'Extra verification' });
    await userEvent.click(within(su).getByLabelText('Close'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Extra verification' })).toBeNull());
    expect(a.opsLinkAction).toHaveBeenCalledTimes(1);
  });
});

describe('Apps and step-up pages', () => {
  it('lists connected apps with plain-language scopes; the current app cannot be removed', async () => {
    const a = fakeApi({ connectedApps: async () => [
      { client_id: 'kiorex-passport-web', name: 'Kiorex Passport (self-service web)', scopes: ['openid', 'phone'], first_granted_at: iso(-1), last_granted_at: iso(-1) },
      { client_id: 'kiorex-web', name: 'Kiorex patient web', scopes: ['openid', 'profile', 'kx_org'], first_granted_at: iso(-5), last_granted_at: iso(-2) }], revokeApp: async () => undefined });
    renderApp(<AppsPage />, { api: a });
    const web = await screen.findByRole('listitem', { name: 'Kiorex patient web' });
    expect(within(web).getByText('Your organisation memberships')).toBeInTheDocument();
    expect(within(screen.getByRole('listitem', { name: /Passport/ })).queryByRole('button')).toBeNull();
    await userEvent.click(within(web).getByRole('button', { name: /Remove access/ }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove access' }));
    await waitFor(() => expect(a.revokeApp).toHaveBeenCalledWith('kiorex-web'));
  });

  it('step-up page: wrong code shows the error, no second factor shows guidance', async () => {
    const a = fakeApi({ account: async () => ({ ...ACCOUNT, totp_enrolled: true }), stepUpTotp: async () => { throw new ApiError(400, 'totp_wrong', { attempts_left: 4 }); } });
    const { unmount } = renderApp(<StepUpPage />, { api: a, path: '/account/step-up?return=/account/ops/links' });
    await userEvent.type(await screen.findByLabelText('Authenticator code'), '111111');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('That code is not correct.')).toBeInTheDocument();
    unmount();
    renderApp(<StepUpPage />, { api: fakeApi({ meta: async () => ({ ...(await import('./harness')).META, passkeys_enabled: false }) }) });
    expect(await screen.findByText(/You have no second factor yet/)).toBeInTheDocument();
  });
});
