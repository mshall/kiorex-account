import {
  generateRegistrationOptions, verifyRegistrationResponse,
  type RegistrationResponseJSON, type PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/server';
import type { Pool } from './db.js';
import type { Account } from './accounts.js';

/** Optional passkey registration (KA-03) behind flag `account.passkeys`. Library does all WebAuthn crypto. */
export class Passkeys {
  constructor(private readonly pool: Pool, private readonly rp: { id: string; name: string; origin: string }) {}

  async options(a: Account, key: string): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const existing = await this.pool.query(`SELECT credential_id FROM passkeys WHERE sub=$1`, [a.sub]);
    const opts = await generateRegistrationOptions({
      rpName: this.rp.name, rpID: this.rp.id, userName: a.phone ?? a.sub, userDisplayName: a.name ?? 'Kiorex',
      userID: new TextEncoder().encode(a.sub),
      attestationType: 'none',
      excludeCredentials: existing.rows.map((r) => ({ id: r.credential_id })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await this.pool.query(
      `INSERT INTO passkey_challenges (key, challenge, expires_at) VALUES ($1,$2, now() + interval '5 minutes')
       ON CONFLICT (key) DO UPDATE SET challenge=$2, expires_at=EXCLUDED.expires_at`,
      [key, opts.challenge],
    );
    return opts;
  }

  async verify(a: Account, key: string, body: RegistrationResponseJSON): Promise<boolean> {
    const r = await this.pool.query(`DELETE FROM passkey_challenges WHERE key=$1 AND expires_at > now() RETURNING challenge`, [key]);
    if (!r.rows[0]) return false;
    const v = await verifyRegistrationResponse({
      response: body, expectedChallenge: r.rows[0].challenge, expectedOrigin: this.rp.origin, expectedRPID: this.rp.id,
    });
    if (!v.verified || !v.registrationInfo) return false;
    const { credential, credentialDeviceType, credentialBackedUp } = v.registrationInfo;
    await this.pool.query(
      `INSERT INTO passkeys (credential_id, sub, public_key, counter, transports, device_type, backed_up) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [credential.id, a.sub, Buffer.from(credential.publicKey), credential.counter, JSON.stringify(credential.transports ?? []), credentialDeviceType, credentialBackedUp],
    );
    return true;
  }

  async list(sub: string) {
    const r = await this.pool.query(`SELECT credential_id, device_type, backed_up, created_at FROM passkeys WHERE sub=$1 ORDER BY created_at`, [sub]);
    return r.rows;
  }
}
