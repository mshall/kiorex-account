import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type Provider from 'oidc-provider';
import { createOtpChannelFromEnv, genericStatusBody, HttpMessagingTransport, isRealOtp, LogChannel, providerEnv, signedWebhookHeaders, type OtpChannel } from '@kiorex/otp-sender';
import { DeliveryStatus } from './delivery.js';
import { loadIdpConfig, loadSeedUsers, BRAND_FILES, brandBytes, REPO_ROOT, type IdpConfig, type RuntimeOptions, type SeedUser } from './config.js';
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
import { Scim } from './scim.js';
import { FakeUpstreamIdp } from './fake-upstream.js';
import type { Ctx } from './services.js';
import { send, redirect, readBody, setNativeFormActionSchemes } from './http.js';
import { HttpError } from './services.js';
import { purgeExpired } from './adapter.js';
import { PASSPORT_CLIENT_ID, handleAccountUi } from './account-ui.js';

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

const readRaw = async (req: http.IncomingMessage): Promise<string> => (await readBody(req)).toString('utf8');

export interface CreateAppOptions {
  runtime: RuntimeOptions;
  cfg?: IdpConfig;
  seedUsers?: SeedUser[];
  otpChannel?: OtpChannel;
  /** Provider env (SMS_MODE, WHATSAPP_MODE, ...). Defaults to process.env; tests inject it. */
  env?: NodeJS.ProcessEnv;
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
  // The Passport web UI is served by this process: its redirect URIs follow the issuer origin (tests/E2E run on other ports).
  const passportClient = cfg.clients.find((c) => c.clientId === PASSPORT_CLIENT_ID);
  if (passportClient) {
    passportClient.environments.local.redirectUris = [`${rt.issuer}/account/callback`];
    passportClient.environments.local.postLogoutRedirectUris = [`${rt.issuer}/account`];
    // oidc-provider only puts `sid` in tokens for clients with a back-channel logout URI. The SPA has no server, so the IdP accepts
    // (and ignores) the logout token itself; the SPA notices a revoked session through a 401 on its next API call.
    passportClient.environments.local.backchannelLogoutUri ??= `${rt.issuer}/account/backchannel-logout`;
  }
  setNativeFormActionSchemes(cfg.clients.flatMap((c) => [...c.environments.local.redirectUris, ...c.environments.local.postLogoutRedirectUris]));
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
  // REAL providers (SMS_MODE / WHATSAPP_MODE=real): OTP and notifications go out through the generic HTTP providers only. The dev inbox,
  // the log channel (which prints codes) and the dev simulators are all disabled, so no code is ever logged or readable over HTTP.
  const env = o.env ?? process.env;
  const realMessaging = isRealOtp(env);
  const delivery = new DeliveryStatus(pool, env);
  const inbox = new DevInbox(pool);
  const onSent = (s: { channel: string; providerRef: string; phone: string }) => delivery.recordSent(s.channel, s.providerRef, s.phone).catch(() => undefined);
  const otpChannel = realMessaging
    ? createOtpChannelFromEnv({ nodeEnv: rt.nodeEnv, env, onSent })
    : new TeeChannel(o.otpChannel ?? new LogChannel((l) => { if (!o.quiet) console.log(l); }), inbox.otpChannel());
  const notifier = new Notifier(inbox, realMessaging && providerEnv('WHATSAPP', env).mode === 'real' ? { transport: new HttpMessagingTransport('WHATSAPP', providerEnv('WHATSAPP', env)), onSent } : undefined);
  const otp = new OtpService(pool, cfg, otpChannel, { nodeEnv: rt.nodeEnv, testNumbers });
  const dispatcher = new LogoutDispatcher(rt.issuer, key, cfg, o.fetchImpl);
  const events = new Events(pool);
  const hooks: Ctx['hooks'] = { revokeSessions: async () => undefined };
  const ctx: Ctx = { pool, cfg, accounts, audit, events, notifier, key, issuer: rt.issuer, dispatcher, now, hooks };
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
  const scim = new Scim(ctx);
  const svc = { guardian: new Guardianship(ctx), linking: new AccountLinking(ctx, otp), orgs, totp, federation, scim };
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
        // provider delivery-status webhooks (SMS / WhatsApp): HMAC verified, idempotent, forward-only statuses; reachable in every mode
        if ((p === '/webhooks/sms' || p === '/webhooks/whatsapp') && req.method === 'POST') {
          const raw = await readRaw(req);
          const r = await delivery.handleWebhook(p.slice('/webhooks/'.length), raw, req.headers);
          return r ? send(res, 200, r) : send(res, 401, { error: 'invalid_signature' });
        }
        if (realMessaging && (p.startsWith('/dev/inbox') || p.startsWith('/dev/webhooks') || p.startsWith('/dev/delivery-status') || p === '/dev/reset-rate-limits')) return send(res, 404, { error: 'not_found' });
        if (p === '/dev/delivery-status' && req.method === 'GET') return send(res, 200, { statuses: await delivery.list() });
        if (p === '/dev/webhooks/simulate' && req.method === 'POST') {
          // DEV: deliver a SIGNED status webhook for a dev-inbox message through the same verified handler a real provider hits
          const body = JSON.parse((await readRaw(req)) || '{}') as { providerRef?: string; state?: string };
          const status = ({ DELIVERED: 'delivered', READ: 'read', FAILED: 'failed' } as Record<string, 'delivered' | 'read' | 'failed'>)[String(body.state ?? '').toUpperCase()];
          const ref = String(body.providerRef ?? '');
          const m = /^mock_(whatsapp|sms)_\d+$/.exec(ref);
          if (!status || !m) return send(res, 400, { error: 'invalid_request' });
          const kind = m[1].toUpperCase() as 'SMS' | 'WHATSAPP';
          const payload = genericStatusBody(ref, status, status === 'failed' ? 'SIMULATED_FAILURE' : undefined);
          const r = await delivery.handleWebhook(m[1], payload, signedWebhookHeaders(providerEnv(kind, env).webhookSecret, payload));
          return send(res, r ? 200 : 401, r ?? { error: 'invalid_signature' });
        }
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
        if (p.startsWith('/static/brand/')) {
          const name = p.slice('/static/brand/'.length);
          const type = Object.prototype.hasOwnProperty.call(BRAND_FILES, name) ? BRAND_FILES[name] : undefined;
          if (!type) return send(res, 404, { error: 'not_found' });
          res.writeHead(200, { 'content-type': type, 'cache-control': 'public, max-age=300', 'x-content-type-options': 'nosniff' });
          return void res.end(brandBytes(name));
        }
        if (p === '/static/simplewebauthn-browser.js') return send(res, 200, swScript, { 'content-type': 'application/javascript' });
        if (p === '/dev/reset-rate-limits' && req.method === 'POST') { await otp.resetRateLimits(); return send(res, 200, { ok: true }); }
        if (p === '/account' || p.startsWith('/account/')) return await handleAccountUi(rt.issuer, req, res, p);
        if (p.startsWith('/interaction/')) return await handleInteraction(iDeps, req, res, url);
        if (p === '/scim/v2' || p.startsWith('/scim/v2/')) return await scim.handle(req, res, url); // KA-11 SCIM 2.0 (org bearer token)
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
