import type { Pool } from './db.js';

/** Server-side state attached to one login interaction (second-factor done, passkey login, federation pending). */
export type StateKind = 'totp' | 'passkey_login' | 'fed_login' | 'fed_pending' | 'totp_skip' | 'signup' | 'signup_ack';

export async function setState(pool: Pool, uid: string, kind: StateKind, sub: string, data: Record<string, unknown> = {}): Promise<void> {
  await pool.query(
    `INSERT INTO interaction_state (uid, kind, sub, data) VALUES ($1,$2,$3,$4) ON CONFLICT (uid, kind) DO UPDATE SET sub=$3, data=$4, created_at=now()`,
    [uid, kind, sub, JSON.stringify(data)]);
}
export async function getState(pool: Pool, uid: string, kind: StateKind): Promise<{ sub: string; data: Record<string, unknown> } | undefined> {
  const r = await pool.query(`SELECT sub, data FROM interaction_state WHERE uid=$1 AND kind=$2 AND created_at > now() - interval '15 minutes'`, [uid, kind]);
  return r.rows[0];
}
export async function clearStates(pool: Pool, uid: string): Promise<void> {
  await pool.query(`DELETE FROM interaction_state WHERE uid=$1`, [uid]);
}
export async function delState(pool: Pool, uid: string, ...kinds: StateKind[]): Promise<void> {
  if (kinds.length) await pool.query(`DELETE FROM interaction_state WHERE uid=$1 AND kind = ANY($2)`, [uid, kinds]);
}
