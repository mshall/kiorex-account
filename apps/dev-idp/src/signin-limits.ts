import { ulid } from 'ulid';
import type { Account } from './accounts.js';
import { HttpError, type Ctx } from './services.js';

/**
 * Sign-in limits (28 Nov 2026): the one-time-code numbers of Passport as a maker-checker, audited setting instead of a file edit.
 *
 * A Passport ops_admin proposes, a different ops_admin or super_admin approves (a super_admin may apply directly as a break-glass, audited), and the
 * value is live within seconds (5 s cache) without a redeploy. The defaults are the values of `config/idp.json` `passwordless.otp` (what runs today):
 * with nothing stored the behaviour is exactly the file's. Every number has a HARD range in code below: the abuse controls can be tuned but never
 * switched off or opened wide (a ceiling per phone and per address, a floor on attempts, a bounded code lifetime). The ranges are code rules,
 * not settings. The code length, channels and the development bypass stay in the file (they are deployment facts, not business numbers).
 */
export interface OtpLimits {
  maxSendsPerPhonePerHour: number; maxSendsPerIpPerHour: number; maxAttemptsPerChallenge: number; ttlSeconds: number; lockoutMinutesAfterExhaustedChallenge: number;
}
export type LimitKey = keyof OtpLimits;
/** Hard ranges: [min, max]. The ceilings are what keeps an abuse control an abuse control. */
export const LIMIT_RANGES: Record<LimitKey, readonly [number, number]> = {
  maxSendsPerPhonePerHour: [1, 10],
  maxSendsPerIpPerHour: [5, 60],
  maxAttemptsPerChallenge: [3, 8],
  ttlSeconds: [60, 600],
  lockoutMinutesAfterExhaustedChallenge: [5, 240],
};
export const LIMIT_KEYS = Object.keys(LIMIT_RANGES) as LimitKey[];

export interface LimitsChange {
  id: string; proposed_by: string; limits: Partial<OtpLimits>; note: string | null; base_version: number; status: 'pending' | 'applied' | 'rejected' | 'withdrawn';
  decided_by: string | null; decided_at: Date | null; decision_note: string | null; applied_directly: boolean; created_at: Date;
}

/** Pure: the effective numbers = file defaults overlaid with the stored overrides, every value clamped into its hard range. */
export function effectiveLimits(defaults: OtpLimits, stored: Partial<OtpLimits> | null | undefined): OtpLimits {
  const out = { ...defaults };
  for (const k of LIMIT_KEYS) {
    const v = stored?.[k];
    if (typeof v === 'number' && Number.isInteger(v)) out[k] = Math.min(LIMIT_RANGES[k][1], Math.max(LIMIT_RANGES[k][0], v));
    else out[k] = Math.min(LIMIT_RANGES[k][1], Math.max(LIMIT_RANGES[k][0], defaults[k]));
  }
  return out;
}

export class SigninLimits {
  private cache: { at: number; limits: OtpLimits } | null = null;
  constructor(private readonly c: Ctx, private readonly ttlMs = 5000) {}

  defaults(): OtpLimits {
    const o = this.c.cfg.passwordless.otp as unknown as OtpLimits;
    return { maxSendsPerPhonePerHour: o.maxSendsPerPhonePerHour, maxSendsPerIpPerHour: o.maxSendsPerIpPerHour, maxAttemptsPerChallenge: o.maxAttemptsPerChallenge, ttlSeconds: o.ttlSeconds, lockoutMinutesAfterExhaustedChallenge: o.lockoutMinutesAfterExhaustedChallenge };
  }

  async current(): Promise<{ stored: Partial<OtpLimits>; version: number; updated_by: string | null; updated_at: Date | null }> {
    const r = await this.c.pool.query(`SELECT limits, version, updated_by, updated_at FROM signin_limits WHERE id = 1`);
    const row = r.rows[0];
    if (!row) return { stored: {}, version: 0, updated_by: null, updated_at: null };
    return { stored: normalise(row.limits), version: Number(row.version), updated_by: row.updated_by, updated_at: row.updated_at };
  }

  /** Read on every send and verify (cached for a few seconds, dropped at once after a change). A storage error never blocks sign-in: the file's numbers apply. */
  async effective(): Promise<OtpLimits> {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache.limits;
    let limits: OtpLimits;
    try { limits = effectiveLimits(this.defaults(), (await this.current()).stored); } catch { limits = effectiveLimits(this.defaults(), null); }
    this.cache = { at: Date.now(), limits };
    return limits;
  }

  validate(input: unknown): Partial<OtpLimits> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'invalid_limits', { detail: 'limits object required' });
    const out: Partial<OtpLimits> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (!(LIMIT_KEYS as string[]).includes(k)) throw new HttpError(400, 'invalid_limits', { detail: 'unknown limit', key: k, allowed: LIMIT_KEYS });
      if (typeof v !== 'number' || !Number.isInteger(v)) throw new HttpError(400, 'invalid_limits', { detail: 'whole number required', key: k });
      const [min, max] = LIMIT_RANGES[k as LimitKey];
      if (v < min || v > max) throw new HttpError(400, 'limit_out_of_range', { key: k, min, max, value: v });
      out[k as LimitKey] = v;
    }
    return out;
  }

  private async changeRow(id: string): Promise<LimitsChange> {
    const r = await this.c.pool.query(`SELECT * FROM signin_limits_changes WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new HttpError(404, 'not_found');
    return { ...r.rows[0], limits: normalise(r.rows[0].limits), base_version: Number(r.rows[0].base_version) };
  }

  async list(limit = 30): Promise<Array<LimitsChange & { proposed_by_name: string | null; decided_by_name: string | null }>> {
    const r = await this.c.pool.query(
      `SELECT c.*, p.name AS proposed_by_name, d.name AS decided_by_name FROM signin_limits_changes c
         LEFT JOIN accounts p ON p.sub = c.proposed_by LEFT JOIN accounts d ON d.sub = c.decided_by ORDER BY c.created_at DESC LIMIT $1`, [limit]);
    return r.rows.map((x) => ({ ...x, limits: normalise(x.limits), base_version: Number(x.base_version) }));
  }

  /** The full document the screen edits: every key, stored value or the file default. */
  async view() {
    const cur = await this.current();
    return { defaults: this.defaults(), stored: cur.stored, effective: effectiveLimits(this.defaults(), cur.stored), ranges: LIMIT_RANGES, version: cur.version, updated_by: cur.updated_by, updated_at: cur.updated_at };
  }

  async propose(actor: Account, body: Record<string, unknown>): Promise<LimitsChange> {
    const limits = this.validate(body.limits);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    const cur = await this.current();
    if (canon(limits) === canon(cur.stored)) throw new HttpError(409, 'no_change');
    const direct = body.apply === true;
    if (direct && !actor.roles.includes('super_admin')) throw new HttpError(403, 'super_admin_required_for_direct_apply');
    const id = ulid();
    await this.c.pool.query(`INSERT INTO signin_limits_changes (id, proposed_by, limits, note, base_version, status) VALUES ($1,$2,$3,$4,$5,'pending')`, [id, actor.sub, JSON.stringify(limits), note || null, cur.version]);
    await this.c.audit.record('signin.limits.proposed', actor.sub, { change: id, limits, base_version: cur.version });
    if (direct) return this.apply(actor, id, true, note);
    return this.changeRow(id);
  }

  async approve(actor: Account, id: string, note?: unknown): Promise<LimitsChange> {
    const ch = await this.changeRow(id);
    if (ch.status !== 'pending') throw new HttpError(409, 'not_pending');
    if (ch.proposed_by === actor.sub) throw new HttpError(403, 'second_person_required');
    return this.apply(actor, id, false, typeof note === 'string' ? note.trim().slice(0, 500) : '');
  }

  private async apply(actor: Account, id: string, direct: boolean, decisionNote: string): Promise<LimitsChange> {
    const ch = await this.changeRow(id);
    const cur = await this.current();
    if (cur.version !== ch.base_version) throw new HttpError(409, 'stale_proposal', { current_version: cur.version, base_version: ch.base_version });
    // the ranges are code: re-checked at apply time, so a row written by hand cannot widen them
    this.validate(ch.limits);
    const c = await this.c.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO signin_limits (id, limits, version, updated_by, updated_at) VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET limits = $1, version = $2, updated_by = $3, updated_at = now()`, [JSON.stringify(ch.limits), cur.version + 1, actor.sub]);
      await c.query(`UPDATE signin_limits_changes SET status = 'applied', decided_by = $2, decided_at = now(), decision_note = $3, applied_directly = $4 WHERE id = $1 AND status = 'pending'`, [id, actor.sub, decisionNote || null, direct]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
    this.cache = null;
    await this.c.audit.record(direct ? 'signin.limits.applied_direct' : 'signin.limits.applied', actor.sub, { change: id, proposed_by: ch.proposed_by, limits: ch.limits, version: cur.version + 1, previous: cur.stored });
    return this.changeRow(id);
  }

  async reject(actor: Account, id: string, note?: unknown): Promise<LimitsChange> {
    const ch = await this.changeRow(id);
    if (ch.status !== 'pending') throw new HttpError(409, 'not_pending');
    if (ch.proposed_by === actor.sub) throw new HttpError(403, 'use_withdraw');
    await this.c.pool.query(`UPDATE signin_limits_changes SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`, [id, actor.sub, typeof note === 'string' ? note.trim().slice(0, 500) || null : null]);
    await this.c.audit.record('signin.limits.rejected', actor.sub, { change: id, proposed_by: ch.proposed_by });
    return this.changeRow(id);
  }

  async withdraw(actor: Account, id: string): Promise<LimitsChange> {
    const ch = await this.changeRow(id);
    if (ch.status !== 'pending') throw new HttpError(409, 'not_pending');
    if (ch.proposed_by !== actor.sub) throw new HttpError(403, 'only_proposer_can_withdraw');
    await this.c.pool.query(`UPDATE signin_limits_changes SET status = 'withdrawn', decided_by = $2, decided_at = now() WHERE id = $1`, [id, actor.sub]);
    await this.c.audit.record('signin.limits.withdrawn', actor.sub, { change: id });
    return this.changeRow(id);
  }
}

function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
function normalise(p: unknown): Partial<OtpLimits> {
  const o = (p ?? {}) as Record<string, unknown>; const out: Partial<OtpLimits> = {};
  for (const k of LIMIT_KEYS) if (typeof o[k] === 'number') out[k] = o[k] as number;
  return out;
}
