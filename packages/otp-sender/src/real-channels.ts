import { randomUUID } from 'node:crypto';
import { DEFAULT_BODIES, FallbackChannel, LogChannel, type OtpChannel, type OtpMessage } from './channels.js';
import { assertProviderConfig, providerEnv, type ProviderEnv } from './providers/env.js';
import type { HttpDeps } from './providers/http.js';
import { HttpMessagingTransport, type MessagingKind } from './providers/real-adapters.js';

/** WhatsApp authentication templates used for OTP. Map to the Meta-approved names with WHATSAPP_TEMPLATE_MAP (no code change). */
export const OTP_TEMPLATE: Record<'ar' | 'en', string> = { en: 'kx_otp_en', ar: 'kx_otp_ar' };

export interface HttpOtpChannelOpts {
  env?: ProviderEnv;
  deps?: HttpDeps;
  /** Called after the provider accepted the message (provider reference + phone, never the code). Used for delivery-status persistence. */
  onSent?: (s: { channel: string; providerRef: string; phone: string }) => void | Promise<void>;
}

/**
 * OTP over the generic HTTP provider (SMS_* or WHATSAPP_* env, see Docs/PROVIDERS.md). The code goes ONLY to the provider request body:
 * it is never logged, never placed in an error message, and the provider error text is mapped to a short code.
 */
export class HttpOtpChannel implements OtpChannel {
  readonly name: string;
  private readonly transport: HttpMessagingTransport;
  constructor(private readonly kind: MessagingKind, private readonly opts: HttpOtpChannelOpts = {}) {
    this.name = kind.toLowerCase();
    this.transport = new HttpMessagingTransport(kind, opts.env ?? providerEnv(kind), opts.deps);
  }
  async send(msg: OtpMessage): Promise<void> {
    const body = DEFAULT_BODIES[msg.locale](msg.code, msg.ttlMinutes);
    const r = await this.transport.send({
      to: msg.phone, body, reference: `otp:${randomUUID()}`, locale: msg.locale,
      templateId: this.kind === 'WHATSAPP' ? OTP_TEMPLATE[msg.locale] : 'otp',
      variables: this.kind === 'WHATSAPP' ? { code: msg.code, ttlMinutes: String(msg.ttlMinutes) } : undefined,
    });
    if (!r.ok) throw new Error(`OTP ${this.name} send failed: ${r.error}`);
    await this.opts.onSent?.({ channel: this.name, providerRef: r.providerRef, phone: msg.phone });
  }
}

export interface EnvChannelOpts { nodeEnv?: string; deps?: HttpDeps; onSent?: HttpOtpChannelOpts['onSent']; env?: Record<string, string | undefined> }

/**
 * Builds the OTP channel from env only: WHATSAPP_MODE / SMS_MODE (+ _API_URL / _API_KEY / _SENDER_ID / _WEBHOOK_SECRET).
 * both real -> WhatsApp first, SMS fallback (KA-02); one real -> that one; none real -> dev log channel, FORBIDDEN in production.
 * Throws (names only) when a real kind is missing configuration, so a bad deploy fails at cold start, not at first login.
 */
export function createOtpChannelFromEnv(o: EnvChannelOpts = {}): OtpChannel {
  const env = o.env ?? process.env;
  assertProviderConfig(env, ['SMS', 'WHATSAPP']);
  const wa = providerEnv('WHATSAPP', env); const sms = providerEnv('SMS', env);
  const mk = (kind: MessagingKind, e: ProviderEnv) => new HttpOtpChannel(kind, { env: e, deps: o.deps, onSent: o.onSent });
  if (wa.mode === 'real' && sms.mode === 'real') return new FallbackChannel(mk('WHATSAPP', wa), mk('SMS', sms));
  if (wa.mode === 'real') return mk('WHATSAPP', wa);
  if (sms.mode === 'real') return mk('SMS', sms);
  if (o.nodeEnv === 'production') throw new Error('OTP delivery cannot run in mock mode in production: set SMS_MODE and/or WHATSAPP_MODE=real');
  return new LogChannel();
}

export const isRealOtp = (env: Record<string, string | undefined> = process.env): boolean => providerEnv('WHATSAPP', env).mode === 'real' || providerEnv('SMS', env).mode === 'real';
