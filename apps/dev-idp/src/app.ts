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
import { handleApi, revokeAllSessions, type ApiDeps } from './api.js';
import { DevInbox, Notifier, TeeChannel } from './notify.js';
import { Events } from './events.js';
import { Totp } from './totp.js';
import { Guardianship } from './guardian.js';
import { AccountLinking } from './links.js';
import { Orgs } from './orgs.js';
import { Federation } from './federation.js';
import { FakeUpstreamIdp } from './fake-upstream.js';
import type { Ctx } from './services.js';
import { send, redirect } from './http.js';
import { HttpError } from './services.js';
import { purgeExpired } from './adapter.js';

export interface DevIdp {
  server: http.Server;
  provider: Provider;
  pool: Pool;
  issuer: string;
  port: number;
  otpChannel: OtpChannel;
  otp: OtpService;
  inbox: DevInbox;
  events: Events;
  upstream?: FakeUpstreamIdp;
  ctx: Ctx;
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
  /** Epoch-seconds clock for tests (TOTP windows, guardian expiry, invitation expiry). Defaults to real time. */
  now?: () => number;
  /** Separate clock for TOTP windows so tests can step through many 30 s windows without ageing bearer tokens. */
  totpNow?: () => number;
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
  const now = o.now ?? (() => Math.floor(Date.now() / 1000));
  // Messaging is MOCKED: OTPs are logged (injected/log channel) AND written to the DB dev inbox (GET /dev/inbox).
  const inbox = new DevInbox(pool);
  const logChannel = o.otpChannel ?? new LogChannel((l) => { if (!o.quiet) console.log(l); });
  const otpChannel = new TeeChannel(logChannel, inbox.otpChannel());
  const otp = new OtpService(pool, cfg, otpChannel, { nodeEnv: rt.nodeEnv, testNumbers });
  const dispatcher = new LogoutDispatcher(rt.issuer, key, cfg, o.fetchImpl);
  const events = new Events(pool);
  const hooks: Ctx['hooks'] = { revokeSessions: async () => undefined };
  const ctx: Ctx = { pool, cfg, accounts, audit, events, notifier: new Notifier(inbox), key, issuer: rt.issuer, dispatcher, now, hooks };
  const orgs = new Orgs(ctx);
  const provider = createProvider({ cfg, pool, accounts, key, issuer: rt.issuer, orgClaims: (sub) => orgs.claimsFor(sub) });
  provider.proxy = rt.trustProxy;

  // KA-11: second fake upstream IdP (dev), only when the flag account.provider_sso is on
  const upstreams = new Map<string, FakeUpstreamIdp>();
  if (rt.providerSsoEnabled) {
    for (const u of cfg.federation.upstreams) {
      const idp = new FakeUpstreamIdp({ id: u.id, name: u.name, clientId: u.local.clientId, clientSecret: u.local.clientSecret, users: u.local.users, redirectUris: [`${rt.issuer}/federation/callback`] });
      await idp.start(rt.upstreamPort);
      upstreams.set(u.id, idp);
    }
  }
  const federation = new Federation(ctx, rt.providerSsoEnabled, upstreams, o.fetchImpl);
  const totp = new Totp(pool, cfg, o.totpNow ?? now);
  const svc = { guardian: new Guardianship(ctx), linking: new AccountLinking(ctx, otp), orgs, totp, federation };
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
    cfg, svc, ctx, trustProxy: rt.trustProxy, now,
  };
  hooks.revokeSessions = (sub) => revokeAllSessions(apiDeps, sub);
  const iDeps = { provider, accounts, otp, passkeys, audit, passkeysEnabled: rt.passkeysEnabled, trustProxy: rt.trustProxy, pool, cfg, totp, federation };

  const swBrowser = path.join(REPO_ROOT, 'node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js');
  const swScript = readFileSync(swBrowser, 'utf8');
  const providerCb = provider.callback();

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', rt.issuer);
      const p = url.pathname;
      try {
        if (p === '/healthz') return send(res, 200, { status: 'ok', env: 'dev-only', issuer: rt.issuer, upstream_issuer: [...upstreams.values()][0]?.issuer ?? null });
        // dev inbox / event outbox for E2E tests (mock messaging, CLAUDE.md founder decision); dev IdP never runs in production
        if (p === '/dev/inbox' && req.method === 'GET') {
          const q = url.searchParams;
          return send(res, 200, { messages: await inbox.list({ to: q.get('to') ?? undefined, channel: q.get('channel') ?? undefined, template: q.get('template') ?? undefined, afterId: Number(q.get('after') ?? 0) || undefined }) });
        }
        if (p === '/dev/inbox' && req.method === 'DELETE') { await inbox.clear(); return send(res, 200, { ok: true }); }
        if (p === '/dev/events' && req.method === 'GET') return send(res, 200, { events: await events.list(Number(url.searchParams.get('after') ?? 0) || 0, url.searchParams.get('type') ?? undefined) });
        // KA-11: upstream IdP redirects the browser here; we verify server-side, then resume the interaction
        if (p === '/federation/callback' && req.method === 'GET') {
          try {
            if (url.searchParams.get('error')) return send(res, 400, { error: 'upstream_error', detail: url.searchParams.get('error') });
            const uid = await federation.callback(url.searchParams.get('state') ?? '', url.searchParams.get('code') ?? '');
            return redirect(res, `/interaction/${uid}/federate/done`);
          } catch (e) {
            if (e instanceof HttpError) return send(res, e.status, { error: e.code, ...e.extra });
            throw e;
          }
        }
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
  const purge = setInterval(() => { void purgeExpired(pool).catch(() => undefined); void svc.guardian.expireDue().catch(() => undefined); }, 10 * 60_000);
  purge.unref();

  return {
    server, provider, pool, issuer: rt.issuer, port, otpChannel, otp, inbox, events, upstream: [...upstreams.values()][0], ctx, testNumbers, seedUsers, key,
    close: async () => {
      clearInterval(purge);
      for (const u of upstreams.values()) await u.stop();
      await new Promise<void>((r) => server.close(() => r()));
      server.closeAllConnections?.();
      await pool.end();
    },
  };
}
