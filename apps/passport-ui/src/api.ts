import type { AuthLike } from './auth';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, readonly extra: Record<string, unknown> = {}) { super(code); }
}

export interface Account { sub: string; name: string | null; phone: string | null; phone_verified: boolean; locale: 'ar' | 'en'; roles: string[]; kind: string; mfa_required: boolean; totp_enrolled: boolean; acr: string | null; amr: string[]; auth_time: number | null }
export interface EmailState { email: string | null; email_verified: boolean; pending: boolean }
export interface ScimToken { token_id: string; label: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
export interface ScimTokenCreated { token_id: string; label: string; token: string; scim_base_url: string }
export interface Meta {
  passkeys_enabled: boolean;
  guardian: { age_of_majority: Record<string, number>; default_market: string; evidence_types: string[]; relationships: string[]; act_scopes: string[]; max_dependants: number; act_as_ttl_seconds: number };
  orgs: { role_hints: string[]; editions?: string[]; default_edition?: string; invitation_ttl_days: number };
  step_up: { freshness_seconds: number; sensitive_actions: string[]; acr_mfa: string };
  mfa_required_roles: string[];
}
export interface Passkey { credential_id: string; device_type: string | null; backed_up: boolean | null; created_at: string }
export interface SessionRow { session_id: string; current: boolean; device: string | null; ip: string | null; created_at: string | null; last_seen_at: string | null; clients: string[] }
export interface SecurityEvent { id: number; at: string; type: string; data: { client?: string; amr?: string[]; acr?: string; method?: string; reason?: string; upstream?: string } }
export interface Dependant { link_id: string; dependant_sub: string; name: string; dob: string; relationship: string; evidence_type: string; status: 'pending' | 'active' | 'revoked' | 'expired'; expires_at: string; ended_reason: string | null }
export interface AddDependantBody { name: string; dob: string; relationship: string; evidence: { type: string; reference?: string } }
export interface ActAsResult { access_token: string; expires_in: number; scope: string; link_id: string }
export interface Conflict { code: string; severity: 'blocking' | 'info'; detail: Record<string, unknown> }
export interface LinkView { link_id: string; status: string; primary_sub: string; secondary_sub: string; conflicts: Conflict[]; resolution: unknown; requested_at: string; verified_at: string | null; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null }
export interface Resolution { name?: 'primary' | 'secondary'; membership_roles?: Record<string, string> }
export interface Membership { org_id: string; legal_name: string; country: string; edition?: string; membership_id: string; role_hint: string; status: string; effective_from: string }
export interface OrgMember { membership_id: string; sub: string; name: string | null; role_hint: string; status: string; effective_from: string }
export interface PendingInvitation { invitation_id: string; org_id: string; legal_name: string; role_hint: string; expires_at: string; invited_by_name: string | null }
export interface SentInvitation { invitation_id: string; role_hint: string; invitee_phone_masked: string; invited_by: string; created_at: string; expires_at: string; status: 'pending' | 'accepted' | 'expired' | 'revoked' }
export interface ConnectedApp { client_id: string; name: string; scopes: string[]; first_granted_at: string | null; last_granted_at: string | null }
export interface StepUpResult { access_token: string; expires_in: number; acr: string; amr: string[] }
export interface FederatedIdentity { upstream_id: string; upstream_sub: string; email: string | null; display_name: string | null; linked_at: string }

export interface Api {
  account(): Promise<Account>;
  updateProfile(p: { name?: string; locale?: 'ar' | 'en' }): Promise<{ name: string | null; locale: 'ar' | 'en' }>;
  meta(): Promise<Meta>;
  emailState(): Promise<EmailState>;
  emailStart(email: string): Promise<{ status: 'code_sent'; expires_in: number }>;
  emailVerify(code: string): Promise<{ email: string; email_verified: true }>;
  emailRemove(): Promise<void>;
  passkeys(): Promise<Passkey[]>;
  passkeyOptions(): Promise<unknown>;
  passkeyVerify(att: unknown): Promise<void>;
  passkeyRemove(id: string): Promise<void>;
  totpEnroll(): Promise<{ secret: string; otpauth_uri: string }>;
  totpConfirm(code: string): Promise<void>;
  totpDisable(): Promise<void>;
  sessions(): Promise<SessionRow[]>;
  revokeSession(id: string): Promise<void>;
  revokeOtherSessions(): Promise<void>;
  securityEvents(limit?: number): Promise<SecurityEvent[]>;
  dependants(): Promise<Dependant[]>;
  addDependant(b: AddDependantBody): Promise<{ dependant_sub: string }>;
  inviteCoGuardian(dependantSub: string, b: { phone: string; relationship: string; evidence: { type: string; reference?: string } }): Promise<void>;
  acceptGuardianLink(id: string): Promise<void>;
  declineGuardianLink(id: string): Promise<void>;
  revokeDependant(dependantSub: string): Promise<void>;
  actAs(dependantSub: string, scope: string[]): Promise<ActAsResult>;
  links(): Promise<LinkView[]>;
  requestLink(phone: string): Promise<{ link_id: string; status: string }>;
  verifyLink(id: string, code: string): Promise<LinkView>;
  cancelLink(id: string): Promise<void>;
  opsLinks(status: string): Promise<LinkView[]>;
  opsLinkAction(id: string, action: 'approve' | 'reject' | 'reverse', body: { resolution?: Resolution; note?: string }): Promise<LinkView>;
  federationIdentities(): Promise<FederatedIdentity[]>;
  federationUnlink(upstream: string, sub: string): Promise<void>;
  orgs(): Promise<Membership[]>;
  createOrg(b: { legal_name: string; country: string; edition?: string }): Promise<{ org_id: string }>;
  orgMembers(orgId: string): Promise<OrgMember[]>;
  inviteMember(orgId: string, b: { phone: string; role_hint: string; locale?: string }): Promise<void>;
  changeRole(orgId: string, sub: string, role: string): Promise<void>;
  removeMember(orgId: string, sub: string): Promise<void>;
  sentInvitations(orgId: string): Promise<SentInvitation[]>;
  revokeInvitation(orgId: string, invitationId: string): Promise<void>;
  pendingInvitations(): Promise<PendingInvitation[]>;
  acceptInvitation(id: string): Promise<{ org_id: string; role_hint: string }>;
  acceptInvitationToken(token: string): Promise<{ org_id: string; role_hint: string }>;
  declineInvitation(id: string): Promise<void>;
  scimTokens(orgId: string): Promise<ScimToken[]>;
  createScimToken(orgId: string, label: string): Promise<ScimTokenCreated>;
  revokeScimToken(orgId: string, tokenId: string): Promise<void>;
  connectedApps(): Promise<ConnectedApp[]>;
  revokeApp(clientId: string): Promise<void>;
  exportData(): Promise<Record<string, unknown>>;
  deleteAccount(): Promise<void>;
  stepUpPolicy(action: string): Promise<{ step_up_required: boolean; satisfied: boolean; max_age: number }>;
  stepUpTotp(code: string): Promise<StepUpResult>;
  stepUpPasskeyOptions(): Promise<unknown>;
  stepUpPasskey(response: unknown): Promise<StepUpResult>;
}

/** Thin typed client over the dev-IdP /api. 401 -> one refresh attempt, then the session is treated as ended. */
export function createApi(baseUrl: string, auth: AuthLike, doFetch: typeof fetch = (...a) => fetch(...a)): Api {
  async function call<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    let token = auth.token();
    if (!token && !retried && (await auth.refresh())) token = auth.token();
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch { throw new ApiError(0, 'network'); }
    if (res.status === 401) {
      if (!retried && (await auth.refresh())) return call<T>(method, path, body, true);
      auth.expired();
      throw new ApiError(401, 'invalid_token');
    }
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* non-JSON */ }
    if (!res.ok) { const { error, ...extra } = json; throw new ApiError(res.status, String(error ?? 'unknown'), extra); }
    return json as T;
  }
  const enc = encodeURIComponent;
  return {
    account: () => call('GET', '/api/account'),
    updateProfile: (p) => call('PATCH', '/api/account', p),
    meta: () => call('GET', '/api/meta'),
    emailState: () => call('GET', '/api/email'),
    emailStart: (email) => call('POST', '/api/email', { email }),
    emailVerify: (code) => call('POST', '/api/email/verify', { code }),
    emailRemove: async () => { await call('DELETE', '/api/email'); },
    passkeys: async () => (await call<{ passkeys: Passkey[] }>('GET', '/api/passkeys')).passkeys,
    passkeyOptions: () => call('POST', '/api/passkeys/register/options', {}),
    passkeyVerify: async (att) => { await call('POST', '/api/passkeys/register/verify', att); },
    passkeyRemove: async (id) => { await call('DELETE', `/api/passkeys/${enc(id)}`); },
    totpEnroll: () => call('POST', '/api/totp/enroll', {}),
    totpConfirm: async (code) => { await call('POST', '/api/totp/confirm', { code }); },
    totpDisable: async () => { await call('DELETE', '/api/totp'); },
    sessions: async () => (await call<{ sessions: SessionRow[] }>('GET', '/api/sessions')).sessions,
    revokeSession: async (id) => { await call('DELETE', `/api/sessions/${enc(id)}`); },
    revokeOtherSessions: async () => { await call('DELETE', '/api/sessions'); },
    securityEvents: async (limit = 20) => (await call<{ events: SecurityEvent[] }>('GET', `/api/security/events?limit=${limit}`)).events,
    dependants: async () => (await call<{ dependants: Dependant[] }>('GET', '/api/dependants')).dependants,
    addDependant: (b) => call('POST', '/api/dependants', b),
    inviteCoGuardian: async (sub, b) => { await call('POST', `/api/dependants/${enc(sub)}/co-guardians`, b); },
    acceptGuardianLink: async (id) => { await call('POST', `/api/guardian-links/${enc(id)}/accept`, {}); },
    declineGuardianLink: async (id) => { await call('POST', `/api/guardian-links/${enc(id)}/decline`, {}); },
    revokeDependant: async (sub) => { await call('DELETE', `/api/dependants/${enc(sub)}`); },
    actAs: (sub, scope) => call('POST', '/api/guardian/act-as', { dependant_sub: sub, scope }),
    links: async () => (await call<{ links: LinkView[] }>('GET', '/api/links')).links,
    requestLink: (phone) => call('POST', '/api/links', { phone }),
    verifyLink: (id, code) => call('POST', `/api/links/${enc(id)}/verify`, { code }),
    cancelLink: async (id) => { await call('DELETE', `/api/links/${enc(id)}`); },
    opsLinks: async (status) => (await call<{ links: LinkView[] }>('GET', `/api/ops/links?status=${enc(status)}`)).links,
    opsLinkAction: (id, action, body) => call('POST', `/api/ops/links/${enc(id)}/${action}`, body),
    federationIdentities: async () => (await call<{ identities: FederatedIdentity[] }>('GET', '/api/federation/identities')).identities,
    federationUnlink: async (u, s) => { await call('DELETE', `/api/federation/identities/${enc(u)}/${enc(s)}`); },
    orgs: async () => (await call<{ memberships: Membership[] }>('GET', '/api/orgs')).memberships,
    createOrg: (b) => call('POST', '/api/orgs', b),
    orgMembers: async (id) => (await call<{ members: OrgMember[] }>('GET', `/api/orgs/${enc(id)}/members`)).members,
    inviteMember: async (id, b) => { await call('POST', `/api/orgs/${enc(id)}/invitations`, b); },
    changeRole: async (id, sub, role) => { await call('PATCH', `/api/orgs/${enc(id)}/members/${enc(sub)}`, { role_hint: role }); },
    removeMember: async (id, sub) => { await call('DELETE', `/api/orgs/${enc(id)}/members/${enc(sub)}`); },
    sentInvitations: async (id) => (await call<{ invitations: SentInvitation[] }>('GET', `/api/orgs/${enc(id)}/invitations`)).invitations,
    revokeInvitation: async (id, inv) => { await call('DELETE', `/api/orgs/${enc(id)}/invitations/${enc(inv)}`); },
    pendingInvitations: async () => (await call<{ invitations: PendingInvitation[] }>('GET', '/api/invitations')).invitations,
    acceptInvitation: (id) => call('POST', `/api/invitations/${enc(id)}/accept`, {}),
    acceptInvitationToken: (token) => call('POST', '/api/invitations/accept', { token }),
    declineInvitation: async (id) => { await call('POST', `/api/invitations/${enc(id)}/decline`, {}); },
    scimTokens: async (id) => (await call<{ tokens: ScimToken[] }>('GET', `/api/orgs/${enc(id)}/scim-tokens`)).tokens,
    createScimToken: (id, label) => call('POST', `/api/orgs/${enc(id)}/scim-tokens`, { label }),
    revokeScimToken: async (id, tid) => { await call('DELETE', `/api/orgs/${enc(id)}/scim-tokens/${enc(tid)}`); },
    connectedApps: async () => (await call<{ apps: ConnectedApp[] }>('GET', '/api/connected-apps')).apps,
    revokeApp: async (id) => { await call('DELETE', `/api/connected-apps/${enc(id)}`); },
    exportData: () => call('GET', '/api/account/export'),
    deleteAccount: async () => { await call('DELETE', '/api/account'); },
    stepUpPolicy: (action) => call('GET', `/api/step-up/policy?action=${enc(action)}`),
    stepUpTotp: (code) => call('POST', '/api/step-up', { method: 'totp', code }),
    stepUpPasskeyOptions: () => call('POST', '/api/step-up/passkey/options', {}),
    stepUpPasskey: (response) => call('POST', '/api/step-up', { method: 'passkey', response }),
  };
}
