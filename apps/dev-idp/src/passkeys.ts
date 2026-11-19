import {
  generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse,
  type RegistrationResponseJSON, type PublicKeyCredentialCreationOptionsJSON,
  type AuthenticationResponseJSON, type PublicKeyCredentialRequestOptionsJSON, type AuthenticatorTransportFuture,
} from '@simplewebauthn/server';
import type { Pool } from './db.js';
import type { Account } from './accounts.js';

export interface PasskeyAssertion { sub: string; credentialId: string; userVerified: boolean; backedUp: boolean }

/** Passkey registration AND login/step-up assertions (KA-03, KA-10) behind flag `account.passkeys`. The library does all WebAuthn crypto. */
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

  /** WebAuthn assertion options. `sub` set = step-up for that user (allowCredentials); unset = discoverable-credential login. */
  async loginOptions(key: string, sub?: string): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const allow = sub
      ? (await this.pool.query(`SELECT credential_id, transports FROM passkeys WHERE sub=$1`, [sub])).rows
          .map((r) => ({ id: r.credential_id as string, transports: (r.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined }))
      : undefined;
    const opts = await generateAuthenticationOptions({ rpID: this.rp.id, userVerification: 'preferred', allowCredentials: allow });
    await this.pool.query(
      `INSERT INTO passkey_challenges (key, challenge, expires_at) VALUES ($1,$2, now() + interval '5 minutes')
       ON CONFLICT (key) DO UPDATE SET challenge=$2, expires_at=EXCLUDED.expires_at`,
      [key, opts.challenge],
    );
    return opts;
  }

  /** Verifies an assertion against the stored public key (signature, origin, RP ID, counter). Challenge is single-use. */
  async loginVerify(key: string, body: AuthenticationResponseJSON, expectSub?: string): Promise<PasskeyAssertion | undefined> {
    const ch = await this.pool.query(`DELETE FROM passkey_challenges WHERE key=$1 AND expires_at > now() RETURNING challenge`, [key]);
    if (!ch.rows[0]) return undefined;
    const cred = (await this.pool.query(
      `SELECT p.credential_id, p.sub, p.public_key, p.counter, p.transports FROM passkeys p JOIN accounts a ON a.sub=p.sub
        WHERE p.credential_id=$1 AND a.status='active' AND a.kind='person'`, [body.id])).rows[0];
    if (!cred || (expectSub && cred.sub !== expectSub)) return undefined;
    const v = await verifyAuthenticationResponse({
      response: body, expectedChallenge: ch.rows[0].challenge, expectedOrigin: this.rp.origin, expectedRPID: this.rp.id,
      credential: { id: cred.credential_id, publicKey: new Uint8Array(cred.public_key), counter: Number(cred.counter), transports: cred.transports ?? undefined },
      requireUserVerification: false,
    });
    if (!v.verified) return undefined;
    await this.pool.query(`UPDATE passkeys SET counter=$2, backed_up=$3 WHERE credential_id=$1`, [cred.credential_id, v.authenticationInfo.newCounter, v.authenticationInfo.credentialBackedUp]);
    return { sub: cred.sub, credentialId: cred.credential_id, userVerified: v.authenticationInfo.userVerified, backedUp: v.authenticationInfo.credentialBackedUp };
  }
}
