import http from 'node:http';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { generateSync } from 'otplib';
import { LogChannel } from '@kiorex/otp-sender';
import { handleBackchannelLogout, jwksFromUrl, type VerifiedLogout } from '@kiorex/backchannel';
import { createApp, type DevIdp } from '../src/app.js';
import { loadIdpConfig, runtimeFromEnv } from '../src/config.js';
import { dropSchema } from '../src/db.js';

export interface Harness {
  idp: DevIdp; issuer: string; channel: LogChannel; received: Array<VerifiedLogout & { clientId: string }>;
  receiverFails: { value: boolean };
  /** Test clock (seconds offset applied to TOTP windows, guardian/invitation expiry and bearer-token verification). */
  clock: { offset: number; totpOffset: number; now(): number; totpNow(): number };
  stop(): Promise<void>;
}

export const seedOps = (h: Pick<Harness, 'idp'>) => h.idp.seedUsers.find((u) => u.roles.includes('super_admin'))!;
/** Current TOTP code for a base32 secret on the harness clock (plus optional offset seconds). */
export const totpCode = (h: Pick<Harness, 'clock'>, secret: string, extra = 0) =>
  generateSync({ secret, strategy: 'totp', epoch: h.clock.totpNow() + extra });

let portSeed = 4410 + (process.pid % 200);

export async function startHarness(opts: { passkeys?: boolean; providerSso?: boolean; env?: Record<string, string> } = {}): Promise<Harness> {
  const port = portSeed++;
  const schema = `kx_test_${process.pid}_${port}`;
  const issuer = `http://localhost:${port}`;
  const channel = new LogChannel(() => {});
  const received: Harness['received'] = [];
  const receiverFails = { value: false };

  const getKey = jwksFromUrl(`${issuer}/jwks`);
  const receiver = http.createServer(async (req, res) => {
    const clientId = (req.url ?? '/').slice(1);
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const form = new URLSearchParams(Buffer.concat(chunks).toString());
    if (receiverFails.value) { res.writeHead(500).end(); return; }
    const r = await handleBackchannelLogout(form.get('logout_token'), { issuer, audience: clientId, getKey });
    if (r.status === 200) received.push({ ...r.logout, clientId });
    res.writeHead(r.status).end();
  });
  await new Promise<void>((r) => receiver.listen(0, '127.0.0.1', r));
  const rport = (receiver.address() as { port: number }).port;

  const cfg = structuredClone(loadIdpConfig());
  // the Passport SPA keeps its default (self-hosted, ignoring) back-channel endpoint so tests exercise the real sid-carrying setup
  for (const c of cfg.clients) if (c.clientId !== 'kiorex-passport-web') c.environments.local.backchannelLogoutUri = `http://127.0.0.1:${rport}/${c.clientId}`;
  const runtime = {
    ...runtimeFromEnv(cfg, { PORT: String(port), ISSUER: issuer, KX_DB_SCHEMA: schema, KX_TRUST_PROXY: 'true', NODE_ENV: 'test', KX_FAKE_UPSTREAM_PORT: '0' }),
    passkeysEnabled: opts.passkeys ?? true,
    providerSsoEnabled: opts.providerSso ?? true,
  };
  const clock = {
    offset: 0, totpOffset: 0,
    now: () => Math.floor(Date.now() / 1000) + clock.offset,
    totpNow: () => Math.floor(Date.now() / 1000) + clock.totpOffset,
  };
  const idp = await createApp({ runtime, cfg, otpChannel: channel, env: { ...(opts.env ?? {}) }, quiet: true, now: clock.now, totpNow: clock.totpNow });
  return {
    idp, issuer, channel, received, receiverFails, clock,
    stop: async () => {
      const { pool } = idp;
      await dropSchema(pool, schema).catch(() => undefined);
      await idp.close();
      await new Promise<void>((r) => receiver.close(() => r()));
      receiver.closeAllConnections?.();
    },
  };
}

export const randomPhone = () => `+2012${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
let ipN = 1;
export const freshIp = () => `10.${Math.floor(ipN / 65025) % 250}.${Math.floor(ipN / 255) % 255}.${(ipN++ % 254) + 1}`;

/** Minimal cookie-jar HTTP client that never follows redirects automatically. */
export class Browser {
  private jar = new Map<string, string>();
  constructor(public ip = freshIp()) {}
  async req(url: string, init: RequestInit & { form?: Record<string, string>; json?: unknown } = {}): Promise<Response> {
    const headers: Record<string, string> = { 'x-forwarded-for': this.ip, 'user-agent': 'KxTestBrowser/1.0', ...(init.headers as Record<string, string>) };
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join('; ');
    let body = init.body as string | undefined;
    if (init.form) { headers['content-type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(init.form).toString(); }
    if (init.json !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(init.json); }
    const res = await fetch(url, { ...init, headers, body, redirect: 'manual' });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      const name = pair.slice(0, i); const val = pair.slice(i + 1);
      if (!val || /expires=Thu, 01 Jan 1970/i.test(sc)) this.jar.delete(name); else this.jar.set(name, val);
    }
    return res;
  }
  /** Follows redirects until a non-redirect or a redirect to `stopAt` prefix. */
  async follow(res: Response, base: string, stopAt: string[]): Promise<{ res: Response; url: string }> {
    let url = base;
    while (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')!;
      url = new URL(loc, url).toString();
      if (stopAt.some((p) => url.startsWith(p)) || !url.startsWith('http://localhost')) return { res, url };
      res = await this.req(url);
    }
    return { res, url };
  }
}

export const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

export interface LoginOpts {
  clientId?: string; redirectUri?: string; phone: string; scope?: string; lang?: 'ar' | 'en'; browser?: Browser;
  code?: string; /** if set, use as OTP instead of the logged one */ name?: string;
  clientSecret?: string; totpSecret?: string;
}
export interface Tokens { access_token: string; id_token: string; refresh_token?: string; token_type: string; expires_in: number; scope?: string }

const REDIRECTS: Record<string, string> = {
  'kiorex-web': 'http://localhost:5180/auth/callback',
  'kiorex-ops': 'http://localhost:5181/auth/callback',
  'kiorex-mobile': 'kiorex://auth/callback',
  kiorly: 'kiorly://auth/callback',
  'kiorly-team': 'kiorlyteam://auth/callback',
  'kiorly-clinic': 'http://localhost:5174/auth/kiorex/callback',
};

export async function startAuth(h: Harness, o: LoginOpts) {
  const clientId = o.clientId ?? 'kiorex-web';
  const redirectUri = o.redirectUri ?? REDIRECTS[clientId];
  const b = o.browser ?? new Browser();
  const { verifier, challenge } = pkce();
  const state = randomBytes(8).toString('hex');
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: o.scope ?? 'openid profile phone kx offline_access',
    state, code_challenge: challenge, code_challenge_method: 'S256', ui_locales: o.lang ?? 'en', prompt: 'login',
  });
  const r = await b.req(`${h.issuer}/auth?${q}`);
  const { res, url } = await b.follow(r, h.issuer, [redirectUri]);
  return { b, res, url, verifier, state, clientId, redirectUri };
}

/** Full authorization-code + PKCE + phone-OTP flow. Returns tokens and the browser (with its session). */
export async function login(h: Harness, o: LoginOpts) {
  const a = await startAuth(h, o);
  const b = a.b;
  const uid = new URL(a.url).pathname.split('/')[2];
  let r = await b.req(`${h.issuer}/interaction/${uid}`);
  if (r.status !== 200) throw new Error(`phone page status ${r.status}`);
  r = await b.req(`${h.issuer}/interaction/${uid}/phone`, { method: 'POST', form: { phone: o.phone, lang: o.lang ?? 'en', ...(o.name ? { name: o.name } : {}) } });
  if (r.status !== 200) throw new Error(`send status ${r.status}`);
  const code = o.code ?? h.channel.lastCodeFor(o.phone)!;
  r = await b.req(`${h.issuer}/interaction/${uid}/verify`, { method: 'POST', form: { code, lang: o.lang ?? 'en' } });
  if (r.status === 200) {
    let html = await r.text();
    if (html.includes('id="totp"')) { // privileged role: TOTP challenge (KA-03/KA-10); uses the seeded dev secret unless overridden
      const secret = o.totpSecret ?? h.idp.seedUsers.find((u) => u.phone === o.phone)?.totpSecret;
      if (!secret) throw new Error('TOTP required but no secret known for this phone');
      r = await b.req(`${h.issuer}/interaction/${uid}/totp`, { method: 'POST', form: { totp: totpCode(h, secret), lang: o.lang ?? 'en' } });
      h.clock.totpOffset += 30; // next TOTP window, so back-to-back ops logins never replay a code
      if (r.status === 200) html = await r.text();
    }
    if (r.status === 200) r = await b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: { lang: o.lang ?? 'en' } }); // passkey step shown: skip
  }
  const { res, url } = await b.follow(r, h.issuer, [a.redirectUri]);
  if (!url.startsWith(a.redirectUri)) throw new Error(`did not reach callback: ${res.status} ${url}`);
  const cb = new URL(url);
  if (cb.searchParams.get('state') !== a.state) throw new Error('state mismatch');
  const code2 = cb.searchParams.get('code');
  if (!code2) throw new Error(`no code: ${url}`);
  const tokens = await exchange(h, a.clientId, a.redirectUri, code2, a.verifier, o.clientSecret ?? (a.clientId === 'kiorly-clinic' ? 'dev-kiorly-clinic-secret' : undefined));
  return { ...a, tokens, uid };
}

export async function exchange(h: Harness, clientId: string, redirectUri: string, code: string, verifier: string, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
  if (secret) headers.authorization = `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`; else body.set('client_id', clientId);
  const r = await fetch(`${h.issuer}/token`, { method: 'POST', headers, body });
  const j = await r.json();
  if (!r.ok) throw new Error(`token exchange failed: ${JSON.stringify(j)}`);
  return j as Tokens;
}

export const api = (h: Harness, token: string, path: string, method = 'GET') =>
  fetch(`${h.issuer}${path}`, { method, headers: { authorization: `Bearer ${token}` } });

/** Follows the finished interaction to the client callback and exchanges the code (used after passkey / federation logins). */
export async function completeLogin(h: Harness, a: Awaited<ReturnType<typeof startAuth>>, r: Response): Promise<Tokens> {
  const { res, url } = await a.b.follow(r, h.issuer, [a.redirectUri]);
  if (!url.startsWith(a.redirectUri)) throw new Error(`did not reach callback: ${res.status} ${url}`);
  const cb = new URL(url);
  if (cb.searchParams.get('state') !== a.state) throw new Error('state mismatch');
  const code = cb.searchParams.get('code');
  if (!code) throw new Error(`no code: ${url}`);
  return exchange(h, a.clientId, a.redirectUri, code, a.verifier, a.clientId === 'kiorly-clinic' ? 'dev-kiorly-clinic-secret' : undefined);
}

/** JSON call against the IdP account API with a bearer token. */
export async function call(h: Harness, token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${h.issuer}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; } // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json, headers: res.headers };
}

export async function inbox(h: Harness, q: Record<string, string> = {}) {
  const r = await fetch(`${h.issuer}/dev/inbox?${new URLSearchParams(q)}`);
  return (await r.json()).messages as Array<{ id: number; channel: string; to: string; template: string; locale: string; body: string; data: Record<string, any>; state: string; providerRef: string }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export async function events(h: Harness, q: Record<string, string> = {}) {
  const r = await fetch(`${h.issuer}/dev/events?${new URLSearchParams(q)}`);
  return (await r.json()).events as Array<{ id: number; type: string; aggregateType: string; aggregateId: string; data: Record<string, any> }>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
export const lastInboxCode = async (h: Harness, phone: string) => (await inbox(h, { to: phone })).filter((m) => m.data.code).at(-1)?.data.code as string | undefined;

/** Ops super admin: full login incl. TOTP, returns tokens with acr=mfa. */
export const opsLogin = (h: Harness, o: Partial<LoginOpts> = {}) => {
  const ops = seedOps(h);
  return login(h, { clientId: 'kiorex-ops', phone: ops.phone, code: '000000', ...o });
};
