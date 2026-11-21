import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  assertProviderConfig, createOtpChannelFromEnv, FallbackChannel, HttpOtpChannel, LogChannel, parseGenericStatus, providerEnv, providerProblems,
  providerRequest, ProviderConfigError, signedWebhookHeaders, signWebhookBody, verifyWebhookBody, whatsappMapping, smsMapping, type ProviderError,
} from '../src/index.js';

let server: http.Server; let base = ''; let hits: Array<{ url: string; headers: http.IncomingHttpHeaders; body: any }> = []; let script: Array<(r: http.ServerResponse) => void> = [];
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => (r: http.ServerResponse) => { r.writeHead(status, { 'content-type': 'application/json', ...headers }); r.end(JSON.stringify(body)); };
beforeAll(async () => {
  server = http.createServer((req, res) => {
    const c: Buffer[] = [];
    req.on('data', (d) => c.push(d as Buffer));
    req.on('end', () => { const raw = Buffer.concat(c).toString('utf8'); hits.push({ url: req.url ?? '', headers: req.headers, body: raw ? JSON.parse(raw) : undefined }); (script.shift() ?? reply(200, { id: `r${hits.length}` }))(res); });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => { server.close(() => r()); server.closeAllConnections?.(); }));
beforeEach(() => { hits = []; script = []; });

const real = (kind: 'SMS' | 'WHATSAPP', extra: Record<string, string> = {}) => ({ [`${kind}_MODE`]: 'real', [`${kind}_API_URL`]: base, [`${kind}_API_KEY`]: 'k_123', [`${kind}_SENDER_ID`]: 'KIOREX', [`${kind}_WEBHOOK_SECRET`]: 'whsec_test_0123456789', [`${kind}_MAX_RETRIES`]: '2', ...extra });
const noSleep = { sleep: async () => undefined, random: () => 0 };
const msg = { phone: '+201000000001', code: '424242', locale: 'en' as const, ttlMinutes: 5 };

describe('env contract + fail-fast', () => {
  it('mock by default; real needs URL, key, sender, webhook secret (names only in the error)', () => {
    expect(providerEnv('SMS', {}).mode).toBe('mock');
    let err: ProviderConfigError | undefined;
    try { assertProviderConfig({ WHATSAPP_MODE: 'real', WHATSAPP_API_KEY: 'topsecretvalue' }, ['SMS', 'WHATSAPP']); } catch (e) { err = e as ProviderConfigError; }
    expect(err!.problems).toEqual(expect.arrayContaining(['WHATSAPP_API_URL is required when WHATSAPP_MODE=real', 'WHATSAPP_SENDER_ID is required when WHATSAPP_MODE=real']));
    expect(err!.message).not.toContain('topsecretvalue');
    expect(providerProblems('SMS', { ...real('SMS'), SMS_API_URL: 'http://sms.example.com' })).toContain('SMS_API_URL must be https');
  });
  it('createOtpChannelFromEnv: misconfigured real fails at construction; mock is rejected in production; mock is the log channel elsewhere', () => {
    expect(() => createOtpChannelFromEnv({ env: { SMS_MODE: 'real' } })).toThrow(ProviderConfigError);
    expect(() => createOtpChannelFromEnv({ env: {}, nodeEnv: 'production' })).toThrow(/mock mode in production/);
    expect(createOtpChannelFromEnv({ env: {}, nodeEnv: 'development' })).toBeInstanceOf(LogChannel);
    expect(createOtpChannelFromEnv({ env: { ...real('SMS'), ...real('WHATSAPP') } })).toBeInstanceOf(FallbackChannel);
    expect(createOtpChannelFromEnv({ env: real('SMS') }).name).toBe('sms');
    expect(createOtpChannelFromEnv({ env: real('WHATSAPP') }).name).toBe('whatsapp');
  });
});

describe('http client', () => {
  const env = () => providerEnv('SMS', real('SMS'));
  it('retries 5xx / 429 with the same idempotency key and exponential backoff; never retries 4xx', async () => {
    script = [reply(503, {}), reply(429, {}, { 'retry-after': '0' }), reply(200, { id: 'ok' })];
    const sleeps: number[] = [];
    const r = await providerRequest(env(), { path: '/m', body: {}, idempotencyKey: 'k' }, { sleep: async (ms) => { sleeps.push(ms); }, random: () => 0 });
    expect(r.attempts).toBe(3);
    expect(hits.map((h) => h.headers['idempotency-key'])).toEqual(['k', 'k', 'k']);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
    hits = []; script = [reply(400, {})];
    await expect(providerRequest(env(), { path: '/m', body: {} }, noSleep)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(hits).toHaveLength(1);
  });
  it('times out and maps network failures', async () => {
    script = [() => undefined];
    await expect(providerRequest(providerEnv('SMS', real('SMS', { SMS_TIMEOUT_MS: '50', SMS_MAX_RETRIES: '0' })), { path: '/m', body: {} }, noSleep)).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(providerRequest(providerEnv('SMS', real('SMS', { SMS_API_URL: 'http://127.0.0.1:1', SMS_MAX_RETRIES: '0' })), { path: '/m', body: {} }, noSleep)).rejects.toMatchObject({ code: 'NETWORK' });
  });
});

describe('OTP over HTTP providers', () => {
  it('SMS channel sends the neutral payload with auth and a per-send idempotency reference; the code is in the body only', async () => {
    const ch = new HttpOtpChannel('SMS', { env: providerEnv('SMS', real('SMS')), deps: noSleep });
    await ch.send(msg);
    expect(hits[0]).toMatchObject({ url: '/messages', body: { to: msg.phone, from: 'KIOREX' } });
    expect(hits[0].body.body).toContain('424242');
    expect(hits[0].headers.authorization).toBe('Bearer k_123');
    expect(hits[0].headers['idempotency-key']).toBe(hits[0].body.reference);
  });
  it('WhatsApp channel sends an authentication template with the code variable; template names map via WHATSAPP_TEMPLATE_MAP', async () => {
    const ch = new HttpOtpChannel('WHATSAPP', { env: providerEnv('WHATSAPP', real('WHATSAPP')), deps: noSleep });
    await ch.send({ ...msg, locale: 'ar' });
    expect(hits[0].body.template).toMatchObject({ name: 'kx_otp_ar', language: 'ar', variables: { code: '424242' } });
    expect(whatsappMapping.buildSend({ to: '+2', body: 'b', senderId: 's', reference: 'r', templateId: 'kx_otp_en', locale: 'en' }).body).toBeDefined();
    process.env.WHATSAPP_TEMPLATE_MAP = '{"kx_otp_en":"approved_otp_en"}';
    try { expect((whatsappMapping.buildSend({ to: '+2', body: 'b', senderId: 's', reference: 'r', templateId: 'kx_otp_en', locale: 'en' }).body as any).template.name).toBe('approved_otp_en'); } finally { delete process.env.WHATSAPP_TEMPLATE_MAP; }
  });
  it('failures throw a short mapped error that never contains the code, key or phone; nothing is printed', async () => {
    const out: string[] = [];
    const orig = [console.log, console.warn, console.error, console.info];
    console.log = console.warn = console.error = console.info = (...a: unknown[]) => { out.push(a.join(' ')); };
    try {
      script = [reply(400, { echo: '424242' })];
      const e = await new HttpOtpChannel('SMS', { env: providerEnv('SMS', real('SMS')), deps: noSleep }).send(msg).catch((x) => x as Error);
      expect((e as Error).message).toBe('OTP sms send failed: PROVIDER_INVALID_REQUEST_400');
      expect(JSON.stringify([(e as Error).message, (e as Error).stack])).not.toMatch(/424242|k_123|201000000001/);
    } finally { [console.log, console.warn, console.error, console.info] = orig; }
    expect(out).toEqual([]);
  });
  it('WhatsApp first, SMS fallback; reports provider refs to onSent without the code', async () => {
    const sent: unknown[] = [];
    const ch = createOtpChannelFromEnv({ env: { ...real('WHATSAPP', { WHATSAPP_API_URL: `${base}/wa`, WHATSAPP_MAX_RETRIES: '0' }), ...real('SMS', { SMS_API_URL: `${base}/sms`, SMS_MAX_RETRIES: '0' }) }, deps: noSleep, onSent: (s) => { sent.push(s); } });
    script = [reply(500, {}), reply(200, { id: 'sms_9' })];
    await ch.send(msg);
    expect(hits.map((h) => h.url)).toEqual(['/wa/messages', '/sms/messages']);
    expect(sent).toEqual([{ channel: 'sms', providerRef: 'sms_9', phone: msg.phone }]);
  });
});

describe('webhook signature + status mapping', () => {
  const secret = 'whsec_test_0123456789'; const raw = '{"events":[{"id":"a","status":"delivered"}]}';
  it('HMAC accepts valid, rejects tampered / wrong secret / stale / missing', () => {
    const h = signedWebhookHeaders(secret, raw);
    expect(verifyWebhookBody({ secret, rawBody: raw, headers: h })).toBe(true);
    expect(verifyWebhookBody({ secret, rawBody: raw + 'x', headers: h })).toBe(false);
    expect(verifyWebhookBody({ secret: 'other_secret_0123456789', rawBody: raw, headers: h })).toBe(false);
    expect(verifyWebhookBody({ secret, rawBody: raw, headers: {} })).toBe(false);
    const old = Math.floor(Date.now() / 1000) - 3600;
    expect(verifyWebhookBody({ secret, rawBody: raw, headers: { 'x-webhook-timestamp': String(old), 'x-webhook-signature': signWebhookBody(secret, old, raw) } })).toBe(false);
  });
  it('maps neutral status events and ignores unknown ones', () => {
    expect(parseGenericStatus(JSON.stringify({ events: [{ id: 'a', status: 'delivered' }, { id: 'b', status: 'failed', error: 'X' }, { id: 'c', status: '??' }] }))).toEqual([{ providerRef: 'a', status: 'DELIVERED' }, { providerRef: 'b', status: 'FAILED', error: 'X' }]);
    expect(smsMapping.parseSend({ data: { id: 5 } })).toEqual({ providerRef: '5' });
    void (null as unknown as ProviderError);
  });
});
