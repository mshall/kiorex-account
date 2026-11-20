import { generateKeyPair, exportJWK, importJWK, type JWK, type CryptoKey } from 'jose';
import { randomUUID } from 'node:crypto';
import type { Pool } from './db.js';

export interface SigningKey {
  kid: string;
  privateJwk: JWK;
  publicJwk: JWK;
  privateKey: CryptoKey | Uint8Array;
}

/** Dev-only RSA key (RS256), persisted in Postgres so tokens survive restarts. Production keys are managed by the IdP. */
export async function loadOrCreateSigningKey(pool: Pool): Promise<SigningKey> {
  const r = await pool.query(`SELECT kid, jwk FROM signing_keys ORDER BY created_at DESC LIMIT 1`);
  let kid: string; let jwk: JWK;
  if (r.rows[0]) {
    kid = r.rows[0].kid; jwk = r.rows[0].jwk;
  } else {
    const { privateKey } = await generateKeyPair('RS256', { extractable: true, modulusLength: 2048 });
    kid = `dev-${randomUUID().slice(0, 8)}`;
    jwk = { ...(await exportJWK(privateKey)), kid, alg: 'RS256', use: 'sig' };
    await pool.query(`INSERT INTO signing_keys (kid, jwk) VALUES ($1,$2)`, [kid, JSON.stringify(jwk)]);
  }
  const { d, p, q, dp, dq, qi, ...pub } = jwk as JWK & Record<string, string>;
  void d; void p; void q; void dp; void dq; void qi;
  return { kid, privateJwk: jwk, publicJwk: pub, privateKey: await importJWK(jwk, 'RS256') };
}
