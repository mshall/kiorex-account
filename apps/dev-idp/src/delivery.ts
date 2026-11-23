import { maskPhone, mappingFor, messagingKindOf, providerEnv, type StatusEvent, type StatusState } from '@kiorex/otp-sender';
import type { Pool } from './db.js';

const ORDER: StatusState[] = ['QUEUED', 'SENT', 'DELIVERED', 'READ'];

export interface DeliveryRow { provider_ref: string; channel: string; recipient_masked: string; status: string; error: string | null; created_at: string; updated_at: string }

/**
 * Delivery-status persistence for OTP and notification messages. Providers call POST /webhooks/{sms|whatsapp} (HMAC verified with
 * <KIND>_WEBHOOK_SECRET); statuses only move forward (SENT -> DELIVERED -> READ) so retried or out-of-order webhooks are harmless; FAILED is terminal.
 * Only provider reference, channel and a masked phone are stored: never the code or the raw number.
 */
export class DeliveryStatus {
  constructor(private readonly pool: Pool, private readonly env: Record<string, string | undefined> = process.env) {}

  async recordSent(channel: string, providerRef: string, phone: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO delivery_status (provider_ref, channel, recipient_masked) VALUES ($1,$2,$3) ON CONFLICT (provider_ref) DO NOTHING`,
      [providerRef, channel, maskPhone(phone)],
    );
  }

  async apply(events: StatusEvent[]): Promise<{ applied: number; ignored: number }> {
    let applied = 0; let ignored = 0;
    for (const ev of events) {
      const cur = await this.pool.query(`SELECT status FROM delivery_status WHERE provider_ref=$1`, [ev.providerRef]);
      const row = cur.rows[0] as { status: string } | undefined;
      const blocked = !row || row.status === 'FAILED' || (ev.status !== 'FAILED' && ORDER.indexOf(row.status as StatusState) >= ORDER.indexOf(ev.status));
      if (blocked || (ev.status === 'FAILED' && row!.status === 'READ')) { ignored++; continue; }
      await this.pool.query(`UPDATE delivery_status SET status=$2, error=$3, updated_at=now() WHERE provider_ref=$1`, [ev.providerRef, ev.status, ev.status === 'FAILED' ? ev.error ?? 'DELIVERY_FAILED' : null]);
      if (ev.providerRef.startsWith('mock_')) await this.pool.query(`UPDATE dev_inbox SET state=$2 WHERE id=$1`, [Number(ev.providerRef.split('_').pop()), ev.status.toLowerCase()]);
      applied++;
    }
    return { applied, ignored };
  }

  /** Verifies the signature and applies the events. Returns null when the signature is rejected. */
  async handleWebhook(channel: string, raw: string, headers: Record<string, unknown>): Promise<{ applied: number; ignored: number } | null> {
    const kind = messagingKindOf(channel.toUpperCase());
    if (!kind) return null;
    const pe = providerEnv(kind, this.env); const mapping = mappingFor(kind, pe); // native vendor (Meta / Twilio) only when <KIND>_MODE=real and <KIND>_PROVIDER names it
    if (!mapping.verifyWebhook({ secret: pe.webhookSecret, rawBody: raw, headers, publicUrl: pe.publicWebhookUrl })) return null;
    return this.apply(mapping.parseStatusWebhook(raw));
  }

  async list(limit = 200): Promise<DeliveryRow[]> {
    return (await this.pool.query(`SELECT * FROM delivery_status ORDER BY created_at DESC LIMIT $1`, [Math.min(limit, 1000)])).rows;
  }
  async clear(): Promise<void> { await this.pool.query('TRUNCATE delivery_status'); }
}
