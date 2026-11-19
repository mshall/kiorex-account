import { createHash } from 'node:crypto';
import type { Pool } from './db.js';

/** Hash-chained auth event log (dev analogue of KA-12; production = CloudTrail/IdP logs -> immutable bucket, 2y). */
export class Audit {
  constructor(private readonly pool: Pool) {}
  async record(type: string, sub: string | null, data: Record<string, unknown> = {}): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT pg_advisory_xact_lock(hashtext('audit_events'))`);
      const prev = (await c.query(`SELECT hash FROM audit_events ORDER BY seq DESC LIMIT 1`)).rows[0]?.hash ?? 'GENESIS';
      const at = new Date().toISOString();
      const hash = createHash('sha256').update(JSON.stringify([prev, at, type, sub, data])).digest('hex');
      await c.query(`INSERT INTO audit_events (at, type, sub, data, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6)`, [at, type, sub, JSON.stringify(data), prev, hash]);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
}
