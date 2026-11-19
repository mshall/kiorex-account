import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type Provider from 'oidc-provider';
import { LogChannel, type OtpChannel } from '@kiorex/otp-sender';
import { loadIdpConfig, loadSeedUsers, brandAsset, REPO_ROOT, type IdpConfig, type RuntimeOptions, type SeedUser } from './config.js';
import { createPool, migrate, type Pool } from './db.js';
import { Accounts } from './accounts.js';
import { Audit } from './audit.js';
import { loadOrCreateSigningKey, type SigningKey } from './keys.js';
import { OtpService } from './otp.js';
import { Passkeys } from './passkeys.js';
import { createProvider } from './provider.js';
import { LogoutDispatcher } from './logout.js';
import { handleInteraction } from './interactions.js';
import { handleApi, type ApiDeps } from './api.js';
import { send } from './http.js';
import { purgeExpired } from './adapter.js';

export interface DevIdp {
  server: http.Server;
  provider: Provider;
  pool: Pool;
  issuer: string;
  port: number;
  otpChannel: OtpChannel;
  otp: OtpService;
  testNumbers: string[];
  seedUsers: SeedUser[];
  key: SigningKey;
  close(): Promise<void>;
}

export interface CreateAppOptions {
  runtime: RuntimeOptions;
  cfg?: IdpConfig;
  seedUsers?: SeedUser[];
  otpChannel?: OtpChannel;
  fetchImpl?: typeof fetch;
  /** Override OTP policy numbers, e.g. for fast tests. */
  quiet?: boolean;
}

export async function createApp(o: CreateAppOptions): Promise<DevIdp> {
  const rt = o.runtime;
  const cfg = o.cfg ?? loadIdpConfig();
  const seedUsers = o.seedUsers ?? loadSeedUsers();
  const testNumbers = seedUsers.map((u) => u.phone);
  const pool = createPool(rt.databaseUrl, rt.schema);
  await migrate(pool, rt.schema);
  const accounts = new Accounts(pool);
  await accounts.seed(seedUsers);
  const audit = new Audit(pool);
  const key = await loadOrCreateSigningKey(pool);
  const otpChannel = o.otpChannel ?? new LogChannel((l) => { if (!o.quiet) console.log(l); });
  const otp = new OtpService(pool, cfg, otpChannel, { nodeEnv: rt.nodeEnv, testNumbers });
  const provider = createProvider({ cfg, pool, accounts, key, issuer: rt.issuer });
  provider.proxy = rt.trustProxy;
  const dispatcher = new LogoutDispatcher(rt.issuer, key, cfg, o.fetchImpl);
  const origin = new URL(rt.issuer);
  const passkeys = new Passkeys(pool, { id: origin.hostname, name: cfg.passwordless.passkeys.rpName, origin: origin.origin });
  const suppressedSessions = new Set<string>();

  // Single code path for back-channel logout: RP-initiated logout (built-in feature) also goes through our dispatcher.
  const ClientCls = provider.Client as unknown as { prototype: { backchannelLogout: (sub: string, sid: string) => Promise<void>; clientId: string } };
  ClientCls.prototype.backchannelLogout = async function (this: { clientId: string }, sub: string, sid: string) {
    const r = await dispatcher.send(this.clientId, 'session.revoked', sub, sid);
    if (r && !r.ok) throw new Error(`back-channel logout to ${this.clientId} failed (${r.status ?? r.error})`);
  };

  provider.on('authorization.success', (ctx) => {
    const s = ctx.oidc.session;
    if (!s?.accountId) return;
    pool.query(
      `INSERT INTO session_meta (session_uid, sub, user_agent, ip) VALUES ($1,$2,$3,$4)
       ON CONFLICT (session_uid) DO UPDATE SET last_seen_at=now()`,
      [s.uid, s.accountId, String(ctx.get('user-agent') ?? '').slice(0, 200), ctx.ip],
    ).catch(() => undefined);
  });
  provider.on('end_session.success', (ctx) => {
    const sub = ctx.oidc.session?.accountId;
    void audit.record('logout.rp_initiated', sub ?? null, {}).catch(() => undefined);
  });
  provider.on('server_error', (_ctx, err) => { if (!o.quiet) console.error('[dev-idp] server_error', err); });

  const apiDeps: ApiDeps = {
    provider, pool, accounts, dispatcher, passkeys, audit, key, issuer: rt.issuer,
    audience: cfg.defaultAudience, passkeysEnabled: rt.passkeysEnabled, suppressedSessions,
  };
  const iDeps = { provider, accounts, otp, passkeys, audit, passkeysEnabled: rt.passkeysEnabled, trustProxy: rt.trustProxy };

  const swBrowser = path.join(REPO_ROOT, 'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js');
  const swScript = readFileSync(swBrowser, 'utf8');
  const providerCb = provider.callback();

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', rt.issuer);
      const p = url.pathname;
      try {
        if (p === '/healthz') return send(res, 200, { status: 'ok', env: 'dev-only', issuer: rt.issuer });
        if (p === '/static/brand/tokens.css') return send(res, 200, brandAsset('tokens.css'), { 'content-type': 'text/css' });
        if (p === '/static/brand/kiorex-mark.svg') return send(res, 200, brandAsset('kiorex-mark.svg'), { 'content-type': 'image/svg+xml' });
        if (p === '/static/simplewebauthn-browser.js') return send(res, 200, swScript, { 'content-type': 'application/javascript' });
        if (p === '/dev/reset-rate-limits' && req.method === 'POST') { await otp.resetRateLimits(); return send(res, 200, { ok: true }); }
        if (p.startsWith('/interaction/')) return await handleInteraction(iDeps, req, res, url);
        if (p.startsWith('/api/')) return await handleApi(apiDeps, req, res, url);
        return providerCb(req, res);
      } catch (e) {
        if (!o.quiet) console.error('[dev-idp] unhandled', e);
        if (!res.headersSent) send(res, 500, { error: 'server_error' });
      }
    })();
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(rt.port, '127.0.0.1', resolve);
  });
  const port = (server.address() as { port: number }).port;
  const purge = setInterval(() => void purgeExpired(pool).catch(() => undefined), 10 * 60_000);
  purge.unref();

  return {
    server, provider, pool, issuer: rt.issuer, port, otpChannel, otp, testNumbers, seedUsers, key,
    close: async () => {
      clearInterval(purge);
      await new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections?.();
      await pool.end();
    },
  };
}
