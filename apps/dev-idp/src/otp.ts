import { randomUUID } from 'node:crypto';
import {
  E164, generateCode, hashCode, isDevBypass, newSalt, verifyCodeHash, type OtpChannel, type OtpLocale,
} from '@kiorex/otp-sender';
import type { Pool } from './db.js';
import type { IdpConfig } from './config.js';

export type SendResult =
  | { ok: true; challengeId: string }
  | { ok: false; reason: 'invalid_phone' | 'phone_rate_limited' | 'ip_rate_limited' | 'locked' | 'send_failed'; retryAfterSeconds?: number };

export type VerifyResult =
  | { ok: true; phone: string; name: string | null; locale: OtpLocale }
  | { ok: false; reason: 'no_challenge' | 'expired' | 'wrong' | 'locked' | 'invalid'; attemptsLeft?: number };

export class OtpService {
  private readonly p: IdpConfig['passwordless']['otp'];
  constructor(
    private readonly pool: Pool,
    cfg: IdpConfig,
    private readonly channel: OtpChannel,
    private readonly opts: { nodeEnv: string | undefined; testNumbers: string[] },
  ) {
    this.p = cfg.passwordless.otp;
  }

  async lockedFor(phone: string): Promise<number> {
    const r = await this.pool.query(`SELECT GREATEST(0, EXTRACT(EPOCH FROM (until - now())))::int AS s FROM otp_lockouts WHERE phone=$1 AND until > now()`, [phone]);
    return r.rows[0]?.s ?? 0;
  }

  /** KA-02: 5 sends/phone/hour, 20/IP/hour; lockout after an exhausted challenge. */
  async send(args: { interactionUid: string; phone: string; ip: string; locale: OtpLocale; name?: string | null }): Promise<SendResult> {
    const { interactionUid, phone, ip, locale } = args;
    if (!E164.test(phone)) return { ok: false, reason: 'invalid_phone' };
    const lock = await this.lockedFor(phone);
    if (lock > 0) return { ok: false, reason: 'locked', retryAfterSeconds: lock };
    const count = async (col: 'phone' | 'ip', v: string) =>
      (await this.pool.query(`SELECT count(*)::int AS n FROM otp_send_log WHERE ${col}=$1 AND at > now() - interval '1 hour'`, [v])).rows[0].n as number;
    if ((await count('phone', phone)) >= this.p.maxSendsPerPhonePerHour) return { ok: false, reason: 'phone_rate_limited', retryAfterSeconds: 3600 };
    if ((await count('ip', ip)) >= this.p.maxSendsPerIpPerHour) return { ok: false, reason: 'ip_rate_limited', retryAfterSeconds: 3600 };

    const code = generateCode(this.p.codeLength);
    const salt = newSalt();
    const id = randomUUID();
    await this.pool.query(`INSERT INTO otp_send_log (phone, ip) VALUES ($1,$2)`, [phone, ip]);
    await this.pool.query(
      `INSERT INTO otp_challenges (id, interaction_uid, phone, salt, hash, locale, name, ip, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + ($9 || ' seconds')::interval)`,
      [id, interactionUid, phone, salt, hashCode(code, salt), locale, args.name ?? null, ip, String(this.p.ttlSeconds)],
    );
    try {
      await this.channel.send({ phone, code, locale, ttlMinutes: Math.ceil(this.p.ttlSeconds / 60) });
    } catch {
      return { ok: false, reason: 'send_failed' };
    }
    return { ok: true, challengeId: id };
  }

  async latest(interactionUid: string) {
    const r = await this.pool.query(`SELECT * FROM otp_challenges WHERE interaction_uid=$1 ORDER BY created_at DESC LIMIT 1`, [interactionUid]);
    return r.rows[0] as undefined | {
      id: string; phone: string; salt: string; hash: string; locale: OtpLocale; name: string | null;
      attempts: number; locked: boolean; expires_at: Date; verified_at: Date | null; consumed_at: Date | null;
    };
  }

  /** KA-02: 5 attempts per challenge, then the challenge is dead and the phone is locked out. */
  async verify(interactionUid: string, codeRaw: string): Promise<VerifyResult> {
    const ch = await this.latest(interactionUid);
    if (!ch || ch.consumed_at) return { ok: false, reason: 'no_challenge' };
    if (ch.locked) return { ok: false, reason: 'locked' };
    if (ch.verified_at) return { ok: true, phone: ch.phone, name: ch.name, locale: ch.locale };
    if (ch.expires_at.getTime() < Date.now()) return { ok: false, reason: 'expired' };
    const code = codeRaw.trim();
    if (!/^\d{4,10}$/.test(code)) return { ok: false, reason: 'invalid', attemptsLeft: this.p.maxAttemptsPerChallenge - ch.attempts };

    // atomically count the attempt first (prevents parallel guessing past the limit)
    const upd = await this.pool.query(
      `UPDATE otp_challenges SET attempts = attempts + 1 WHERE id=$1 AND attempts < $2 AND NOT locked RETURNING attempts`,
      [ch.id, this.p.maxAttemptsPerChallenge],
    );
    if (upd.rowCount === 0) return { ok: false, reason: 'locked' };
    const attempts = upd.rows[0].attempts as number;

    const good = isDevBypass(ch.phone, code, { nodeEnv: this.opts.nodeEnv, testNumbers: this.opts.testNumbers })
      || verifyCodeHash(code, ch.salt, ch.hash);
    if (good) {
      await this.pool.query(`UPDATE otp_challenges SET verified_at=now() WHERE id=$1`, [ch.id]);
      return { ok: true, phone: ch.phone, name: ch.name, locale: ch.locale };
    }
    if (attempts >= this.p.maxAttemptsPerChallenge) {
      await this.pool.query(`UPDATE otp_challenges SET locked=true WHERE id=$1`, [ch.id]);
      await this.pool.query(
        `INSERT INTO otp_lockouts (phone, until) VALUES ($1, now() + ($2 || ' minutes')::interval)
         ON CONFLICT (phone) DO UPDATE SET until = EXCLUDED.until`,
        [ch.phone, String(this.p.lockoutMinutesAfterExhaustedChallenge)],
      );
      return { ok: false, reason: 'locked' };
    }
    return { ok: false, reason: 'wrong', attemptsLeft: this.p.maxAttemptsPerChallenge - attempts };
  }

  /** Marks a verified challenge consumed so the interaction can finish only once. */
  async consume(interactionUid: string): Promise<{ phone: string; name: string | null; locale: OtpLocale } | undefined> {
    const r = await this.pool.query(
      `UPDATE otp_challenges SET consumed_at=now() WHERE id = (SELECT id FROM otp_challenges WHERE interaction_uid=$1 ORDER BY created_at DESC LIMIT 1)
       AND verified_at IS NOT NULL AND consumed_at IS NULL AND NOT locked RETURNING phone, name, locale`,
      [interactionUid],
    );
    return r.rows[0];
  }

  async resetRateLimits(): Promise<void> {
    await this.pool.query(`DELETE FROM otp_send_log; DELETE FROM otp_lockouts;`);
  }
}
