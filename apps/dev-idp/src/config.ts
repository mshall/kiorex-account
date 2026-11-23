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
  environments: z.looseObject({ local: envBlock }),
});
const productCfg = z.object({ refKey: z.string() });
const idpSchema = z.object({
  issuer: z.looseObject({ local: z.string() }),
  defaultAudience: z.string(),
  resourceServers: z.array(z.looseObject({ identifier: z.string() })),
  scopes: z.array(z.looseObject({ name: z.string(), claims: z.array(z.string()) })),
  accessTokenClaims: z.array(z.string()),
  forbiddenClaims: z.array(z.string()),
  tokenLifetimes: z.looseObject({
    accessTokenSeconds: z.number().max(900),
    idTokenSeconds: z.number(),
    refreshTokenDays: z.number(),
    authorizationCodeSeconds: z.number(),
    sessionDays: z.number(),
    interactionSeconds: z.number(),
  }),
  passwordless: z.looseObject({
    otp: z.looseObject({
      codeLength: z.number(),
      ttlSeconds: z.number(),
      maxAttemptsPerChallenge: z.number(),
      maxSendsPerPhonePerHour: z.number(),
      maxSendsPerIpPerHour: z.number(),
      lockoutMinutesAfterExhaustedChallenge: z.number(),
    }),
    passkeys: z.looseObject({ flag: z.string(), rpName: z.string() }),
  }),
  mfaPolicy: z.looseObject({ requiredForRoles: z.array(z.string()) }),
  clients: z.array(clientSchema),
  flags: z.record(z.string(), z.boolean()),
  stepUp: z.object({
    acr: z.object({ basic: z.string(), mfa: z.string() }),
    freshnessSeconds: z.number(),
    sensitiveActions: z.array(z.string()),
    totp: z.object({
      issuer: z.string(), periodSeconds: z.number(), digits: z.number(), epochToleranceSeconds: z.number(),
      maxAttemptsPerWindow: z.number(), lockoutMinutes: z.number(),
    }),
  }),
  guardianship: z.object({
    defaultMarket: z.string(),
    ageOfMajority: z.record(z.string(), z.number()),
    scopedTokenSeconds: z.number().max(900),
    actScopes: z.array(z.string()),
    evidenceTypes: z.array(z.string()),
    maxDependantsPerGuardian: z.number(),
  }),
  orgs: z.object({ roleHints: z.array(z.string()), editions: z.array(z.string()).min(1), defaultEdition: z.string(), invitationTtlDays: z.number(), productRefKeys: z.array(z.string()) }),
  /** ADR-038: Kiorly Home workspace catalogue (product URLs per environment; never secrets). */
  workspaces: z.object({
    defaultProduct: z.enum(['clinic', 'pharmacy', 'lab']),
    products: z.object({ clinic: productCfg, pharmacy: productCfg, lab: productCfg }),
  }).optional(),
  federation: z.object({
    flag: z.string(),
    upstreams: z.array(z.object({
      id: z.string(), name: z.string(),
      local: z.object({
        port: z.number(), clientId: z.string(), clientSecret: z.string(),
        users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string() })),
      }),
    })),
  }),
});
const seedSchema = z.object({
  users: z.array(z.object({
    sub: z.string(), phone: z.string(), name: z.string(), locale: z.enum(['ar', 'en']), roles: z.array(z.string()), totpSecret: z.string().optional(),
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

/** Brand assets: tokens.css prefers ../_brand (workspace sibling, always fresh) and falls back to the committed copy (CI); everything else is the committed copy. */
export const BRAND_FILES: Record<string, string> = {
  'tokens.css': 'text/css', 'fonts.css': 'text/css', 'kiorex-mark.svg': 'image/svg+xml', 'favicon.svg': 'image/svg+xml', 'favicon.ico': 'image/x-icon', 'apple-touch-icon.png': 'image/png',
  'passport-lockup.svg': 'image/svg+xml', 'passport-lockup-inverse.svg': 'image/svg+xml',
  'fonts/Jost_400Regular.ttf': 'font/ttf', 'fonts/Jost_500Medium.ttf': 'font/ttf', 'fonts/Jost_600SemiBold.ttf': 'font/ttf',
  'fonts/IBMPlexSansArabic_400Regular.ttf': 'font/ttf', 'fonts/IBMPlexSansArabic_600SemiBold.ttf': 'font/ttf',
};
export function brandBytes(name: string): Buffer {
  const sibling = path.resolve(REPO_ROOT, '../_brand', name);
  const local = path.resolve(here, '../assets/brand', name);
  return readFileSync(name === 'tokens.css' && existsSync(sibling) ? sibling : local);
}
export function brandAsset(name: 'tokens.css' | 'fonts.css' | 'kiorex-mark.svg'): string {
  return brandBytes(name).toString('utf8');
}

export interface RuntimeOptions {
  port: number;
  issuer: string;
  databaseUrl: string;
  schema: string;
  nodeEnv: string | undefined;
  trustProxy: boolean;
  passkeysEnabled: boolean;
  providerSsoEnabled: boolean;
  /** Port of the fake upstream IdP (KA-11); 0 = ephemeral. */
  upstreamPort: number;
  logOtp: boolean;
}

export function runtimeFromEnv(cfg: IdpConfig, env: NodeJS.ProcessEnv = process.env): RuntimeOptions {
  const port = Number(env.PORT ?? 4400);
  const flagEnv = env.KX_FLAG_ACCOUNT_PASSKEYS;
  const ssoEnv = env.KX_FLAG_ACCOUNT_PROVIDER_SSO;
  return {
    port,
    issuer: env.ISSUER ?? (port === 4400 ? cfg.issuer.local : `http://localhost:${port}`),
    databaseUrl: env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account',
    schema: env.KX_DB_SCHEMA ?? 'public',
    nodeEnv: env.NODE_ENV,
    trustProxy: env.KX_TRUST_PROXY === 'true',
    passkeysEnabled: flagEnv !== undefined ? flagEnv === 'true' : cfg.flags['account.passkeys'] ?? false,
    providerSsoEnabled: ssoEnv !== undefined ? ssoEnv === 'true' : cfg.flags['account.provider_sso'] ?? false,
    upstreamPort: Number(env.KX_FAKE_UPSTREAM_PORT ?? cfg.federation.upstreams[0]?.local.port ?? 4401),
    logOtp: true,
  };
}
