import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { IncomingMessage } from 'node:http';
import { startHarness, type Harness } from './helpers.js';
import { corsAllowList, buildClients } from '../src/provider.js';
import { clientIp } from '../src/http.js';
import { loadIdpConfig, runtimeFromEnv } from '../src/config.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

/** node:http so the Origin header is sent exactly as given */
function call(path: string, headers: Record<string, string>, method = 'GET'): Promise<{ status: number; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const u = new URL(path, h.issuer);
    const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method, headers }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers })); });
    r.on('error', reject); r.end();
  });
}

describe('Passport CORS allow-list (no Origin reflection)', () => {
  const cfg = loadIdpConfig();
  const registered = [...corsAllowList(buildClients(cfg))];

  it('derives the allow-list from the registered clients (http(s) origins of redirect and post-logout URIs)', () => {
    expect(registered.length).toBeGreaterThan(0);
    for (const o of registered) expect(o).toMatch(/^https?:\/\/[^/]+$/);
    expect(registered).not.toContain('https://evil.example.com');
  });

  it('does not reflect an unregistered Origin on /me, with or without a token, nor on a preflight', async () => {
    for (const o of ['https://evil.example.com', 'null', 'http://localhost:9']) {
      for (const auth of [undefined, 'Bearer not-a-token']) {
        const r = await call('/me', { origin: o, ...(auth ? { authorization: auth } : {}) });
        expect(r.status).toBe(401);
        expect(r.headers['access-control-allow-origin'], `Origin ${o} auth ${auth}`).toBeUndefined();
        expect(r.headers['access-control-expose-headers']).toBeUndefined();
      }
      const p = await call('/me', { origin: o, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' }, 'OPTIONS');
      expect(p.headers['access-control-allow-origin'], `preflight ${o}`).toBeUndefined();
      expect(p.headers['access-control-allow-headers']).toBeUndefined();
    }
  });

  it('still answers a registered client origin', async () => {
    const o = registered.find((x) => x.startsWith('http://localhost')) ?? registered[0]!;
    const r = await call('/me', { origin: o });
    expect(r.headers['access-control-allow-origin']).toBe(o);
  });

  it('never reflects on the other CORS-enabled endpoints either (jwks, discovery, introspection)', async () => {
    for (const p of ['/jwks', '/.well-known/openid-configuration']) {
      const r = await call(p, { origin: 'https://evil.example.com' });
      expect(r.headers['access-control-allow-origin'], p).toBeUndefined();
    }
  });
});

describe('client address behind the origin router', () => {
  const req = (xff: string | undefined, peer = '10.0.0.9') => ({ headers: xff === undefined ? {} : { 'x-forwarded-for': xff }, socket: { remoteAddress: peer } }) as unknown as IncomingMessage;
  it('ignores X-Forwarded-For unless the proxy is trusted', () => { expect(clientIp(req('203.0.113.7'), false)).toBe('10.0.0.9'); });
  it('trusted: takes the rightmost entry (the one the proxy appended), never a client-supplied leftmost value', () => {
    expect(clientIp(req('203.0.113.7'), true)).toBe('203.0.113.7');
    expect(clientIp(req('6.6.6.6, 203.0.113.7'), true)).toBe('203.0.113.7');
    expect(clientIp(req('2001:db8::1'), true)).toBe('2001:db8::1');
  });
  it('trusted but absent or not an address: falls back to the socket peer', () => {
    expect(clientIp(req(undefined), true)).toBe('10.0.0.9');
    expect(clientIp(req('not-an-ip'), true)).toBe('10.0.0.9');
    expect(clientIp(req('1.2.3.4, <script>'), true)).toBe('10.0.0.9');
  });
});

describe('provider SSO (fake hospital IdP) button', () => {
  const cfg = loadIdpConfig(undefined, {});
  const PUBLIC = { ISSUER: 'https://passport.test.example.com', NODE_ENV: 'development' };
  it('is on locally, off on a hosted deployment unless switched on explicitly', () => {
    expect(runtimeFromEnv(cfg, { PORT: '4499' }).providerSsoEnabled).toBe(true);
    expect(runtimeFromEnv(cfg, { ...PUBLIC }).providerSsoEnabled).toBe(false);
    expect(runtimeFromEnv(cfg, { ...PUBLIC, DEV_IDP_PUBLIC: 'true' }).providerSsoEnabled).toBe(false);
    expect(runtimeFromEnv(cfg, { ...PUBLIC, KX_FLAG_ACCOUNT_PROVIDER_SSO: 'true' }).providerSsoEnabled).toBe(true);
  });
});
