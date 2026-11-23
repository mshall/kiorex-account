import { describe, it, expect } from 'vitest';
import { createOtpChannelFromEnv, FallbackChannel, HttpOtpChannel, providerEnv, providerProblems, messagingMapping } from '../src/index.js';
import { signMetaBody, verifyMetaSignature } from '../src/providers/vendors/meta-whatsapp.js';
import { signTwilio, verifyTwilioSignature } from '../src/providers/vendors/twilio-sms.js';

/** OTP over the NATIVE vendors (Meta WhatsApp authentication template, Twilio SMS) against faked HTTP: only env decides. */
const META = { WHATSAPP_MODE: 'real', WHATSAPP_PROVIDER: 'meta', WHATSAPP_API_KEY: 'EAAG_token', WHATSAPP_SENDER_ID: '1055550001', WHATSAPP_WEBHOOK_SECRET: 'app_secret_0123456789ab', WHATSAPP_VERIFY_TOKEN: 'vt' };
const TWILIO = { SMS_MODE: 'real', SMS_PROVIDER: 'twilio', SMS_API_KEY: 'ACabc:tok_0123456789abcdef', SMS_SENDER_ID: 'KIOREX', SMS_WEBHOOK_PUBLIC_URL: 'https://account.kiorex.com/webhooks/sms' };
const fake = (...replies: Array<{ status?: number; json?: unknown }>) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string, init: RequestInit = {}) => { calls.push({ url, init }); const r = replies.shift() ?? { json: {} }; return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } }); };
  return { calls, deps: { fetchImpl: fn as never, sleep: async () => undefined, random: () => 0 } };
};
const msg = { phone: '+201000000001', code: '424242', locale: 'ar' as const, ttlMinutes: 5 };

describe('OTP via Meta WhatsApp Cloud API', () => {
  it('sends the AUTHENTICATION template (code in body + copy-code button), never the plain text', async () => {
    const f = fake({ json: { messages: [{ id: 'wamid.OTP1' }] } });
    const sent: string[] = [];
    const ch = new HttpOtpChannel('WHATSAPP', { env: providerEnv('WHATSAPP', META), deps: f.deps, onSent: (s) => { sent.push(s.providerRef); } });
    const saved = process.env; process.env = { ...saved, WHATSAPP_TEMPLATE_MAP: '{"kx_otp_ar":"kiorex_otp_ar_v1"}' };
    try { await ch.send(msg); } finally { process.env = saved; }
    expect(sent).toEqual(['wamid.OTP1']);
    expect(f.calls[0].url).toBe('https://graph.facebook.com/v21.0/1055550001/messages');
    const body = JSON.parse(f.calls[0].init.body as string);
    expect(body.to).toBe('201000000001');
    expect(body.template).toEqual({ name: 'kiorex_otp_ar_v1', language: { code: 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text: '424242' }] }, { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '424242' }] }] });
  });
  it('a provider rejection never leaks the code or the vendor body', async () => {
    const f = fake({ status: 400, json: { error: { message: 'bad 424242' } } });
    const ch = new HttpOtpChannel('WHATSAPP', { env: providerEnv('WHATSAPP', META), deps: f.deps });
    await expect(ch.send(msg)).rejects.toThrow('OTP whatsapp send failed: PROVIDER_INVALID_REQUEST_400');
  });
  it('fails fast without the verify token; verifies X-Hub-Signature-256', () => {
    expect(providerProblems('WHATSAPP', { ...META, WHATSAPP_VERIFY_TOKEN: '' })).toContain('WHATSAPP_VERIFY_TOKEN is required when WHATSAPP_PROVIDER=meta');
    const raw = '{}';
    expect(verifyMetaSignature(META.WHATSAPP_WEBHOOK_SECRET, raw, { 'x-hub-signature-256': signMetaBody(META.WHATSAPP_WEBHOOK_SECRET, raw) })).toBe(true);
    expect(messagingMapping('WHATSAPP', META).verifyWebhook({ secret: META.WHATSAPP_WEBHOOK_SECRET, rawBody: raw, headers: {} })).toBe(false);
  });
});

describe('OTP via Twilio SMS (fallback after WhatsApp)', () => {
  it('posts a form body with basic auth', async () => {
    const f = fake({ status: 201, json: { sid: 'SM1' } });
    await new HttpOtpChannel('SMS', { env: providerEnv('SMS', TWILIO), deps: f.deps }).send({ ...msg, locale: 'en' });
    expect(f.calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/ACabc/Messages.json');
    const form = Object.fromEntries(new URLSearchParams(f.calls[0].init.body as string));
    expect(form).toMatchObject({ To: '+201000000001', From: 'KIOREX', StatusCallback: TWILIO.SMS_WEBHOOK_PUBLIC_URL });
    expect(form.Body).toContain('424242');
    expect(new Headers(f.calls[0].init.headers).get('authorization')).toBe(`Basic ${Buffer.from('ACabc:tok_0123456789abcdef').toString('base64')}`);
  });
  it('callback signature round-trips', () => {
    const raw = 'MessageSid=SM1&MessageStatus=delivered';
    expect(verifyTwilioSignature('tok', 'https://x/cb', raw, { 'x-twilio-signature': signTwilio('tok', 'https://x/cb', raw) })).toBe(true);
  });
  it('WhatsApp first, SMS fallback from env alone', () => {
    expect(createOtpChannelFromEnv({ env: { ...META, ...TWILIO } })).toBeInstanceOf(FallbackChannel);
    expect(() => createOtpChannelFromEnv({ env: { ...TWILIO, SMS_WEBHOOK_PUBLIC_URL: '' } })).toThrow(/SMS_WEBHOOK_PUBLIC_URL/);
  });
});
