import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export interface OtpPolicy {
  codeLength: number;
  ttlSeconds: number;
  maxAttemptsPerChallenge: number;
}

export const DEFAULT_OTP_POLICY: OtpPolicy = { codeLength: 6, ttlSeconds: 300, maxAttemptsPerChallenge: 5 };

export const DEV_BYPASS_CODE = '000000';

export interface DevBypass {
  /** Honoured only when nodeEnv !== 'production'. */
  nodeEnv: string | undefined;
  testNumbers: readonly string[];
}

/** Uniformly random numeric code via CSPRNG (crypto.randomInt). */
export function generateCode(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += String(randomInt(0, 10));
  return out;
}

export function newSalt(): string {
  return randomBytes(16).toString('hex');
}

/** Salted HMAC-SHA256 so the code is never stored at rest in clear in the dev IdP DB. */
export function hashCode(code: string, salt: string): string {
  return createHmac('sha256', salt).update(code).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function verifyCodeHash(code: string, salt: string, expectedHash: string): boolean {
  return safeEqual(hashCode(code, salt), expectedHash);
}

/** `000000` is accepted ONLY for seeded test numbers and NEVER when NODE_ENV=production. */
export function isDevBypass(phone: string, code: string, bypass: DevBypass): boolean {
  if (bypass.nodeEnv === 'production') return false;
  return code === DEV_BYPASS_CODE && bypass.testNumbers.includes(phone);
}

export const E164 = /^\+[1-9]\d{7,14}$/;

export function maskPhone(phone: string): string {
  return phone.length <= 6 ? '***' : `${phone.slice(0, 4)}${'*'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}
