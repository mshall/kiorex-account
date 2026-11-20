/**
 * OIDC Back-Channel Logout helpers (OpenID Connect Back-Channel Logout 1.0 §2.4-2.6)
 * used by Kiorex Passport (issuer side) and by products (receiver side). KA-05.
 *
 * No custom crypto: signing/verification is delegated to `jose`.
 */
import {
  SignJWT,
  jwtVerify,
  createRemoteJWKSet,
  type JWTPayload,
  type KeyLike,
  type JWTVerifyGetKey,
  type JWK,
  createLocalJWKSet,
} from 'jose';
import { randomUUID } from 'node:crypto';

export const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
/** Kiorex-specific event discriminators, carried as additional members of the `events` claim. */
export const KX_EVENT_SESSION_REVOKED = 'https://schemas.kiorex.com/event/session.revoked';
export const KX_EVENT_SUBJECT_DELETED = 'https://schemas.kiorex.com/event/subject.deleted';

export type KxLogoutEvent = 'session.revoked' | 'subject.deleted';

const KX_EVENT_URI: Record<KxLogoutEvent, string> = {
  'session.revoked': KX_EVENT_SESSION_REVOKED,
  'subject.deleted': KX_EVENT_SUBJECT_DELETED,
};

export const LOGOUT_TOKEN_TYP = 'logout+jwt';
export const LOGOUT_TOKEN_TTL_SECONDS = 120;

export interface BuildLogoutTokenOptions {
  issuer: string;
  /** The client_id of the receiving product. */
  audience: string;
  /** At least one of sub / sid is required. */
  sub?: string;
  sid?: string;
  event: KxLogoutEvent;
  key: KeyLike | Uint8Array;
  kid?: string;
  alg?: string;
  now?: number; // epoch seconds, for tests
  ttlSeconds?: number;
}

export async function buildLogoutToken(opts: BuildLogoutTokenOptions): Promise<string> {
  if (!opts.sub && !opts.sid) throw new Error('logout token requires sub or sid');
  if (opts.event === 'session.revoked' && !opts.sid && !opts.sub) throw new Error('session.revoked needs sid');
  const iat = opts.now ?? Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    events: { [BACKCHANNEL_LOGOUT_EVENT]: {}, [KX_EVENT_URI[opts.event]]: {} },
  };
  if (opts.sub) payload.sub = opts.sub;
  if (opts.sid) payload.sid = opts.sid;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: opts.alg ?? 'RS256', typ: LOGOUT_TOKEN_TYP, ...(opts.kid ? { kid: opts.kid } : {}) })
    .setIssuer(opts.issuer)
    .setAudience(opts.audience)
    .setIssuedAt(iat)
    .setExpirationTime(iat + (opts.ttlSeconds ?? LOGOUT_TOKEN_TTL_SECONDS))
    .setJti(randomUUID())
    .sign(opts.key);
}

export class LogoutTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogoutTokenError';
  }
}

export interface VerifiedLogout {
  jti: string;
  sub?: string;
  sid?: string;
  /** `session.revoked` when the Kiorex event is present or when only the standard event is (RP-initiated logout). */
  event: KxLogoutEvent;
  payload: JWTPayload;
}

export interface VerifyLogoutTokenOptions {
  issuer: string;
  /** This product's client_id. */
  audience: string;
  /** JWKS resolver: use `jwksFromUrl` or `jwksFromKeys`. */
  getKey: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
  now?: Date;
  /** Optional replay protection; throws when a jti is seen twice. */
  replayCache?: JtiCache;
  algorithms?: string[];
}

export const jwksFromUrl = (jwksUri: string): JWTVerifyGetKey => createRemoteJWKSet(new URL(jwksUri));
export const jwksFromKeys = (keys: JWK[]): JWTVerifyGetKey => createLocalJWKSet({ keys });

/** Validates a logout_token per OIDC BCL §2.6. */
export async function verifyLogoutToken(token: string, opts: VerifyLogoutTokenOptions): Promise<VerifiedLogout> {
  let result;
  try {
    result = await jwtVerify(token, opts.getKey, {
      issuer: opts.issuer,
      audience: opts.audience,
      typ: LOGOUT_TOKEN_TYP,
      algorithms: opts.algorithms ?? ['RS256'],
      clockTolerance: opts.clockToleranceSeconds ?? 5,
      currentDate: opts.now,
      requiredClaims: ['iat', 'jti', 'events'],
    });
  } catch (e) {
    throw new LogoutTokenError(`invalid logout token: ${(e as Error).message}`);
  }
  const p = result.payload;
  const events = p.events as Record<string, unknown> | undefined;
  if (!events || typeof events !== 'object' || !(BACKCHANNEL_LOGOUT_EVENT in events)) {
    throw new LogoutTokenError('missing backchannel-logout event');
  }
  if ('nonce' in p) throw new LogoutTokenError('logout token must not contain nonce');
  const sub = typeof p.sub === 'string' ? p.sub : undefined;
  const sid = typeof p.sid === 'string' ? p.sid : undefined;
  if (!sub && !sid) throw new LogoutTokenError('logout token needs sub or sid');
  const jti = p.jti as string;
  if (opts.replayCache && !opts.replayCache.markSeen(jti, (p.exp ?? 0) * 1000)) {
    throw new LogoutTokenError('logout token replayed');
  }
  const event: KxLogoutEvent = KX_EVENT_SUBJECT_DELETED in events ? 'subject.deleted' : 'session.revoked';
  return { jti, sub, sid, event, payload: p };
}

/** In-memory jti replay cache (products with several instances should back this with Redis). */
export class JtiCache {
  private seen = new Map<string, number>();
  markSeen(jti: string, expiresAtMs: number, nowMs = Date.now()): boolean {
    for (const [k, exp] of this.seen) if (exp < nowMs) this.seen.delete(k);
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAtMs || nowMs + LOGOUT_TOKEN_TTL_SECONDS * 1000);
    return true;
  }
}

export interface DeliveryResult {
  uri: string;
  ok: boolean;
  status?: number;
  attempts: number;
  error?: string;
}

export interface DeliverOptions {
  fetchImpl?: typeof fetch;
  retries?: number; // additional attempts after the first
  timeoutMs?: number;
  backoffMs?: number;
}

/** POSTs `logout_token` as application/x-www-form-urlencoded; 200/204 = success. Retries on network/5xx. */
export async function deliverLogoutToken(uri: string, token: string, opts: DeliverOptions = {}): Promise<DeliveryResult> {
  const f = opts.fetchImpl ?? fetch;
  const max = (opts.retries ?? 2) + 1;
  let last: DeliveryResult = { uri, ok: false, attempts: 0 };
  for (let i = 1; i <= max; i++) {
    try {
      const res = await f(uri, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-store' },
        body: new URLSearchParams({ logout_token: token }).toString(),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 3000),
      });
      last = { uri, ok: res.status === 200 || res.status === 204, status: res.status, attempts: i };
      if (last.ok || (res.status >= 400 && res.status < 500)) return last; // 4xx: do not retry
    } catch (e) {
      last = { uri, ok: false, attempts: i, error: (e as Error).message };
    }
    if (i < max) await new Promise((r) => setTimeout(r, (opts.backoffMs ?? 200) * i));
  }
  return last;
}

/**
 * Framework-agnostic receiver helper for products:
 *   const r = await handleBackchannelLogout(req.body.logout_token, {...});
 *   -> respond r.status (200 ok / 400 invalid), then revoke local sessions bound to r.sid (or all for r.sub).
 */
export async function handleBackchannelLogout(
  logoutToken: unknown,
  opts: VerifyLogoutTokenOptions,
): Promise<{ status: 200; logout: VerifiedLogout } | { status: 400; error: string }> {
  if (typeof logoutToken !== 'string' || !logoutToken) return { status: 400, error: 'missing logout_token' };
  try {
    return { status: 200, logout: await verifyLogoutToken(logoutToken, opts) };
  } catch (e) {
    return { status: 400, error: (e as Error).message };
  }
}
