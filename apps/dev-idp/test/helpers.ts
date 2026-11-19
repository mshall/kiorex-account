import http from 'node:http';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { LogChannel } from '@kiorex/otp-sender';
import { handleBackchannelLogout, jwksFromUrl, type VerifiedLogout } from '@kiorex/backchannel';
import { createApp, type DevIdp } from '../src/app.js';
import { loadIdpConfig, runtimeFromEnv } from '../src/config.js';
import { dropSchema } from '../src/db.js';

export interface Harness {
  idp: DevIdp; issuer: string; channel: LogChannel; received: Array<VerifiedLogout & { clientId: string }>;
  receiverFails: { value: boolean };
  stop(): Promise<void>;
}

let portSeed = 4410 + (process.pid % 200);

export async function startHarness(opts: { passkeys?: boolean } = {}): Promise<Harness> {
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
  for (const c of cfg.clients) c.environments.local.backchannelLogoutUri = `http://127.0.0.1:${rport}/${c.clientId}`;
  const runtime = {
    ...runtimeFromEnv(cfg, { PORT: String(port), ISSUER: issuer, KX_DB_SCHEMA: schema, KX_TRUST_PROXY: 'true', NODE_ENV: 'test' }),
    passkeysEnabled: opts.passkeys ?? true,
  };
  const idp = await createApp({ runtime, cfg, otpChannel: channel, quiet: true });
  return {
    idp, issuer, channel, received, receiverFails,
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
  clientSecret?: string;
}
export interface Tokens { access_token: string; id_token: string; refresh_token?: string; token_type: string; expires_in: number; scope?: string }

const REDIRECTS: Record<string, string> = {
  'kiorex-web': 'http://localhost:5180/auth/callback',
  'kiorex-ops': 'http://localhost:5181/auth/callback',
  'kiorex-mobile': 'kiorex://auth/callback',
  'kiorly-clinic': 'http://localhost:5173/auth/kiorex/callback',
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
  if (r.status === 200) { // passkey step shown: skip
    r = await b.req(`${h.issuer}/interaction/${uid}/finish`, { method: 'POST', form: { lang: o.lang ?? 'en' } });
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
