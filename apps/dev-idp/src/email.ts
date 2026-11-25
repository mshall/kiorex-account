import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { Audit } from './audit.js';
import type { DevInbox } from './notify.js';
import type { Pool } from './db.js';
import { HttpError } from './services.js';

const CODE_TTL_SECONDS = 600;
const MAX_ATTEMPTS = 5;
const RESEND_AFTER_SECONDS = 60;
const EMAIL = /^[^\s@]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const hash = (sub: string, email: string, code: string) => createHash('sha256').update(`${sub}\n${email}\n${code}`).digest('hex');

/**
 * Verified e-mail for the `email` and `email_verified` claims (gap closure: Kiorex corporate benefits accept a domain e-mail only when the claim is an explicit true).
 * The e-mail is the person's own and optional. It is NEVER verified by being typed: a six-digit code goes to that address (the mock e-mail channel writes the dev inbox, like every
 * other message) and `email_verified` becomes true only when the person sends the code back. Changing the address resets the flag. At most 5 attempts per code, one resend a minute.
 */
export class EmailVerification {
  constructor(private readonly pool: Pool, private readonly inbox: DevInbox, private readonly audit: Audit, private readonly now: () => number = () => Math.floor(Date.now() / 1000)) {}

  async state(sub: string): Promise<{ email: string | null; email_verified: boolean; pending: boolean }> {
    const a = await this.pool.query(`SELECT email, email_verified FROM accounts WHERE sub=$1 AND status='active'`, [sub]);
    const p = await this.pool.query(`SELECT 1 FROM email_verifications WHERE sub=$1 AND expires_at > to_timestamp($2)`, [sub, this.now()]);
    return { email: a.rows[0]?.email ?? null, email_verified: !!a.rows[0]?.email_verified, pending: !!p.rows[0] };
  }

  async start(sub: string, raw: unknown, locale: 'ar' | 'en' = 'en'): Promise<{ status: 'code_sent'; expires_in: number }> {
    const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (!EMAIL.test(email) || email.length > 254) throw new HttpError(400, 'invalid_email');
    const last = await this.pool.query(`SELECT extract(epoch FROM created_at) AS at FROM email_verifications WHERE sub=$1`, [sub]);
    if (last.rows[0] && this.now() - Number(last.rows[0].at) < RESEND_AFTER_SECONDS) throw new HttpError(429, 'email_code_resend_too_soon', { retry_after_seconds: RESEND_AFTER_SECONDS });
    const taken = await this.pool.query(`SELECT 1 FROM accounts WHERE lower(email)=$1 AND email_verified AND sub<>$2 AND status='active'`, [email, sub]);
    if (taken.rows[0]) throw new HttpError(409, 'email_in_use');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.pool.query(
      `INSERT INTO email_verifications (sub, email, code_hash, attempts, expires_at, created_at) VALUES ($1,$2,$3,0,to_timestamp($4),to_timestamp($5))
       ON CONFLICT (sub) DO UPDATE SET email=$2, code_hash=$3, attempts=0, expires_at=to_timestamp($4), created_at=to_timestamp($5)`,
      [sub, email, hash(sub, email, code), this.now() + CODE_TTL_SECONDS, this.now()]);
    // mock e-mail channel: the dev inbox (real e-mail is wired in the provider go-live pass)
    await this.inbox.record({ channel: 'email', to: email, template: 'kx_email_verify', locale, body: `[Kiorex Passport] Your e-mail verification code is ${code}. It expires in 10 minutes.`, data: { code, purpose: 'email_verify' } });
    await this.audit.record('email.verification.sent', sub, { domain: email.split('@')[1] });
    return { status: 'code_sent', expires_in: CODE_TTL_SECONDS };
  }

  async verify(sub: string, rawCode: unknown): Promise<{ email: string; email_verified: true }> {
    const code = typeof rawCode === 'string' ? rawCode.trim() : '';
    const r = await this.pool.query(`SELECT email, code_hash, attempts FROM email_verifications WHERE sub=$1 AND expires_at > to_timestamp($2)`, [sub, this.now()]);
    const row = r.rows[0] as { email: string; code_hash: string; attempts: number } | undefined;
    if (!row) throw new HttpError(400, 'no_pending_email_verification');
    if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'too_many_attempts');
    const ok = /^\d{6}$/.test(code) && timingSafeEqual(Buffer.from(hash(sub, row.email, code)), Buffer.from(row.code_hash));
    if (!ok) {
      await this.pool.query(`UPDATE email_verifications SET attempts = attempts + 1 WHERE sub=$1`, [sub]);
      await this.audit.record('email.verification.failed', sub, {});
      throw new HttpError(400, 'invalid_code');
    }
    await this.pool.query(`UPDATE accounts SET email=$2, email_verified=true WHERE sub=$1 AND status='active'`, [sub, row.email]);
    await this.pool.query(`DELETE FROM email_verifications WHERE sub=$1`, [sub]);
    await this.audit.record('email.verified', sub, { domain: row.email.split('@')[1] });
    return { email: row.email, email_verified: true };
  }

  /** Remove the address (and the flag). */
  async remove(sub: string): Promise<void> {
    await this.pool.query(`UPDATE accounts SET email=NULL, email_verified=false WHERE sub=$1`, [sub]);
    await this.pool.query(`DELETE FROM email_verifications WHERE sub=$1`, [sub]);
    await this.audit.record('email.removed', sub, {});
  }
}
