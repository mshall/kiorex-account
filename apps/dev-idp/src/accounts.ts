import { ulid } from 'ulid';
import type { Pool } from './db.js';
import type { SeedUser } from './config.js';

export interface Account {
  sub: string; phone: string | null; phone_verified: boolean; name: string | null;
  locale: 'ar' | 'en'; roles: string[]; status: string;
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
    }
  }
  async findBySub(sub: string): Promise<Account | undefined> {
    const r = await this.pool.query(`SELECT * FROM accounts WHERE sub=$1 AND status='active'`, [sub]);
    return r.rows[0];
  }
  async findByPhone(phone: string): Promise<Account | undefined> {
    const r = await this.pool.query(`SELECT * FROM accounts WHERE phone=$1 AND status='active'`, [phone]);
    return r.rows[0];
  }
  /** Sign-up on first verified OTP (patients first). sub is an opaque ULID, never derived from the phone. */
  async create(phone: string, locale: 'ar' | 'en', name?: string | null): Promise<Account> {
    const sub = ulid();
    await this.pool.query(`INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles) VALUES ($1,$2,true,$3,$4,'["patient"]')`, [sub, phone, name || null, locale]);
    return (await this.findBySub(sub))!;
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
