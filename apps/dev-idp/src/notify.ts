import {
  FallbackChannel, HttpMessagingTransport, maskPhone, SmsChannel, WhatsAppAuthTemplateChannel, type OtpChannel, type OtpMessage,
} from '@kiorex/otp-sender';
import { randomUUID } from 'node:crypto';
import type { Pool } from './db.js';

/**
 * Messaging is MOCKED (CLAUDE.md founder decision 19 Nov 2026): every message is logged AND written to the DB dev inbox that
 * E2E tests read from GET /dev/inbox. The mock walks the same code paths as production: WhatsApp authentication template
 * first, SMS fallback, templates rendered per locale. REAL providers (SMS_MODE / WHATSAPP_MODE=real, see Docs/PROVIDERS.md) bypass this
 * inbox entirely (see createApp): nothing is recorded, /dev/inbox is 404 and no OTP is logged.
 */
export interface InboxMessage {
  id: number; channel: string; to: string; template: string; locale: string; body: string; data: Record<string, unknown>; state: string; created_at: string;
  /** Reference a provider status webhook would carry for this message (`mock_<channel>_<id>`), used by POST /dev/webhooks/simulate. */
  providerRef: string;
}

export class DevInbox {
  constructor(private readonly pool: Pool, private readonly log: (l: string) => void = () => {}) {}

  async record(m: { channel: string; to: string; template: string; locale: string; body: string; data?: Record<string, unknown>; state?: string }): Promise<void> {
    const ins = await this.pool.query(
      `INSERT INTO dev_inbox (channel, recipient, template, locale, body, data, state) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [m.channel, m.to, m.template, m.locale, m.body, JSON.stringify(m.data ?? {}), m.state ?? 'delivered'],
    );
    await this.pool.query(
      `INSERT INTO delivery_status (provider_ref, channel, recipient_masked, status) VALUES ($1,$2,$3,'SENT') ON CONFLICT (provider_ref) DO NOTHING`,
      [`mock_${m.channel}_${ins.rows[0].id}`, m.channel, maskPhone(m.to)],
    );
    this.log(`[dev-inbox] ${m.channel} to=${m.to} template=${m.template}`);
  }

  async list(f: { to?: string; channel?: string; template?: string; afterId?: number; limit?: number } = {}): Promise<InboxMessage[]> {
    const where: string[] = []; const args: unknown[] = [];
    if (f.to) { args.push(f.to); where.push(`recipient=$${args.length}`); }
    if (f.channel) { args.push(f.channel); where.push(`channel=$${args.length}`); }
    if (f.template) { args.push(f.template); where.push(`template=$${args.length}`); }
    if (f.afterId) { args.push(f.afterId); where.push(`id > $${args.length}`); }
    args.push(Math.min(f.limit ?? 200, 1000));
    const r = await this.pool.query(
      `SELECT id::int, channel, recipient AS "to", template, locale, body, data, state, created_at, 'mock_' || channel || '_' || id AS "providerRef" FROM dev_inbox
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id ASC LIMIT $${args.length}`, args);
    return r.rows;
  }

  async clear(): Promise<void> { await this.pool.query('TRUNCATE dev_inbox, delivery_status'); }

  /** OTP delivery channel: WhatsApp authentication-template mock first, SMS mock as fallback (KA-02 paths). */
  otpChannel(opts: { whatsappFails?: () => boolean } = {}): OtpChannel {
    const wa = new WhatsAppAuthTemplateChannel({
      phoneNumberId: 'mock-phone-number-id', accessToken: 'mock-token',
      templates: { en: 'kx_otp_en_mock', ar: 'kx_otp_ar_mock' },
      fetchImpl: (async (_url: unknown, init?: { body?: string }) => {
        if (opts.whatsappFails?.()) return new Response('{}', { status: 503 });
        const b = JSON.parse(String(init?.body ?? '{}')) as { to: string; template: { name: string; language: { code: string }; components: Array<{ parameters: Array<{ text: string }> }> } };
        const code = b.template.components[0]?.parameters[0]?.text ?? '';
        await this.record({
          channel: 'whatsapp', to: `+${b.to}`, template: b.template.name, locale: b.template.language.code,
          body: `[WhatsApp authentication template ${b.template.name}] code ${code}`, data: { code, purpose: 'otp' },
        });
        return new Response('{}', { status: 200 });
      }) as typeof fetch,
    });
    const sms = new SmsChannel({
      senderId: 'TODO_NEEDS_HUMAN',
      publish: async (phone, text) => {
        const code = text.match(/\d{4,10}/)?.[0] ?? '';
        await this.record({ channel: 'sms', to: phone, template: 'otp', locale: /[؀-ۿ]/.test(text) ? 'ar' : 'en', body: text, data: { code, purpose: 'otp' } });
      },
    });
    return new FallbackChannel(wa, sms);
  }
}

/** Delivers an OTP through two channels (the injected log channel and the dev inbox). */
export class TeeChannel implements OtpChannel {
  readonly name: string;
  constructor(private readonly a: OtpChannel, private readonly b: OtpChannel) { this.name = `${a.name}+${b.name}`; }
  async send(msg: OtpMessage): Promise<void> { await this.a.send(msg); await this.b.send(msg); }
}

export type NotifyTemplate = 'guardian_link_created' | 'guardian_link_ended' | 'org_invitation' | 'account_link_verification' | 'account_merge_completed';

const BODIES: Record<NotifyTemplate, Record<'ar' | 'en', (d: Record<string, string>) => string>> = {
  // TODO_NEEDS_HUMAN: legal/brand wording and Meta-approved utility templates. Functional placeholders only; no clinical content.
  guardian_link_created: { en: (d) => `Kiorex Passport: ${d.guardian} was added as guardian of ${d.dependant}.`, ar: (d) => `كيوريكس باسبورت: تمت إضافة ${d.guardian} كولي أمر لـ ${d.dependant}.` },
  guardian_link_ended: { en: (d) => `Kiorex Passport: guardian access for ${d.dependant} ended (${d.reason}).`, ar: (d) => `كيوريكس باسبورت: انتهى وصول ولي الأمر لـ ${d.dependant} (${d.reason}).` },
  org_invitation: { en: (d) => `Kiorex Passport: you were invited to join ${d.org} as ${d.role}. Accept with token ${d.token} (valid ${d.days} days).`, ar: (d) => `كيوريكس باسبورت: تمت دعوتك للانضمام إلى ${d.org} بصفة ${d.role}. استخدم الرمز ${d.token} (صالح ${d.days} أيام).` },
  account_link_verification: { en: (d) => `Kiorex Passport: code ${d.code} confirms you own this number for an account link request.`, ar: (d) => `كيوريكس باسبورت: الرمز ${d.code} يؤكد ملكيتك لهذا الرقم لطلب ربط الحسابات.` },
  account_merge_completed: { en: () => 'Kiorex Passport: your accounts were merged after review.', ar: () => 'كيوريكس باسبورت: تم دمج حساباتك بعد المراجعة.' },
};

export interface RealNotifier { transport: HttpMessagingTransport; onSent?: (s: { channel: string; providerRef: string; phone: string }) => Promise<void> }

/**
 * Non-OTP notifications (guardian, invitations, link review). Mock: through the mock WhatsApp channel into the dev inbox.
 * Real (WHATSAPP_MODE=real): as a WhatsApp utility template through the generic HTTP provider (template id = the notification name,
 * mapped to the Meta-approved name with WHATSAPP_TEMPLATE_MAP). Delivery failures are swallowed after the provider retries: a notification
 * must never break the action that triggered it, and the bodies / recipients are never logged.
 */
export class Notifier {
  constructor(private readonly inbox: DevInbox, private readonly real?: RealNotifier) {}
  async send(to: string, template: NotifyTemplate, locale: 'ar' | 'en', vars: Record<string, string>, data: Record<string, unknown> = {}): Promise<void> {
    const body = BODIES[template][locale](vars);
    if (!this.real) { await this.inbox.record({ channel: 'whatsapp', to, template, locale, body, data }); return; }
    const r = await this.real.transport.send({ to, body, reference: `notify:${template}:${randomUUID()}`, templateId: template, locale, variables: vars });
    if (r.ok) await this.real.onSent?.({ channel: 'whatsapp', providerRef: r.providerRef, phone: to });
  }
}
