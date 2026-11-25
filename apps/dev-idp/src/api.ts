import type { EmailVerification } from './email.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type Provider from 'oidc-provider';
import { decodeJwt, jwtVerify, importJWK, type JWK } from 'jose';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Pool } from './db.js';
import type { Accounts } from './accounts.js';
import { identityClaims } from './accounts.js';
import type { LogoutDelivery, LogoutDispatcher } from './logout.js';
import type { Passkeys } from './passkeys.js';
import type { Audit } from './audit.js';
import type { SigningKey } from './keys.js';
import { readBody, send } from './http.js';
import type { IdpConfig } from './config.js';
import type { Guardianship } from './guardian.js';
import type { AccountLinking } from './links.js';
import type { Orgs } from './orgs.js';
import type { Totp } from './totp.js';
import type { Federation } from './federation.js';
import type { Scim } from './scim.js';
import type { Ctx } from './services.js';
import { handleExtended, errorResponse } from './routes.js';

export interface Services { guardian: Guardianship; linking: AccountLinking; orgs: Orgs; totp: Totp; federation: Federation; scim: Scim; email: EmailVerification }

export interface ApiDeps {
  provider: Provider; pool: Pool; accounts: Accounts; dispatcher: LogoutDispatcher; passkeys: Passkeys;
  audit: Audit; key: SigningKey; issuer: string; audience: string; passkeysEnabled: boolean;
  suppressedSessions: Set<string>;
  cfg: IdpConfig; svc: Services; ctx: Ctx; trustProxy: boolean; now: () => number;
}

export interface Caller {
  sub: string; sessionUid?: string; jti: string; sid: string; clientId: string;
  acr?: string; amr?: string[]; authTime?: number; scope?: string; orgs?: unknown;
}

async function authenticate(d: ApiDeps, req: IncomingMessage): Promise<Caller | undefined> {
  const h = String(req.headers.authorization ?? '');
  const m = h.match(/^Bearer (.+)$/i);
  if (!m) return undefined;
  try {
    const pub = await importJWK(d.key.publicJwk as JWK, 'RS256');
    await jwtVerify(m[1], pub, { issuer: d.issuer, audience: d.audience, algorithms: ['RS256'], currentDate: new Date(d.now() * 1000) });
    // JWT access tokens are not persisted by oidc-provider, so "still valid" = the login session bound to this
    // token's (client_id, sid) still exists. Revoking the session therefore invalidates API access at once.
    const claims = decodeJwt(m[1]) as { jti?: string; sid?: string; client_id?: string; sub?: string; act?: unknown; acr?: string; amr?: string[]; auth_time?: number; scope?: string; kx_orgs?: unknown };
    const { jti, sid, client_id: clientId, sub } = claims;
    if (!jti || !sid || !clientId || !sub) return undefined;
    if (claims.act) return undefined; // guardian acting-as tokens are for products, never for the account self-service API
    const r = await d.pool.query(
      `SELECT uid, payload->'authorizations'->$2->>'grantId' AS grant_id FROM oidc_payloads WHERE model='Session' AND expires_at > now()
         AND payload->>'accountId'=$1 AND payload->'authorizations'->$2->>'sid'=$3`, [sub, clientId, sid]);
    if (!r.rows[0]) return undefined;
    // RFC 6749 section 4.1.2: a replayed authorization code destroys the grant it created (oidc-provider revokes it, refresh tokens go with it); an access token minted
    // from that grant must stop working here too, so the grant has to be alive as well, not only the session.
    const gid = r.rows[0].grant_id as string | null;
    if (gid) {
      const g = await d.pool.query(`SELECT 1 FROM oidc_payloads WHERE model='Grant' AND id=$1 AND (expires_at IS NULL OR expires_at > now())`, [gid]);
      if (!g.rows[0]) return undefined;
    }
    return { sub, sessionUid: r.rows[0].uid as string, jti, sid, clientId, acr: claims.acr, amr: claims.amr, authTime: claims.auth_time, scope: claims.scope, orgs: claims.kx_orgs };
  } catch {
    return undefined;
  }
}

async function revokeGrant(pool: Pool, grantId?: string): Promise<void> {
  if (!grantId) return;
  await pool.query(`DELETE FROM oidc_payloads WHERE grant_id=$1 OR (model='Grant' AND id=$1)`, [grantId]);
}

export async function revokeSession(d: ApiDeps, sessionUid: string, sub: string): Promise<LogoutDelivery[] | undefined> {
  const session = await d.provider.Session.findByUid(sessionUid);
  if (!session || session.accountId !== sub) return undefined;
  const deliveries: LogoutDelivery[] = [];
  for (const clientId of Object.keys(session.authorizations ?? {})) {
    const sid = session.sidFor(clientId);
    await revokeGrant(d.pool, session.grantIdFor(clientId));
    const r = await d.dispatcher.send(clientId, 'session.revoked', sub, sid);
    if (r) deliveries.push(r);
  }
  d.suppressedSessions.add(sessionUid);
  await session.destroy();
  await d.pool.query(`DELETE FROM session_meta WHERE session_uid=$1`, [sessionUid]);
  await d.audit.record('session.revoked', sub, { session: sessionUid.slice(0, 6), deliveries: deliveries.map((x) => ({ client: x.clientId, ok: x.ok })) });
  return deliveries;
}

export async function revokeAllSessions(d: ApiDeps, sub: string): Promise<void> {
  for (const s of await listSessions(d, sub)) await revokeSession(d, s.session_id, sub);
}

async function listSessions(d: ApiDeps, sub: string, current?: string) {
  const r = await d.pool.query(
    `SELECT p.payload, m.user_agent, m.ip, m.created_at, m.last_seen_at
       FROM oidc_payloads p LEFT JOIN session_meta m ON m.session_uid = p.uid
      WHERE p.model='Session' AND p.payload->>'accountId'=$1 AND p.expires_at > now()
      ORDER BY m.created_at DESC NULLS LAST`, [sub]);
  return r.rows.map((row) => ({
    session_id: row.payload.uid as string,
    current: row.payload.uid === current,
    device: row.user_agent ?? null,
    ip: row.ip ?? null,
    created_at: row.created_at ?? null,
    last_seen_at: row.last_seen_at ?? null,
    clients: Object.keys(row.payload.authorizations ?? {}),
  }));
}

/** Apps (OIDC clients) that currently hold a grant for this account (Passport "Connected apps"). */
export async function listConnectedApps(d: ApiDeps, sub: string) {
  const r = await d.pool.query(`SELECT payload FROM oidc_payloads WHERE model='Grant' AND payload->>'accountId'=$1 AND (expires_at IS NULL OR expires_at > now())`, [sub]);
  const byClient = new Map<string, { scopes: Set<string>; first: number; last: number }>();
  for (const row of r.rows) {
    const g = row.payload as { clientId: string; iat?: number; openid?: { scope?: string }; resources?: Record<string, string> };
    const e = byClient.get(g.clientId) ?? { scopes: new Set<string>(), first: Infinity, last: 0 };
    for (const sc of String(g.openid?.scope ?? '').split(' ')) if (sc) e.scopes.add(sc);
    const iat = g.iat ?? 0; e.first = Math.min(e.first, iat); e.last = Math.max(e.last, iat);
    byClient.set(g.clientId, e);
  }
  return [...byClient].map(([clientId, e]) => ({
    client_id: clientId, name: d.cfg.clients.find((c) => c.clientId === clientId)?.name ?? clientId,
    scopes: [...e.scopes], first_granted_at: e.first ? new Date(e.first * 1000).toISOString() : null, last_granted_at: e.last ? new Date(e.last * 1000).toISOString() : null,
  }));
}

/** Withdraws an app's access: grants (refresh tokens) deleted, back-channel logout sent, the session's authorization for that client removed. */
export async function revokeApp(d: ApiDeps, sub: string, clientId: string): Promise<LogoutDelivery[] | undefined> {
  const grants = await d.pool.query(`SELECT id FROM oidc_payloads WHERE model='Grant' AND payload->>'accountId'=$1 AND payload->>'clientId'=$2`, [sub, clientId]);
  const sessions = await d.pool.query(`SELECT uid, payload FROM oidc_payloads WHERE model='Session' AND payload->>'accountId'=$1 AND payload->'authorizations' ? $2`, [sub, clientId]);
  if (!grants.rowCount && !sessions.rowCount) return undefined;
  const deliveries: LogoutDelivery[] = [];
  for (const g of grants.rows) await revokeGrant(d.pool, g.id as string);
  for (const s of sessions.rows) {
    const sid = s.payload.authorizations?.[clientId]?.sid as string | undefined;
    if (sid) { const x = await d.dispatcher.send(clientId, 'session.revoked', sub, sid); if (x) deliveries.push(x); }
    await d.pool.query(`UPDATE oidc_payloads SET payload = payload #- ARRAY['authorizations', $2::text] WHERE model='Session' AND uid=$1`, [s.uid, clientId]);
  }
  await d.audit.record('app.access.revoked', sub, { client: clientId, deliveries: deliveries.map((x) => ({ client: x.clientId, ok: x.ok })) });
  return deliveries;
}

export async function deleteAccount(d: ApiDeps, sub: string): Promise<{ deliveries: LogoutDelivery[] }> {
  const sessions = await listSessions(d, sub);
  for (const s of sessions) {
    const sess = await d.provider.Session.findByUid(s.session_id);
    if (!sess) continue;
    for (const clientId of Object.keys(sess.authorizations ?? {})) await revokeGrant(d.pool, sess.grantIdFor(clientId));
    d.suppressedSessions.add(s.session_id);
    await sess.destroy();
  }
  await d.pool.query(`DELETE FROM session_meta WHERE sub=$1`, [sub]);
  // any grants not tied to a live session (e.g. refresh-token only)
  await d.pool.query(`DELETE FROM oidc_payloads WHERE payload->>'accountId'=$1`, [sub]);
  await d.pool.query(`DELETE FROM passkeys WHERE sub=$1`, [sub]);
  await d.pool.query(`DELETE FROM totp_credentials WHERE sub=$1`, [sub]);
  await d.pool.query(`DELETE FROM account_contacts WHERE sub=$1`, [sub]);
  await d.pool.query(`DELETE FROM federated_identities WHERE sub=$1`, [sub]);
  await d.pool.query(`UPDATE link_requests SET status='cancelled' WHERE (primary_sub=$1 OR secondary_sub=$1) AND status IN ('pending_verification','pending_review')`, [sub]);
  await d.svc.guardian.endAllFor(sub);
  await d.svc.orgs.endAllFor(sub);
  const deliveries: LogoutDelivery[] = [];
  for (const clientId of d.dispatcher.clientIds) {
    const r = await d.dispatcher.send(clientId, 'subject.deleted', sub);
    if (r) deliveries.push(r);
  }
  await d.accounts.tombstone(sub);
  await d.audit.record('subject.deleted', sub, { deliveries: deliveries.map((x) => ({ client: x.clientId, ok: x.ok })) });
  return { deliveries };
}

export async function handleApi(d: ApiDeps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const caller = await authenticate(d, req);
  if (!caller) return send(res, 401, { error: 'invalid_token' }, { 'www-authenticate': 'Bearer error="invalid_token"' });
  const p = url.pathname;
  const method = req.method ?? 'GET';
  try {
    if (await handleExtended(d, caller, req, res, url)) return;
  } catch (e) {
    return errorResponse(res, e);
  }

  if (p === '/api/sessions' && method === 'GET') return send(res, 200, { sessions: await listSessions(d, caller.sub, caller.sessionUid) });

  if (p === '/api/sessions' && method === 'DELETE') { // revoke all OTHER sessions
    const out: Record<string, LogoutDelivery[]> = {};
    for (const s of await listSessions(d, caller.sub, caller.sessionUid)) {
      if (s.current) continue;
      const r = await revokeSession(d, s.session_id, caller.sub);
      if (r) out[s.session_id] = r;
    }
    return send(res, 200, { revoked: Object.keys(out), deliveries: out });
  }
  const sm = p.match(/^\/api\/sessions\/([^/]+)$/);
  if (sm && method === 'DELETE') {
    const r = await revokeSession(d, sm[1], caller.sub);
    if (!r) return send(res, 404, { error: 'session_not_found' });
    return send(res, 200, { revoked: sm[1], deliveries: r });
  }

  if (p === '/api/connected-apps' && method === 'GET') return send(res, 200, { apps: await listConnectedApps(d, caller.sub) });
  const ca = p.match(/^\/api\/connected-apps\/([^/]+)$/);
  if (ca && method === 'DELETE') {
    const clientId = decodeURIComponent(ca[1]);
    if (clientId === caller.clientId) return send(res, 409, { error: 'cannot_revoke_current_app', hint: 'sign out instead' });
    const r = await revokeApp(d, caller.sub, clientId);
    if (!r) return send(res, 404, { error: 'app_not_found' });
    return send(res, 200, { revoked: clientId, deliveries: r });
  }

  if (p === '/api/account/export' && method === 'GET') { // KA-07
    const a = await d.accounts.findBySub(caller.sub);
    if (!a) return send(res, 404, { error: 'not_found' });
    return send(res, 200, {
      subject: { ...identityClaims(a), status: a.status },
      sessions: await listSessions(d, caller.sub, caller.sessionUid),
      passkeys: await d.passkeys.list(caller.sub),
      dependants: await d.svc.guardian.list(caller.sub),
      memberships: await d.svc.orgs.mine(caller.sub),
      federated_identities: await d.svc.federation.list(caller.sub),
      linked_contacts: (await d.pool.query(`SELECT type, value, source, created_at FROM account_contacts WHERE sub=$1`, [caller.sub])).rows,
      totp_enrolled: await d.svc.totp.isEnrolled(caller.sub),
      note: 'Identity data only. Clinical data is never held by Kiorex Passport (ADR-013).',
    });
  }
  if (p === '/api/account' && method === 'DELETE') { // KA-07
    const r = await deleteAccount(d, caller.sub);
    return send(res, 202, { status: 'deleted', event: 'subject.deleted', deliveries: r.deliveries });
  }

  if (p.startsWith('/api/passkeys')) {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    const a = await d.accounts.findBySub(caller.sub);
    if (!a) return send(res, 404, { error: 'not_found' });
    if (p === '/api/passkeys' && method === 'GET') return send(res, 200, { passkeys: await d.passkeys.list(a.sub) });
    const pk = p.match(/^\/api\/passkeys\/([^/]+)$/);
    if (pk && method === 'DELETE') {
      const gone = await d.passkeys.remove(a.sub, decodeURIComponent(pk[1]));
      if (!gone) return send(res, 404, { error: 'passkey_not_found' });
      await d.audit.record('passkey.removed', a.sub);
      return send(res, 200, { removed: true });
    }
    if (p === '/api/passkeys/register/options' && method === 'POST') return send(res, 200, await d.passkeys.options(a, `sub:${a.sub}`));
    if (p === '/api/passkeys/register/verify' && method === 'POST') {
      try {
        const body = JSON.parse((await readBody(req)).toString('utf8')) as RegistrationResponseJSON;
        const ok = await d.passkeys.verify(a, `sub:${a.sub}`, body);
        if (ok) await d.audit.record('passkey.registered', a.sub);
        return send(res, ok ? 200 : 400, { verified: ok });
      } catch {
        return send(res, 400, { verified: false });
      }
    }
  }
  return send(res, 404, { error: 'not_found' });
}
