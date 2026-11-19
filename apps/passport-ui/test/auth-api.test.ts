import { describe, it, expect, vi } from 'vitest';
import { Auth } from '../src/auth';
import { ApiError, createApi } from '../src/api';

const memStore = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage }; };
const json = (status: number, body: unknown) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body }) as unknown as Response;

function setup(fetchImpl: typeof fetch) {
  const { m, s } = memStore();
  const assigned: string[] = [];
  const auth = new Auth({ issuer: 'http://idp', clientId: 'kiorex-passport-web' }, s, fetchImpl, { assign: (u) => assigned.push(u), origin: 'http://idp' });
  return { m, auth, assigned };
}

describe('Auth (OIDC code + PKCE)', () => {
  it('starts login with an S256 challenge, state and the Passport client; stores the transaction', async () => {
    const { auth, assigned, m } = setup(vi.fn());
    await auth.startLogin('/account/security', 'ar');
    const u = new URL(assigned[0]);
    expect(u.origin + u.pathname).toBe('http://idp/auth');
    expect(u.searchParams.get('client_id')).toBe('kiorex-passport-web');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('http://idp/account/callback');
    expect(u.searchParams.get('ui_locales')).toBe('ar');
    expect(JSON.parse(m.get('kx.pp.txn')!).returnTo).toBe('/account/security');
  });

  it('completes the callback: verifies state, exchanges the code with the verifier, stores tokens', async () => {
    const f = vi.fn(async () => json(200, { access_token: 'AT', expires_in: 900, refresh_token: 'RT', id_token: 'IDT' }));
    const { auth, assigned, m } = setup(f as never);
    await auth.startLogin('/account/family', 'en');
    const state = new URL(assigned[0]).searchParams.get('state')!;
    const r = await auth.handleCallback(`?code=abc&state=${state}`);
    expect(r.returnTo).toBe('/account/family');
    const body = (f.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get('grant_type')).toBe('authorization_code'); expect(body.get('code_verifier')!.length).toBeGreaterThan(40);
    expect(auth.token()).toBe('AT'); expect(m.get('kx.pp.rt')).toBe('RT');
    expect(auth.logoutUrl()).toContain('id_token_hint=IDT');
  });

  it('rejects a callback with the wrong state, an IdP error, or no transaction', async () => {
    const { auth } = setup(vi.fn() as never);
    await auth.startLogin('/account', 'en');
    await expect(auth.handleCallback('?code=abc&state=nope')).rejects.toThrow('state_mismatch');
    await expect(auth.handleCallback('?code=abc&state=x')).rejects.toThrow('no_transaction');
    await auth.startLogin('/account', 'en');
    await expect(auth.handleCallback('?error=access_denied')).rejects.toThrow('access_denied');
  });

  it('treats an expired access token as absent, and parallel refreshes share one request (rotation-safe)', async () => {
    let n = 0;
    const f = vi.fn(async () => json(200, { access_token: `AT${++n}`, expires_in: 900, refresh_token: `RT${n}` }));
    const { auth, m } = setup(f as never);
    m.set('kx.pp.at', 'old'); m.set('kx.pp.exp', String(Date.now() - 1000)); m.set('kx.pp.rt', 'RT0');
    expect(auth.token()).toBeNull(); expect(auth.hasSession()).toBe(true);
    const [a, b] = await Promise.all([auth.refresh(), auth.refresh()]);
    expect(a && b).toBe(true); expect(f).toHaveBeenCalledTimes(1);
    expect(auth.token()).toBe('AT1');
  });

  it('a failed refresh clears the session; sign-out clears and goes to the end-session URL', async () => {
    const { auth, m, assigned } = setup((async () => json(400, { error: 'invalid_grant' })) as never);
    m.set('kx.pp.rt', 'dead');
    expect(await auth.refresh()).toBe(false);
    expect(auth.hasSession()).toBe(false);
    m.set('kx.pp.at', 'x'); m.set('kx.pp.exp', String(Date.now() + 60_000));
    auth.signOut();
    expect(auth.token()).toBeNull();
    expect(assigned.at(-1)).toContain('http://idp/session/end?client_id=kiorex-passport-web&post_logout_redirect_uri=http%3A%2F%2Fidp%2Faccount');
  });
});

describe('createApi', () => {
  const fakeAuth = (token: string | null, refresh = async () => false) => ({ token: () => token, refresh, setAccessToken: () => undefined, expired: vi.fn() });

  it('sends the bearer token and parses JSON; maps error bodies to ApiError', async () => {
    const f = vi.fn(async () => json(409, { error: 'link_exists', hint: 'x' }));
    const api = createApi('http://idp', fakeAuth('T'), f as never);
    await expect(api.inviteCoGuardian('d1', { phone: '+201', relationship: 'parent', evidence: { type: 'self_declared' } })).rejects.toMatchObject({ status: 409, code: 'link_exists', extra: { hint: 'x' } });
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer T');
  });

  it('on 401 refreshes once and retries; if still 401 the session is declared expired', async () => {
    const f = vi.fn().mockResolvedValueOnce(json(401, {})).mockResolvedValueOnce(json(200, { sub: 's' }));
    let tok: string | null = 'old';
    const refresh = vi.fn(async () => { tok = 'new'; return true; });
    const api = createApi('http://idp', { token: () => tok, refresh, setAccessToken: () => undefined, expired: vi.fn() }, f as never);
    expect(await api.account()).toMatchObject({ sub: 's' });
    expect(refresh).toHaveBeenCalledTimes(1);

    const expired = vi.fn();
    const f2 = vi.fn(async () => json(401, {}));
    const api2 = createApi('http://idp', { token: () => 'x', refresh: async () => true, setAccessToken: () => undefined, expired }, f2 as never);
    await expect(api2.account()).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalled();
  });

  it('surfaces step_up_required with its parameters and network failures as status 0', async () => {
    const api = createApi('http://idp', fakeAuth('T'), (async () => json(403, { error: 'step_up_required', acr_values: 'urn:kiorex:acr:mfa', max_age: 300 })) as never);
    const e = await api.opsLinks('pending_review').catch((x) => x);
    expect(e).toBeInstanceOf(ApiError); expect(e.code).toBe('step_up_required'); expect(e.extra.max_age).toBe(300);
    const down = createApi('http://idp', fakeAuth('T'), (async () => { throw new TypeError('fetch failed'); }) as never);
    await expect(down.account()).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('encodes ids in paths and calls the documented endpoints', async () => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => json(200, {}));
    const api = createApi('http://idp', fakeAuth('T'), f as never);
    await api.passkeyRemove('a/b+c'); await api.revokeApp('kiorex-web'); await api.declineGuardianLink('L1'); await api.opsLinkAction('X', 'approve', { resolution: { name: 'primary' } });
    const urls = f.mock.calls.map((c) => `${c[1].method} ${c[0]}`);
    expect(urls).toEqual(['DELETE http://idp/api/passkeys/a%2Fb%2Bc', 'DELETE http://idp/api/connected-apps/kiorex-web', 'POST http://idp/api/guardian-links/L1/decline', 'POST http://idp/api/ops/links/X/approve']);
  });
});
