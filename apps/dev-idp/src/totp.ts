import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import type { Pool } from './db.js';
import type { IdpConfig } from './config.js';
import type { Account } from './accounts.js';

export type TotpResult = { ok: true; step: number } | { ok: false; reason: 'locked' | 'invalid' | 'wrong' | 'not_enrolled'; attemptsLeft?: number };

/** KA-03/KA-10: TOTP (RFC 6238) via otplib. Local analogue of Cognito software-token MFA; ops roles are enforced at login. */
export class Totp {
  private readonly c: IdpConfig['stepUp']['totp'];
  constructor(private readonly pool: Pool, private readonly cfg: IdpConfig, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) { this.c = cfg.stepUp.totp; }

  /** Roles that must use a second factor (config mfaPolicy.requiredForRoles). */
  requiresMfa(a: Pick<Account, 'roles'>): boolean {
    return a.roles.some((r) => this.cfg.mfaPolicy.requiredForRoles.includes(r));
  }

  async isEnrolled(sub: string): Promise<boolean> {
    const r = await this.pool.query(`SELECT 1 FROM totp_credentials WHERE sub=$1 AND confirmed_at IS NOT NULL`, [sub]);
    return !!r.rows[0];
  }

  /** Removes the credential (optional-TOTP accounts only; the route refuses it for roles that require MFA). */
  async disable(sub: string): Promise<boolean> {
    const r = await this.pool.query(`DELETE FROM totp_credentials WHERE sub=$1`, [sub]);
    await this.pool.query(`DELETE FROM totp_attempts WHERE key=$1`, [`sub:${sub}`]);
    return (r.rowCount ?? 0) > 0;
  }

  /** DEV ONLY (quick-pick panel on the dev IdP, never reachable in production): the current code and the seed of a stored credential. */
  async devCurrent(sub: string): Promise<{ code: string; secret: string } | undefined> {
    const row = (await this.pool.query(`SELECT secret FROM totp_credentials WHERE sub=$1`, [sub])).rows[0] as { secret: string } | undefined;
    if (!row) return undefined;
    return { secret: row.secret, code: generateSync({ secret: row.secret, strategy: 'totp', period: this.c.periodSeconds, digits: this.c.digits as 6, epoch: this.now() }) };
  }

  /** Starts (or resumes) enrolment. A confirmed credential is never replaced here. */
  async enrolStart(a: Pick<Account, 'sub' | 'phone'>): Promise<{ secret: string; uri: string } | undefined> {
    const existing = await this.pool.query(`SELECT secret, confirmed_at FROM totp_credentials WHERE sub=$1`, [a.sub]);
    if (existing.rows[0]?.confirmed_at) return undefined;
    const secret: string = existing.rows[0]?.secret ?? generateSecret();
    if (!existing.rows[0]) await this.pool.query(`INSERT INTO totp_credentials (sub, secret) VALUES ($1,$2)`, [a.sub, secret]);
    return { secret, uri: generateURI({ strategy: 'totp', issuer: this.c.issuer, label: a.phone ?? a.sub, secret, period: this.c.periodSeconds, digits: this.c.digits as 6 }) };
  }

  private async attempts(key: string): Promise<number> {
    const since = new Date((this.now() - this.c.lockoutMinutes * 60) * 1000);
    const r = await this.pool.query(`SELECT count(*)::int AS n FROM totp_attempts WHERE key=$1 AND at > $2`, [key, since]);
    return r.rows[0].n;
  }

  /** Verifies a code with replay protection (a time-step is accepted once) and 5 wrong attempts per lockout window. */
  async verify(sub: string, codeRaw: string, opts: { confirm?: boolean } = {}): Promise<TotpResult> {
    const key = `sub:${sub}`;
    const used = await this.attempts(key);
    if (used >= this.c.maxAttemptsPerWindow) return { ok: false, reason: 'locked' };
    const row = (await this.pool.query(`SELECT secret, confirmed_at, last_step FROM totp_credentials WHERE sub=$1`, [sub])).rows[0] as
      undefined | { secret: string; confirmed_at: Date | null; last_step: string };
    if (!row || (!opts.confirm && !row.confirmed_at)) return { ok: false, reason: 'not_enrolled' };
    const code = codeRaw.replace(/\s/g, '');
    if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'invalid', attemptsLeft: this.c.maxAttemptsPerWindow - used };
    const v = verifySync({
      secret: row.secret, token: code, strategy: 'totp', period: this.c.periodSeconds, digits: this.c.digits as 6,
      epoch: this.now(), epochTolerance: this.c.epochToleranceSeconds, afterTimeStep: Number(row.last_step),
    });
    if (v.valid && 'timeStep' in v && typeof v.timeStep === 'number') {
      const upd = await this.pool.query(`UPDATE totp_credentials SET last_step=$2 WHERE sub=$1 AND last_step < $2`, [sub, v.timeStep]);
      if (upd.rowCount === 1) {
        if (opts.confirm) await this.pool.query(`UPDATE totp_credentials SET confirmed_at=COALESCE(confirmed_at, now()) WHERE sub=$1`, [sub]);
        await this.pool.query(`DELETE FROM totp_attempts WHERE key=$1`, [key]);
        return { ok: true, step: v.timeStep };
      }
    }
    await this.pool.query(`INSERT INTO totp_attempts (key, at) VALUES ($1,$2)`, [key, new Date(this.now() * 1000)]);
    const left = this.c.maxAttemptsPerWindow - used - 1;
    return left <= 0 ? { ok: false, reason: 'locked' } : { ok: false, reason: 'wrong', attemptsLeft: left };
  }
}
