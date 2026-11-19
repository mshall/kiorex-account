import type { Adapter, AdapterPayload } from 'oidc-provider';
import type { Pool } from './db.js';

/** Postgres adapter for oidc-provider (all models in one table; session/grant lookups by column). */
export function makePgAdapter(pool: Pool): new (name: string) => Adapter {
  return class PgAdapter implements Adapter {
    constructor(private readonly model: string) {}

    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
      await pool.query(
        `INSERT INTO oidc_payloads (id, model, uid, grant_id, user_code, payload, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' seconds')::interval)
         ON CONFLICT (model, id) DO UPDATE SET uid=$3, grant_id=$4, user_code=$5, payload=$6, expires_at=now() + ($7 || ' seconds')::interval`,
        [id, this.model, payload.uid ?? null, payload.grantId ?? null, payload.userCode ?? null, JSON.stringify(payload), String(expiresIn)],
      );
    }

    private hydrate(row?: { payload: AdapterPayload; consumed_at: Date | null }): AdapterPayload | undefined {
      if (!row) return undefined;
      return { ...row.payload, ...(row.consumed_at ? { consumed: Math.floor(row.consumed_at.getTime() / 1000) } : {}) };
    }

    async find(id: string) {
      const r = await pool.query(`SELECT payload, consumed_at FROM oidc_payloads WHERE model=$1 AND id=$2 AND (expires_at IS NULL OR expires_at > now())`, [this.model, id]);
      return this.hydrate(r.rows[0]);
    }
    async findByUid(uid: string) {
      const r = await pool.query(`SELECT payload, consumed_at FROM oidc_payloads WHERE model=$1 AND uid=$2 AND (expires_at IS NULL OR expires_at > now())`, [this.model, uid]);
      return this.hydrate(r.rows[0]);
    }
    async findByUserCode(userCode: string) {
      const r = await pool.query(`SELECT payload, consumed_at FROM oidc_payloads WHERE model=$1 AND user_code=$2 AND (expires_at IS NULL OR expires_at > now())`, [this.model, userCode]);
      return this.hydrate(r.rows[0]);
    }
    async destroy(id: string) {
      await pool.query(`DELETE FROM oidc_payloads WHERE model=$1 AND id=$2`, [this.model, id]);
    }
    async revokeByGrantId(grantId: string) {
      await pool.query(`DELETE FROM oidc_payloads WHERE grant_id=$1`, [grantId]);
    }
    async consume(id: string) {
      await pool.query(`UPDATE oidc_payloads SET consumed_at=now() WHERE model=$1 AND id=$2`, [this.model, id]);
    }
  };
}

export async function purgeExpired(pool: Pool): Promise<void> {
  await pool.query(`DELETE FROM oidc_payloads WHERE expires_at < now() - interval '1 hour'`);
}
