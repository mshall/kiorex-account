import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { genericStatusBody, signedWebhookHeaders } from '@kiorex/otp-sender';
import { startHarness, startAuth, randomPhone, Browser, type Harness } from './helpers.js';

/** Real-mode OTP wiring: SMS/WhatsApp over the generic HTTP provider against a local fake vendor. */
let vendor: http.Server; let base = ''; let h: Harness;
let hits: Array<{ path: string; headers: http.IncomingHttpHeaders; body: any }> = [];
let script: Array<(res: http.ServerResponse) => void> = [];
const SECRET = 'whsec_passport_0123456789';
const reply = (status: number, body: unknown) => (res: http.ServerResponse) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

beforeAll(async () => {
  vendor = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c as Buffer));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      hits.push({ path: `${req.headers.host}${req.url}`, headers: req.headers, body: raw ? JSON.parse(raw) : undefined });
      (script.shift() ?? reply(200, { id: `ref_${hits.length}` }))(res);
    });
  });
  await new Promise<void>((r) => vendor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(vendor.address() as AddressInfo).port}`;
  h = await startHarness({ env: {
    WHATSAPP_MODE: 'real', WHATSAPP_API_URL: `${base}/wa`, WHATSAPP_API_KEY: 'wa_key', WHATSAPP_SENDER_ID: 'PNID1', WHATSAPP_WEBHOOK_SECRET: SECRET,
    SMS_MODE: 'real', SMS_API_URL: `${base}/sms`, SMS_API_KEY: 'sms_key', SMS_SENDER_ID: 'KIOREX', SMS_WEBHOOK_SECRET: SECRET, SMS_MAX_RETRIES: '0', WHATSAPP_MAX_RETRIES: '0',
  } });
});
afterAll(async () => { await h.stop(); await new Promise<void>((r) => { vendor.close(() => r()); vendor.closeAllConnections?.(); }); });
beforeEach(() => { hits = []; script = []; });

async function begin() {
  const b = new Browser();
  const a = await startAuth(h, { phone: '', browser: b });
  const uid = new URL(a.url).pathname.split('/')[2];
  await b.req(`${h.issuer}/interaction/${uid}`);
  return { post: (path: string, form: Record<string, string>) => b.req(`${h.issuer}/interaction/${uid}/${path}`, { method: 'POST', form }) };
}

describe('OTP over real providers (SMS_MODE / WHATSAPP_MODE=real)', () => {
  it('sends the code through WhatsApp only to the vendor; log channel, dev inbox and dev routes are off; code never logged', async () => {
    const logs: string[] = [];
    const spies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a) => { logs.push(a.join(' ')); }));
    try {
      const phone = randomPhone();
      const { post } = await begin();
      expect((await post('phone', { phone })).status).toBe(200);
      expect(hits).toHaveLength(1);
      expect(hits[0].path).toContain('/wa/messages');
      expect(hits[0].headers.authorization).toBe('Bearer wa_key');
      expect(hits[0].headers['idempotency-key']).toMatch(/^otp:/);
      const code = hits[0].body.template.variables.code as string;
      expect(code).toMatch(/^\d{6}$/);
      expect(hits[0].body).toMatchObject({ to: phone, from: 'PNID1', type: 'template', template: { name: 'kx_otp_en' } });
      expect(h.channel.sent).toHaveLength(0); // the injected LogChannel is not used in real mode
      expect(logs.join('\n')).not.toContain(code);
      for (const p of ['/dev/inbox', '/dev/delivery-status', '/dev/reset-rate-limits']) expect((await fetch(`${h.issuer}${p}`)).status).toBe(404);
      expect((await fetch(`${h.issuer}/dev/webhooks/simulate`, { method: 'POST', body: '{}' })).status).toBe(404);
      expect((await h.idp.pool.query(`SELECT count(*)::int n FROM dev_inbox`)).rows[0].n).toBe(0);
    } finally { spies.forEach((s) => s.mockRestore()); }
  });

  it('falls back to SMS when the WhatsApp vendor fails; error to the user is generic', async () => {
    script = [reply(503, {}), reply(200, { id: 'sms_ref_1' })];
    const phone = randomPhone();
    const { post } = await begin();
    expect((await post('phone', { phone })).status).toBe(200);
    expect(hits.map((x) => x.path.split('/')[1])).toEqual(['wa', 'sms']);
    expect(hits[1].body).toMatchObject({ to: phone, from: 'KIOREX' });
    expect(hits[1].body.body).toMatch(/\d{6}/);
  });

  it('when every provider fails the send fails closed (no code leaks into the response)', async () => {
    script = [reply(500, {}), reply(500, {})];
    const { post } = await begin();
    const r = await post('phone', { phone: randomPhone() });
    expect(r.status).not.toBe(200);
    expect(await r.text()).not.toContain(hits[0].body.template.variables.code);
  });

  it('rate limits still apply in real mode: 5 sends per phone per hour, the 6th is 429 and nothing reaches the vendor', async () => {
    const phone = randomPhone();
    const { post } = await begin();
    expect((await post('phone', { phone })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await post('resend', {})).status).toBe(200);
    expect(hits).toHaveLength(5);
    expect((await post('resend', {})).status).toBe(429);
    expect(hits).toHaveLength(5);
  });

  it('delivery-status webhook: signature required, statuses persisted forward-only, no raw phone stored', async () => {
    script = [reply(200, { id: 'wa_status_1' })];
    const phone = randomPhone();
    const { post } = await begin();
    await post('phone', { phone });
    const row = async () => (await h.idp.pool.query(`SELECT * FROM delivery_status WHERE provider_ref='wa_status_1'`)).rows[0];
    expect(await row()).toMatchObject({ status: 'SENT', channel: 'whatsapp' });
    expect((await row()).recipient_masked).not.toContain(phone);
    const send = (raw: string, headers: Record<string, string>) => fetch(`${h.issuer}/webhooks/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: raw });
    const del = genericStatusBody('wa_status_1', 'delivered');
    expect((await send(del, signedWebhookHeaders('wrong_secret_0123456789', del))).status).toBe(401);
    expect((await send(del, {})).status).toBe(401);
    expect(((await (await send(del, signedWebhookHeaders(SECRET, del))).json()) as any)).toEqual({ applied: 1, ignored: 0 });
    expect(await row()).toMatchObject({ status: 'DELIVERED' });
    const sent = genericStatusBody('wa_status_1', 'sent');
    expect(((await (await send(sent, signedWebhookHeaders(SECRET, sent))).json()) as any).ignored).toBe(1); // never moves backwards
    const failed = genericStatusBody('wa_status_1', 'failed', 'BLOCKED');
    await send(failed, signedWebhookHeaders(SECRET, failed));
    expect(await row()).toMatchObject({ status: 'FAILED', error: 'BLOCKED' });
  });
});
