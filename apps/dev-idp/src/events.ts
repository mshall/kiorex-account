import type { Pool } from './db.js';

/**
 * Identity events the IdP publishes to products (KX-09 envelope; schemas in kiorex-contracts, additive since 1.1.0):
 * guardian.link.changed, membership.changed, account.merged. Dev analogue: rows in event_outbox, readable at GET /dev/events.
 * Payloads carry identifiers and relationship facts only, never clinical data (ADR-013).
 */
export type IdentityEventType = 'guardian.link.changed' | 'membership.changed' | 'account.merged';

export class Events {
  constructor(private readonly pool: Pool) {}
  async emit(type: IdentityEventType, aggregateType: string, aggregateId: string, data: Record<string, unknown>): Promise<void> {
    await this.pool.query(`INSERT INTO event_outbox (type, aggregate_type, aggregate_id, data) VALUES ($1,$2,$3,$4)`,
      [type, aggregateType, aggregateId, JSON.stringify(data)]);
  }
  async list(afterId = 0, type?: string) {
    const r = await this.pool.query(
      `SELECT id::int, type, aggregate_type AS "aggregateType", aggregate_id AS "aggregateId", data, occurred_at AS "occurredAt"
         FROM event_outbox WHERE id > $1 ${type ? 'AND type=$2' : ''} ORDER BY id ASC LIMIT 500`, type ? [afterId, type] : [afterId]);
    return r.rows;
  }
}
