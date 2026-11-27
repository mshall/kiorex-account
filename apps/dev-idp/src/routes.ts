import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Account } from './accounts.js';
import { identityClaims } from './accounts.js';
import type { ApiDeps, Caller } from './api.js';
import { HttpError } from './services.js';
import { readBody, send, clientIp } from './http.js';
import { signAccessToken } from './tokens.js';

const seg = (p: string) => p.split('/').filter(Boolean);

async function json(req: IncomingMessage): Promise<Record<string, unknown>> {
  const b = await readBody(req);
  if (!b.length) return {};
  try {
    const v = JSON.parse(b.toString('utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch { throw new HttpError(400, 'invalid_json'); }
}

/** RFC 9470 style: the token's assurance is too low or too old for this action. */
export function stepUpChallenge(d: ApiDeps, caller: Caller): HttpError | undefined {
  const su = d.cfg.stepUp;
  const fresh = caller.authTime !== undefined && d.now() - caller.authTime <= su.freshnessSeconds;
  if (caller.acr === su.acr.mfa && fresh) return undefined;
  return new HttpError(403, 'step_up_required', { acr_values: su.acr.mfa, max_age: su.freshnessSeconds });
}

async function account(d: ApiDeps, caller: Caller): Promise<Account> {
  const a = await d.accounts.findBySub(caller.sub);
  if (!a) throw new HttpError(404, 'not_found');
  return a;
}

/** Ops reviewer: role hint ops_admin/super_admin held by the account AND a fresh MFA step-up (KA-10). */
async function opsReviewer(d: ApiDeps, caller: Caller): Promise<Account> {
  const a = await account(d, caller);
  if (!a.roles.some((r) => r === 'ops_admin' || r === 'super_admin')) throw new HttpError(403, 'ops_role_required');
  const ch = stepUpChallenge(d, caller);
  if (ch) throw ch;
  return a;
}

/** Auth events a person may see about their own account (never other subjects, never raw phone numbers). */
const SECURITY_EVENT_TYPES = ['login.success', 'passkey.login', 'passkey.login.failed', 'passkey.registered', 'passkey.removed', 'totp.enrolled', 'totp.disabled', 'totp.verified', 'totp.failed',
  'step_up.success', 'step_up.failed', 'session.revoked', 'federation.login', 'account.link.requested', 'account.link.verified', 'account.link.merged', 'account.link.reversed', 'guardian.act_as', 'app.access.revoked', 'account.profile.updated', 'email.verified', 'email.removed', 'email.verification.failed'];
const EVENT_DATA_KEYS = ['client', 'amr', 'acr', 'method', 'reason', 'upstream', 'uv'];
function pickEventData(data: Record<string, unknown> | null): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([k]) => EVENT_DATA_KEYS.includes(k)));
}

export function errorResponse(res: ServerResponse, e: unknown): void {
  if (e instanceof HttpError) {
    const headers: Record<string, string> = {};
    if (e.code === 'step_up_required') {
      headers['www-authenticate'] = `Bearer error="insufficient_user_authentication", error_description="A different authentication level is required", acr_values="${e.extra.acr_values}", max_age="${e.extra.max_age}"`;
    }
    return send(res, e.status, { error: e.code, ...e.extra }, headers);
  }
  throw e;
}

/** New identity APIs (KA-06/08/09/10/11). Returns true when the route was handled. */
export async function handleExtended(d: ApiDeps, caller: Caller, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const p = url.pathname; const m = req.method ?? 'GET'; const s = seg(p);
  const svc = d.svc;
  const ok = (status: number, body: unknown) => { send(res, status, body as object); return true; };

  // ---------------- self-service profile + policy (Passport web UI) ----------------
  if (p === '/api/account' && m === 'GET') {
    const a = await account(d, caller);
    return ok(200, {
      sub: a.sub, name: a.name, phone: a.phone, phone_verified: a.phone_verified, locale: a.locale, roles: a.roles, kind: a.kind,
      email: a.email_verified ? (a.email ?? null) : null, email_verified: a.email_verified === true, mfa_required: svc.totp.requiresMfa(a), totp_enrolled: await svc.totp.isEnrolled(a.sub), acr: caller.acr ?? null, amr: caller.amr ?? [], auth_time: caller.authTime ?? null,
    });
  }
  if (p === '/api/account' && m === 'PATCH') {
    const b = await json(req);
    const patch: { name?: string | null; locale?: 'ar' | 'en' } = {};
    if (b.name !== undefined) {
      const n = typeof b.name === 'string' ? b.name.trim() : null;
      if (n === null || n.length > 80) throw new HttpError(400, 'invalid_name');
      patch.name = n || null;
    }
    if (b.locale !== undefined) {
      if (b.locale !== 'ar' && b.locale !== 'en') throw new HttpError(400, 'invalid_locale', { allowed: ['ar', 'en'] });
      patch.locale = b.locale;
    }
    if (!Object.keys(patch).length) throw new HttpError(400, 'nothing_to_update');
    const a = await d.accounts.updateProfile(caller.sub, patch);
    if (!a) throw new HttpError(404, 'not_found');
    await d.audit.record('account.profile.updated', a.sub, { fields: Object.keys(patch) });
    return ok(200, { sub: a.sub, name: a.name, locale: a.locale });
  }
  // ---------------- e-mail verification (optional; email and email_verified claims) ----------------
  if (p === '/api/email' && m === 'GET') return ok(200, await svc.email.state(caller.sub));
  if (p === '/api/email' && m === 'POST') {
    const a = await account(d, caller);
    return ok(200, await svc.email.start(caller.sub, (await json(req)).email, a.locale));
  }
  if (p === '/api/email/verify' && m === 'POST') return ok(200, await svc.email.verify(caller.sub, (await json(req)).code));
  if (p === '/api/email' && m === 'DELETE') { await svc.email.remove(caller.sub); return ok(200, { status: 'removed' }); }
  if (p === '/api/meta' && m === 'GET') {
    const g = d.cfg.guardianship; const su = d.cfg.stepUp;
    return ok(200, {
      passkeys_enabled: d.passkeysEnabled,
      guardian: { age_of_majority: g.ageOfMajority, default_market: g.defaultMarket, evidence_types: g.evidenceTypes, relationships: ['parent', 'legal_guardian', 'grandparent', 'other_relative'], act_scopes: g.actScopes, max_dependants: g.maxDependantsPerGuardian, act_as_ttl_seconds: g.scopedTokenSeconds },
      orgs: { role_hints: d.cfg.orgs.roleHints, editions: d.cfg.orgs.editions, default_edition: d.cfg.orgs.defaultEdition, invitation_ttl_days: d.cfg.orgs.invitationTtlDays },
      step_up: { freshness_seconds: su.freshnessSeconds, sensitive_actions: su.sensitiveActions, acr_mfa: su.acr.mfa },
      mfa_required_roles: d.cfg.mfaPolicy.requiredForRoles,
    });
  }
  if (p === '/api/security/events' && m === 'GET') {
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20) || 20, 1), 100);
    const r = await d.pool.query(`SELECT seq, at, type, data FROM audit_events WHERE sub=$1 AND type = ANY($2) ORDER BY seq DESC LIMIT $3`, [caller.sub, SECURITY_EVENT_TYPES, limit]);
    return ok(200, { events: r.rows.map((e) => ({ id: Number(e.seq), at: e.at, type: e.type, data: pickEventData(e.data) })) });
  }

  // ---------------- KA-06 guardian links ----------------
  if (p === '/api/dependants' && m === 'GET') return ok(200, { dependants: await svc.guardian.list(caller.sub) });
  if (p === '/api/dependants' && m === 'POST') {
    const r = await svc.guardian.createDependant(await account(d, caller), await json(req));
    return ok(201, { dependant_sub: r.dependant.sub, link_id: r.link.id, status: r.link.status, expires_at: r.link.expires_at, age_of_majority: svc.guardian.ageOfMajority(r.dependant.market) });
  }
  if (s[0] === 'api' && s[1] === 'dependants' && s[2] && s[3] === 'co-guardians' && m === 'POST') {
    const l = await svc.guardian.inviteCoGuardian(await account(d, caller), s[2], await json(req));
    return ok(201, { link_id: l.id, status: l.status, expires_at: l.expires_at });
  }
  if (s[0] === 'api' && s[1] === 'dependants' && s[2] && s.length === 3 && m === 'DELETE') {
    const l = await svc.guardian.revoke(caller.sub, s[2]);
    return ok(200, { link_id: l.id, status: 'revoked' });
  }
  if (s[0] === 'api' && s[1] === 'guardian-links' && s[2] && s[3] === 'accept' && m === 'POST') {
    const l = await svc.guardian.accept(await account(d, caller), s[2]);
    return ok(200, { link_id: l.id, status: l.status });
  }
  if (s[0] === 'api' && s[1] === 'guardian-links' && s[2] && s[3] === 'decline' && m === 'POST') {
    const l = await svc.guardian.decline(await account(d, caller), s[2]);
    return ok(200, { link_id: l.id, status: l.status });
  }
  if (p === '/api/guardian/act-as' && m === 'POST') {
    const b = await json(req);
    if (typeof b.dependant_sub !== 'string') throw new HttpError(400, 'dependant_sub_required');
    const t = await svc.guardian.actAs({ sub: caller.sub, sid: caller.sid, clientId: caller.clientId, acr: caller.acr, amr: caller.amr }, b.dependant_sub, b.scope);
    return ok(200, { ...t, token_type: 'Bearer' });
  }

  // ---------------- KA-08 account linking (user side) ----------------
  if (p === '/api/links' && m === 'POST') {
    const r = await svc.linking.request(await account(d, caller), await json(req), clientIp(req, d.trustProxy));
    return ok(201, { link_id: r.id, status: r.status, next: 'POST /api/links/:id/verify with the code sent to the other number' });
  }
  if (p === '/api/links' && m === 'GET') return ok(200, { links: await svc.linking.listFor(caller.sub) });
  if (s[0] === 'api' && s[1] === 'links' && s[2] && s[3] === 'verify' && m === 'POST') {
    const l = await svc.linking.verify(await account(d, caller), s[2], (await json(req)).code);
    return ok(200, { ...svc.linking.view(l), note: 'Awaiting operator review. Accounts are never merged automatically.' });
  }
  if (s[0] === 'api' && s[1] === 'links' && s[2] && s.length === 3 && m === 'DELETE') { await svc.linking.cancel(await account(d, caller), s[2]); return ok(200, { status: 'cancelled' }); }

  // ---------------- KA-08 operator review (ops role + MFA step-up) ----------------
  if (s[0] === 'api' && s[1] === 'ops' && s[2] === 'links') {
    const reviewer = await opsReviewer(d, caller);
    if (s.length === 3 && m === 'GET') return ok(200, { links: await svc.linking.queue(url.searchParams.get('status') ?? 'pending_review') });
    if (s.length === 4 && m === 'GET') return ok(200, svc.linking.view(await svc.linking.get(s[3])));
    if (s.length === 5 && m === 'POST') {
      const b = await json(req);
      if (s[4] === 'approve') return ok(200, svc.linking.view(await svc.linking.approve(reviewer, s[3], b.resolution, b.note)));
      if (s[4] === 'reject') return ok(200, svc.linking.view(await svc.linking.reject(reviewer, s[3], b.note)));
      if (s[4] === 'reverse') return ok(200, svc.linking.view(await svc.linking.reverse(reviewer, s[3], b.note)));
    }
  }

  // ---------------- KA-09 organisations & memberships ----------------
  if (p === '/api/orgs' && m === 'POST') return ok(201, await svc.orgs.create(await account(d, caller), await json(req)));
  if (p === '/api/workspaces' && m === 'GET') return ok(200, { workspaces: await svc.orgs.workspaces(caller.sub) });
  if (p === '/api/orgs' && m === 'GET') return ok(200, { memberships: await svc.orgs.mine(caller.sub) });
  if (p === '/api/invitations' && m === 'GET') return ok(200, { invitations: await svc.orgs.pendingFor(await account(d, caller)) });
  if (s[0] === 'api' && s[1] === 'invitations' && s[2] && s[3] === 'accept' && m === 'POST') return ok(200, await svc.orgs.acceptById(await account(d, caller), s[2]));
  if (s[0] === 'api' && s[1] === 'invitations' && s[2] && s[3] === 'decline' && m === 'POST') { await svc.orgs.decline(await account(d, caller), s[2]); return ok(200, { status: 'declined' }); }
  if (p === '/api/invitations/accept' && m === 'POST') return ok(200, await svc.orgs.accept(await account(d, caller), (await json(req)).token));
  if (s[0] === 'api' && s[1] === 'orgs' && s[2]) {
    if (s[3] === 'members' && s.length === 4 && m === 'GET') return ok(200, { members: await svc.orgs.members(s[2], caller.sub) });
    if (s[3] === 'invitations' && s.length === 4 && m === 'GET') return ok(200, { invitations: await svc.orgs.sentInvitations(s[2], caller.sub) });
    if (s[3] === 'invitations' && s.length === 4 && m === 'POST') return ok(201, await svc.orgs.invite(await account(d, caller), s[2], await json(req)));
    if (s[3] === 'invitations' && s[4] && m === 'DELETE') { await svc.orgs.revokeInvitation(await account(d, caller), s[2], s[4]); return ok(200, { status: 'revoked' }); }
    // KA-11 SCIM: per-organisation bearer tokens, managed by owner/admin (the token itself is shown once)
    if (s[3] === 'scim-tokens' && s.length === 4 && m === 'GET') { await svc.orgs.assertManager(s[2], caller.sub); return ok(200, { tokens: await svc.scim.listTokens(s[2]) }); }
    if (s[3] === 'scim-tokens' && s.length === 4 && m === 'POST') { await svc.orgs.assertManager(s[2], caller.sub); return ok(201, { ...(await svc.scim.createToken(s[2], await account(d, caller), (await json(req)).label)), scim_base_url: `${d.issuer}/scim/v2` }); }
    if (s[3] === 'scim-tokens' && s[4] && m === 'DELETE') { await svc.orgs.assertManager(s[2], caller.sub); await svc.scim.revokeToken(s[2], await account(d, caller), s[4]); return ok(200, { status: 'revoked' }); }
    if (s[3] === 'members' && s[4] && m === 'PATCH') { await svc.orgs.changeRole(await account(d, caller), s[2], s[4], (await json(req)).role_hint); return ok(200, { status: 'updated' }); }
    if (s[3] === 'members' && s[4] && m === 'DELETE') { await svc.orgs.remove(await account(d, caller), s[2], s[4]); return ok(200, { status: 'removed' }); }
  }

  // ---------------- KA-10 TOTP + step-up ----------------
  if (p === '/api/totp' && m === 'GET') return ok(200, { enrolled: await svc.totp.isEnrolled(caller.sub), required: svc.totp.requiresMfa(await account(d, caller)) });
  if (p === '/api/totp/enroll' && m === 'POST') {
    const e = await svc.totp.enrolStart(await account(d, caller));
    if (!e) throw new HttpError(409, 'already_enrolled');
    return ok(200, { secret: e.secret, otpauth_uri: e.uri, next: 'POST /api/totp/confirm with a code' });
  }
  if (p === '/api/totp/confirm' && m === 'POST') {
    const r = await svc.totp.verify(caller.sub, String((await json(req)).code ?? ''), { confirm: true });
    if (!r.ok) throw new HttpError(r.reason === 'locked' ? 429 : 400, `totp_${r.reason}`);
    await d.audit.record('totp.enrolled', caller.sub);
    return ok(200, { enrolled: true });
  }
  if (p === '/api/totp' && m === 'DELETE') {
    const a = await account(d, caller);
    if (svc.totp.requiresMfa(a)) throw new HttpError(409, 'totp_required_for_role');
    const ch = stepUpChallenge(d, caller);
    if (ch) throw ch;
    if (!(await svc.totp.disable(a.sub))) throw new HttpError(404, 'not_enrolled');
    await d.audit.record('totp.disabled', a.sub);
    return ok(200, { enrolled: false });
  }
  if (p === '/api/step-up/policy' && m === 'GET') {
    const action = url.searchParams.get('action') ?? '';
    const su = d.cfg.stepUp;
    const required = su.sensitiveActions.includes(action);
    const ch = required ? stepUpChallenge(d, caller) : undefined;
    return ok(200, { action, step_up_required: required, satisfied: required ? !ch : true, acr_values: su.acr.mfa, max_age: su.freshnessSeconds, sensitive_actions: su.sensitiveActions });
  }
  if (p === '/api/step-up/passkey/options' && m === 'POST') {
    if (!d.passkeysEnabled) throw new HttpError(404, 'feature_disabled', { key: 'account.passkeys' });
    return ok(200, await d.passkeys.loginOptions(`stepup:${caller.sub}`, caller.sub));
  }
  if (p === '/api/step-up' && m === 'POST') {
    const b = await json(req);
    const a = await account(d, caller);
    let method: 'totp' | 'passkey';
    let extra: string[];
    if (b.method === 'totp') {
      const r = await svc.totp.verify(a.sub, String(b.code ?? ''));
      if (!r.ok) {
        await d.audit.record('step_up.failed', a.sub, { method: 'totp', reason: r.reason });
        throw new HttpError(r.reason === 'locked' ? 429 : r.reason === 'not_enrolled' ? 409 : 400, `totp_${r.reason}`, r.reason === 'wrong' ? { attempts_left: r.attemptsLeft } : {});
      }
      method = 'totp'; extra = ['totp', 'mfa'];
    } else if (b.method === 'passkey') {
      if (!d.passkeysEnabled) throw new HttpError(404, 'feature_disabled', { key: 'account.passkeys' });
      let r;
      try { r = await d.passkeys.loginVerify(`stepup:${a.sub}`, b.response as AuthenticationResponseJSON, a.sub); } catch { r = undefined; }
      if (!r) { await d.audit.record('step_up.failed', a.sub, { method: 'passkey' }); throw new HttpError(400, 'passkey_invalid'); }
      if (!r.userVerified) throw new HttpError(400, 'user_verification_required');
      method = 'passkey'; extra = [r.backedUp ? 'swk' : 'hwk', 'user', 'mfa'];
    } else throw new HttpError(400, 'invalid_method', { allowed: ['totp', 'passkey'] });
    const su = d.cfg.stepUp;
    const base = (caller.amr ?? []).filter((x) => !['mfa', 'totp', 'user', 'hwk', 'swk'].includes(x));
    const amr = [...new Set([...base, ...extra])];
    const { sub: _s, ...ident } = identityClaims(a); void _s;
    const claims: Record<string, unknown> = {
      ...ident, sub: a.sub, client_id: caller.clientId, sid: caller.sid, acr: su.acr.mfa, amr, auth_time: d.now(),
      ...(caller.scope ? { scope: caller.scope } : {}), ...(caller.orgs ? { kx_orgs: caller.orgs } : {}),
    };
    const ttl = Math.min(d.cfg.tokenLifetimes.accessTokenSeconds, su.freshnessSeconds);
    const token = await signAccessToken(d.key, d.issuer, d.audience, claims, ttl, d.now());
    await d.audit.record('step_up.success', a.sub, { method, acr: su.acr.mfa });
    return ok(200, { access_token: token, token_type: 'Bearer', expires_in: ttl, acr: su.acr.mfa, amr });
  }

  // ---------------- KA-11 federation ----------------
  if (s[0] === 'api' && s[1] === 'federation') {
    svc.federation.assertEnabled();
    if (s[2] === 'identities' && s.length === 3 && m === 'GET') return ok(200, { identities: await svc.federation.list(caller.sub), upstreams: svc.federation.available() });
    if (s[2] === 'identities' && s.length === 5 && m === 'DELETE') { await svc.federation.unlink(caller.sub, s[3], decodeURIComponent(s[4])); return ok(200, { status: 'unlinked' }); }
  }
  return false;
}
