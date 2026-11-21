export type OtpLocale = 'ar' | 'en';
export interface OtpMessage {
  phone: string;
  code: string;
  locale: OtpLocale;
  ttlMinutes: number;
}
export interface OtpChannel {
  readonly name: string;
  send(msg: OtpMessage): Promise<void>;
}

export const TODO_TEMPLATE = 'TODO_NEEDS_HUMAN';

/** Local channel: prints to console (and keeps an outbox for tests). NEVER used in production. */
export class LogChannel implements OtpChannel {
  readonly name = 'log';
  readonly sent: OtpMessage[] = [];
  constructor(private readonly sink: (line: string) => void = (l) => console.log(l)) {}
  async send(msg: OtpMessage): Promise<void> {
    this.sent.push(msg);
    this.sink(`[otp-sender:log] to=${msg.phone} locale=${msg.locale} code=${msg.code} (dev only)`);
  }
  lastCodeFor(phone: string): string | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) if (this.sent[i].phone === phone) return this.sent[i].code;
    return undefined;
  }
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  /** Injected from Secrets Manager at runtime. Never hard-code. */
  accessToken: string;
  /** Meta-approved AUTHENTICATION templates per locale. TODO_NEEDS_HUMAN: submit/approve in Meta Business Manager. */
  templates: Record<OtpLocale, string>;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

/** WhatsApp Cloud API authentication-template (one-tap/copy-code) sender. Template IDs are placeholders until approved. */
export class WhatsAppAuthTemplateChannel implements OtpChannel {
  readonly name = 'whatsapp';
  constructor(private readonly cfg: WhatsAppConfig) {}
  async send(msg: OtpMessage): Promise<void> {
    const template = this.cfg.templates[msg.locale];
    if (!template || template.startsWith(TODO_TEMPLATE)) {
      throw new Error(`WhatsApp authentication template for "${msg.locale}" not configured (${TODO_TEMPLATE})`);
    }
    const f = this.cfg.fetchImpl ?? fetch;
    const res = await f(`https://graph.facebook.com/${this.cfg.graphVersion ?? 'v21.0'}/${this.cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.cfg.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: msg.phone.replace(/^\+/, ''),
        type: 'template',
        template: {
          name: template,
          language: { code: msg.locale === 'ar' ? 'ar' : 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: msg.code }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: msg.code }] },
          ],
        },
      }),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed: HTTP ${res.status}`);
  }
}

export interface SmsConfig {
  /** Provider adapter, e.g. Amazon SNS / Vonage / Twilio, wired in infra. TODO_NEEDS_HUMAN: choose provider + sender ID. */
  publish: (phone: string, text: string) => Promise<void>;
  senderId: string; // TODO_NEEDS_HUMAN registered alphanumeric sender ID
  bodies?: Partial<Record<OtpLocale, (code: string, ttlMinutes: number) => string>>;
}

export const DEFAULT_BODIES: Record<OtpLocale, (c: string, t: number) => string> = {
  // TODO_NEEDS_HUMAN: legal/brand wording for SMS body must be approved; this text is a functional placeholder.
  en: (c, t) => `Kiorex code: ${c}. Valid ${t} min. Do not share it.`,
  ar: (c, t) => `رمز كيوريكس: ${c}. صالح لمدة ${t} دقائق. لا تشاركه مع أحد.`,
};

export class SmsChannel implements OtpChannel {
  readonly name = 'sms';
  constructor(private readonly cfg: SmsConfig) {}
  async send(msg: OtpMessage): Promise<void> {
    const body = (this.cfg.bodies?.[msg.locale] ?? DEFAULT_BODIES[msg.locale])(msg.code, msg.ttlMinutes);
    await this.cfg.publish(msg.phone, body);
  }
}

/** WhatsApp first, SMS fallback (KA-02). */
export class FallbackChannel implements OtpChannel {
  readonly name: string;
  constructor(private readonly primary: OtpChannel, private readonly fallback: OtpChannel,
    private readonly onFallback: (err: unknown) => void = () => {}) {
    this.name = `${primary.name}->${fallback.name}`;
  }
  async send(msg: OtpMessage): Promise<void> {
    try { await this.primary.send(msg); } catch (e) { this.onFallback(e); await this.fallback.send(msg); }
  }
}

export type ChannelMode = 'log' | 'whatsapp' | 'sms' | 'whatsapp-sms';

export interface ChannelFactoryDeps {
  whatsapp?: WhatsAppConfig;
  sms?: SmsConfig;
  nodeEnv?: string;
}

export function createChannel(mode: ChannelMode, deps: ChannelFactoryDeps = {}): OtpChannel {
  if (mode === 'log') {
    if (deps.nodeEnv === 'production') throw new Error('OTP channel "log" is forbidden in production');
    return new LogChannel();
  }
  const wa = () => { if (!deps.whatsapp) throw new Error('whatsapp config missing'); return new WhatsAppAuthTemplateChannel(deps.whatsapp); };
  const sms = () => { if (!deps.sms) throw new Error('sms config missing'); return new SmsChannel(deps.sms); };
  if (mode === 'whatsapp') return wa();
  if (mode === 'sms') return sms();
  return new FallbackChannel(wa(), sms());
}
