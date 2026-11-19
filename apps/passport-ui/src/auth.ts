import { randomString, sha256b64u } from './util';

export interface AuthConfig { issuer: string; clientId: string; kiorexWebUrl?: string }
export interface AuthLike {
  token(): string | null;
  refresh(): Promise<boolean>;
  setAccessToken(token: string, expiresIn: number): void;
  expired(): void;
}

const K = { at: 'kx.pp.at', exp: 'kx.pp.exp', rt: 'kx.pp.rt', idt: 'kx.pp.idt', txn: 'kx.pp.txn' };
const SCOPE = 'openid profile phone kx kx_org offline_access';

/**
 * OIDC authorization-code + PKCE (S256) against the Passport IdP as the public client `kiorex-passport-web`.
 * Tokens live in sessionStorage (dev); production should move them behind a same-site BFF cookie (NEEDS_HUMAN: security review).
 */
export class Auth implements AuthLike {
  private memory: Record<string, string> = {};
  constructor(
    readonly cfg: AuthConfig,
    private readonly store: Storage | undefined = safeStorage(),
    private readonly doFetch: typeof fetch = (...a) => fetch(...a),
    private readonly nav: { assign(url: string): void; origin: string } = { assign: (u) => window.location.assign(u), origin: window.location.origin },
  ) {}

  private get(k: string): string | null { try { return this.store?.getItem(k) ?? this.memory[k] ?? null; } catch { return this.memory[k] ?? null; } }
  private set(k: string, v: string) { this.memory[k] = v; try { this.store?.setItem(k, v); } catch { /* ignore */ } }
  private del(k: string) { delete this.memory[k]; try { this.store?.removeItem(k); } catch { /* ignore */ } }

  get redirectUri() { return `${this.nav.origin}/account/callback`; }

  token(): string | null {
    const t = this.get(K.at); const exp = Number(this.get(K.exp) ?? 0);
    return t && exp - 15_000 > Date.now() ? t : null;
  }
  hasSession(): boolean { return !!this.token() || !!this.get(K.rt); }

  setAccessToken(token: string, expiresIn: number) { this.set(K.at, token); this.set(K.exp, String(Date.now() + expiresIn * 1000)); }
  private save(t: { access_token: string; expires_in: number; refresh_token?: string; id_token?: string }) {
    this.setAccessToken(t.access_token, t.expires_in);
    if (t.refresh_token) this.set(K.rt, t.refresh_token);
    if (t.id_token) this.set(K.idt, t.id_token);
  }
  clear() { for (const k of Object.values(K)) this.del(k); }
  expired() { this.clear(); }

  async startLogin(returnTo: string, lang: 'ar' | 'en', extra: Record<string, string> = {}): Promise<void> {
    const verifier = randomString(48); const state = randomString(16);
    this.set(K.txn, JSON.stringify({ verifier, state, returnTo }));
    const q = new URLSearchParams({
      client_id: this.cfg.clientId, redirect_uri: this.redirectUri, response_type: 'code', scope: SCOPE, state,
      code_challenge: await sha256b64u(verifier), code_challenge_method: 'S256', ui_locales: lang, ...extra,
    });
    this.nav.assign(`${this.cfg.issuer}/auth?${q}`);
  }

  /** Completes the redirect: validates state, exchanges the code, stores tokens. Returns where to go next. */
  async handleCallback(search: string): Promise<{ returnTo: string }> {
    const q = new URLSearchParams(search);
    const raw = this.get(K.txn); this.del(K.txn);
    if (!raw) throw new Error('no_transaction');
    const txn = JSON.parse(raw) as { verifier: string; state: string; returnTo: string };
    if (q.get('error')) throw new Error(q.get('error')!);
    if (q.get('state') !== txn.state) throw new Error('state_mismatch');
    const code = q.get('code'); if (!code) throw new Error('no_code');
    const r = await this.doFetch(`${this.cfg.issuer}/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: this.cfg.clientId, code, redirect_uri: this.redirectUri, code_verifier: txn.verifier }),
    });
    if (!r.ok) throw new Error('token_exchange_failed');
    this.save(await r.json());
    return { returnTo: txn.returnTo };
  }

  private inflight: Promise<boolean> | undefined;
  /** Single-flight: parallel callers share one refresh (refresh tokens rotate, a second use would trip reuse detection). */
  refresh(): Promise<boolean> {
    this.inflight ??= this.doRefresh().finally(() => { this.inflight = undefined; });
    return this.inflight;
  }
  private async doRefresh(): Promise<boolean> {
    const rt = this.get(K.rt); if (!rt) return false;
    try {
      const r = await this.doFetch(`${this.cfg.issuer}/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', client_id: this.cfg.clientId, refresh_token: rt }),
      });
      if (!r.ok) { this.clear(); return false; }
      this.save(await r.json());
      return true;
    } catch { return false; }
  }

  logoutUrl(): string {
    const q = new URLSearchParams({ client_id: this.cfg.clientId, post_logout_redirect_uri: `${this.nav.origin}/account` });
    const idt = this.get(K.idt); if (idt) q.set('id_token_hint', idt);
    return `${this.cfg.issuer}/session/end?${q}`;
  }
  signOut() { const url = this.logoutUrl(); this.clear(); this.nav.assign(url); }
}

function safeStorage(): Storage | undefined { try { return typeof sessionStorage === 'undefined' ? undefined : sessionStorage; } catch { return undefined; } }
