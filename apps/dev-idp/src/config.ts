import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '../../..');

const envBlock = z.object({
  clientSecret: z.string().optional(),
  redirectUris: z.array(z.string()),
  postLogoutRedirectUris: z.array(z.string()).default([]),
  backchannelLogoutUri: z.string().optional(),
});
const clientSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  type: z.enum(['public', 'confidential']),
  grantTypes: z.array(z.string()),
  scopes: z.array(z.string()),
  pkce: z.literal('S256'),
  applicationType: z.enum(['web', 'native']).optional(),
  tokenEndpointAuthMethod: z.string().optional(),
  mfaRequired: z.boolean().optional(),
  environments: z.object({ local: envBlock }).passthrough(),
});
const idpSchema = z.object({
  issuer: z.object({ local: z.string() }).passthrough(),
  defaultAudience: z.string(),
  resourceServers: z.array(z.object({ identifier: z.string() }).passthrough()),
  scopes: z.array(z.object({ name: z.string(), claims: z.array(z.string()) }).passthrough()),
  accessTokenClaims: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
  tokenLifetimes: z.object({
    accessTokenSeconds: z.number().max(900),
    idTokenSeconds: z.number(),
    refreshTokenDays: z.number(),
    authorizationCodeSeconds: z.number(),
    sessionDays: z.number(),
    interactionSeconds: z.number(),
  }).passthrough(),
  passwordless: z.object({
    otp: z.object({
      codeLength: z.number(),
      ttlSeconds: z.number(),
      maxAttemptsPerChallenge: z.number(),
      maxSendsPerPhonePerHour: z.number(),
      maxSendsPerIpPerHour: z.number(),
      lockoutMinutesAfterExhaustedChallenge: z.number(),
    }).passthrough(),
    passkeys: z.object({ flag: z.string(), rpName: z.string() }).passthrough(),
  }).passthrough(),
  mfaPolicy: z.object({ requiredForRoles: z.array(z.string()) }).passthrough(),
  clients: z.array(clientSchema),
  flags: z.record(z.boolean()),
});
const seedSchema = z.object({
  users: z.array(z.object({
    sub: z.string(), phone: z.string(), name: z.string(), locale: z.enum(['ar', 'en']), roles: z.array(z.string()),
  })),
});

export type IdpConfig = z.infer<typeof idpSchema>;
export type SeedUser = z.infer<typeof seedSchema>['users'][number];

export function loadIdpConfig(file = path.join(REPO_ROOT, 'config/idp.json')): IdpConfig {
  return idpSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}
export function loadSeedUsers(file = path.join(REPO_ROOT, 'config/seed-users.json')): SeedUser[] {
  return seedSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).users;
}

/** Brand assets: prefer ../_brand (workspace sibling), fall back to the committed copy (CI). */
export function brandAsset(name: 'tokens.css' | 'kiorex-mark.svg'): string {
  const sibling = path.resolve(REPO_ROOT, '../_brand', name);
  const local = path.resolve(here, '../assets/brand', name);
  return readFileSync(existsSync(sibling) ? sibling : local, 'utf8');
}

export interface RuntimeOptions {
  port: number;
  issuer: string;
  databaseUrl: string;
  schema: string;
  nodeEnv: string | undefined;
  trustProxy: boolean;
  passkeysEnabled: boolean;
  logOtp: boolean;
}

export function runtimeFromEnv(cfg: IdpConfig, env: NodeJS.ProcessEnv = process.env): RuntimeOptions {
  const port = Number(env.PORT ?? 4400);
  const flagEnv = env.KX_FLAG_ACCOUNT_PASSKEYS;
  return {
    port,
    issuer: env.ISSUER ?? (port === 4400 ? cfg.issuer.local : `http://localhost:${port}`),
    databaseUrl: env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account',
    schema: env.KX_DB_SCHEMA ?? 'public',
    nodeEnv: env.NODE_ENV,
    trustProxy: env.KX_TRUST_PROXY === 'true',
    passkeysEnabled: flagEnv !== undefined ? flagEnv === 'true' : cfg.flags['account.passkeys'] ?? false,
    logOtp: true,
  };
}
