import { ulid } from 'ulid';
import type { Pool } from './db.js';
import type { SeedUser } from './config.js';

export interface Account {
  sub: string; phone: string | null; phone_verified: boolean; name: string | null;
  locale: 'ar' | 'en'; roles: string[]; status: string;
  kind: 'person' | 'dependant'; dob: string | null; market: string; merged_into: string | null;
}

export class Accounts {
  constructor(private readonly pool: Pool) {}

  async seed(users: SeedUser[]): Promise<void> {
    for (const u of users) {
      await this.pool.query(
        `INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles) VALUES ($1,$2,true,$3,$4,$5)
         ON CONFLICT (sub) DO UPDATE SET phone=$2, phone_verified=true, name=$3, locale=$4, roles=$5, status='active', deleted_at=NULL`,
        [u.sub, u.phone, u.name, u.locale, JSON.stringify(u.roles)],
      );
      if (u.totpSecret) { // dev-only deterministic TOTP so E2E tests can compute codes
        await this.pool.query(
          `INSERT INTO totp_credentials (sub, secret, confirmed_at) VALUES ($1,$2,now())
           ON CONFLICT (sub) DO UPDATE SET secret=$2, confirmed_at=COALESCE(totp_credentials.confirmed_at, now()), last_step=0`,
          [u.sub, u.totpSecret],
        );
      }
    }
  }
  async findBySub(sub: string): Promise<Account | undefined> {
    const r = await this.pool.query(`SELECT * FROM accounts WHERE sub=$1 AND status='active'`, [sub]);
    return r.rows[0];
  }
  /** Primary phone first, then verified contacts moved here by a reviewed merge (KA-08). */
  async findByPhone(phone: string): Promise<Account | undefined> {
    const r = await this.pool.query(`SELECT * FROM accounts WHERE phone=$1 AND status='active'`, [phone]);
    if (r.rows[0]) return r.rows[0];
    const c = await this.pool.query(
      `SELECT a.* FROM account_contacts c JOIN accounts a ON a.sub=c.sub WHERE c.type='phone' AND c.value=$1 AND a.status='active'`, [phone]);
    return c.rows[0];
  }
  /** Any status, e.g. for ops review / merge. */
  async findAnyBySub(sub: string): Promise<Account | undefined> {
    const r = await this.pool.query(`SELECT * FROM accounts WHERE sub=$1`, [sub]);
    return r.rows[0];
  }
  /** KA-06: a dependant is a patient subject without credentials (never a login user). */
  async createDependant(name: string, dob: string, locale: 'ar' | 'en', market: string): Promise<Account> {
    const sub = ulid();
    await this.pool.query(
      `INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles, kind, dob, market) VALUES ($1,NULL,false,$2,$3,'["patient"]','dependant',$4,$5)`,
      [sub, name, locale, dob, market]);
    return (await this.findBySub(sub))!;
  }
  /** Sign-up on first verified OTP (patients first). sub is an opaque ULID, never derived from the phone. */
  async create(phone: string, locale: 'ar' | 'en', name?: string | null): Promise<Account> {
    const sub = ulid();
    await this.pool.query(`INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles) VALUES ($1,$2,true,$3,$4,'["patient"]')`, [sub, phone, name || null, locale]);
    return (await this.findBySub(sub))!;
  }
  /** Self-service profile edit (name, language). Phone changes go through account linking (KA-08), never a free edit. */
  async updateProfile(sub: string, p: { name?: string | null; locale?: 'ar' | 'en' }): Promise<Account | undefined> {
    if (p.name !== undefined) await this.pool.query(`UPDATE accounts SET name=$2 WHERE sub=$1 AND status='active'`, [sub, p.name]);
    if (p.locale !== undefined) await this.pool.query(`UPDATE accounts SET locale=$2 WHERE sub=$1 AND status='active'`, [sub, p.locale]);
    return this.findBySub(sub);
  }
  async tombstone(sub: string): Promise<void> {
    await this.pool.query(`UPDATE accounts SET status='deleted', phone=NULL, name=NULL, phone_verified=false, deleted_at=now() WHERE sub=$1`, [sub]);
  }
}

/** Claims allowed in identity (ADR-013): NOTHING clinical. */
export function identityClaims(a: Account): Record<string, unknown> {
  const out: Record<string, unknown> = {
    sub: a.sub,
    phone_number: a.phone,
    phone_number_verified: a.phone_verified,
    locale: a.locale,
    kx_roles: a.roles,
  };
  if (a.name) out.name = a.name;
  return out;
}
