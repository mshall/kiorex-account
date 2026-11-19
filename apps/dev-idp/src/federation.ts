import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Ctx } from './services.js';
import { HttpError } from './services.js';
import type { FakeUpstreamIdp } from './fake-upstream.js';

export interface FederatedResult { upstream_id: string; upstream_sub: string; email: string | null; name: string | null }

/**
 * KA-11: the dev IdP acts as an OIDC relying party towards a configured upstream (provider / hospital SSO), flag `account.provider_sso`.
 * First sign-in through an upstream is NOT trusted to create or take over a Passport: the person must also verify their mobile
 * number once (KX-04 section 04, "first time: ask for existing verification to link"). Afterwards the upstream identity signs in
 * directly. Provider authorization (roles, finance, TOTP step-up) stays in the products (SC04): amr=fed never implies acr=mfa.
 */
export class Federation {
  constructor(
    private readonly c: Ctx,
    private readonly enabled: boolean,
    private readonly upstreams: Map<string, FakeUpstreamIdp>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get isEnabled(): boolean { return this.enabled; }
  assertEnabled(): void {
    if (!this.enabled) throw new HttpError(403, 'FEATURE_DISABLED', { key: this.c.cfg.federation.flag, scope: 'global' });
  }

  available(): Array<{ id: string; name: string }> {
    if (!this.enabled) return [];
    return this.c.cfg.federation.upstreams.filter((u) => this.upstreams.has(u.id)).map((u) => ({ id: u.id, name: u.name }));
  }

  private conf(id: string) {
    const u = this.c.cfg.federation.upstreams.find((x) => x.id === id);
    const idp = this.upstreams.get(id);
    if (!u || !idp) throw new HttpError(404, 'unknown_upstream');
    return { u, idp };
  }
  private get callbackUri(): string { return `${this.c.issuer}/federation/callback`; }

  /** Starts an upstream authorization-code + PKCE round trip bound to the interaction. Returns the URL to redirect the browser to. */
  async begin(interactionUid: string, upstreamId: string, loginHint?: string): Promise<string> {
    this.assertEnabled();
    const { u, idp } = this.conf(upstreamId);
    const state = randomBytes(16).toString('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    await this.c.pool.query(`INSERT INTO federation_txn (state, interaction_uid, upstream_id, nonce, code_verifier, expires_at) VALUES ($1,$2,$3,$4,$5, now() + interval '10 minutes')`,
      [state, interactionUid, upstreamId, nonce, verifier]);
    const q = new URLSearchParams({
      client_id: u.local.clientId, response_type: 'code', redirect_uri: this.callbackUri, scope: 'openid profile email', state, nonce,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
      ...(loginHint ? { login_hint: loginHint } : {}),
    });
    return `${idp.issuer}/authorize?${q}`;
  }

  /** Upstream redirected back: exchange the code server-side, verify the ID token (signature, iss, aud, nonce). Returns the interaction uid. */
  async callback(state: string, code: string): Promise<string> {
    this.assertEnabled();
    const t = (await this.c.pool.query(`DELETE FROM federation_txn WHERE state=$1 AND expires_at > now() AND result IS NULL RETURNING *`, [state])).rows[0] as
      undefined | { interaction_uid: string; upstream_id: string; nonce: string; code_verifier: string };
    if (!t) throw new HttpError(400, 'invalid_state');
    const { u, idp } = this.conf(t.upstream_id);
    const tokenRes = await this.fetchImpl(`${idp.issuer}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${Buffer.from(`${encodeURIComponent(u.local.clientId)}:${encodeURIComponent(u.local.clientSecret)}`).toString('base64')}` },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.callbackUri, code_verifier: t.code_verifier }),
    });
    if (!tokenRes.ok) throw new HttpError(502, 'upstream_token_exchange_failed');
    const tok = (await tokenRes.json()) as { id_token?: string };
    if (!tok.id_token) throw new HttpError(502, 'upstream_no_id_token');
    let payload;
    try {
      ({ payload } = await jwtVerify(tok.id_token, createRemoteJWKSet(new URL(`${idp.issuer}/jwks`)), { issuer: idp.issuer, audience: u.local.clientId, algorithms: ['RS256'] }));
    } catch { throw new HttpError(502, 'upstream_id_token_invalid'); }
    if (payload.nonce !== t.nonce) throw new HttpError(400, 'nonce_mismatch');
    const result: FederatedResult = { upstream_id: t.upstream_id, upstream_sub: String(payload.sub), email: typeof payload.email === 'string' ? payload.email : null, name: typeof payload.name === 'string' ? payload.name : null };
    await this.c.pool.query(`INSERT INTO federation_txn (state, interaction_uid, upstream_id, nonce, code_verifier, result, expires_at) VALUES ($1,$2,$3,'','',$4, now() + interval '10 minutes')`,
      [`done:${state}`, t.interaction_uid, t.upstream_id, JSON.stringify(result)]);
    await this.c.audit.record('federation.upstream_authenticated', null, { upstream: t.upstream_id });
    return t.interaction_uid;
  }

  /** Takes the verified upstream result for an interaction (single use). */
  async takeResult(interactionUid: string): Promise<FederatedResult | undefined> {
    const r = await this.c.pool.query(
      `DELETE FROM federation_txn WHERE state = (SELECT state FROM federation_txn WHERE interaction_uid=$1 AND result IS NOT NULL AND expires_at > now() ORDER BY expires_at DESC LIMIT 1) RETURNING result`, [interactionUid]);
    return r.rows[0]?.result;
  }

  async findLinked(upstreamId: string, upstreamSub: string): Promise<string | undefined> {
    return (await this.c.pool.query(`SELECT sub FROM federated_identities WHERE upstream_id=$1 AND upstream_sub=$2`, [upstreamId, upstreamSub])).rows[0]?.sub;
  }

  async link(sub: string, f: FederatedResult): Promise<void> {
    await this.c.pool.query(
      `INSERT INTO federated_identities (upstream_id, upstream_sub, sub, email, display_name) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (upstream_id, upstream_sub) DO NOTHING`,
      [f.upstream_id, f.upstream_sub, sub, f.email, f.name]);
    await this.c.audit.record('federation.linked', sub, { upstream: f.upstream_id });
  }

  async list(sub: string) {
    return (await this.c.pool.query(`SELECT upstream_id, upstream_sub, email, display_name, linked_at FROM federated_identities WHERE sub=$1 ORDER BY linked_at`, [sub])).rows;
  }

  async unlink(sub: string, upstreamId: string, upstreamSub: string): Promise<void> {
    const r = await this.c.pool.query(`DELETE FROM federated_identities WHERE sub=$1 AND upstream_id=$2 AND upstream_sub=$3`, [sub, upstreamId, upstreamSub]);
    if (!r.rowCount) throw new HttpError(404, 'identity_not_found');
    await this.c.audit.record('federation.unlinked', sub, { upstream: upstreamId });
  }
}
