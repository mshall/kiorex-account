import { SignJWT } from 'jose';
import { randomUUID } from 'node:crypto';
import type { SigningKey } from './keys.js';

/** Issues IdP-signed access tokens outside the oidc-provider flow (guardian acting-as, step-up). RS256 via jose; same key as the provider. */
export async function signAccessToken(
  key: SigningKey, issuer: string, audience: string, claims: Record<string, unknown>, ttlSeconds: number, now = Math.floor(Date.now() / 1000),
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt', kid: key.kid })
    .setIssuer(issuer).setAudience(audience).setIssuedAt(now).setExpirationTime(now + ttlSeconds).setJti(randomUUID())
    .sign(key.privateKey);
}
