import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import { isPublicDeployment } from './public-mode.js';
import { ensureLocalTotpSecrets, localTotpFile } from './local-totp.js';
import { parsePromotionMode, type PromotionMode } from './promotion-mode.js';

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
    sub: z.string(), phone: z.string(), name: z.string(), locale: z.enum(['ar', 'en']), roles: z.array(z.string()),
    /** The seed only marks WHO has a TOTP; the secret is generated locally and never committed (local-totp.ts). */
    totp: z.boolean().optional(), totpSecret: z.string().optional(),
    email: z.string().optional(), emailVerified: z.boolean().optional(), // dev seed only: a person whose e-mail was verified (corporate domain join in local tests)
  })),
});

export type IdpConfig = z.infer<typeof idpSchema>;
export type SeedUser = z.infer<typeof seedSchema>['users'][number];

/** KX_IDP_CONFIG: alternate idp.json (a private test stack points every local URL at its own ports; the committed file is never edited). */
export function loadIdpConfig(file = process.env.KX_IDP_CONFIG ?? path.join(REPO_ROOT, 'config/idp.json'), env: NodeJS.ProcessEnv = process.env): IdpConfig {
  return applyClientOverrides(idpSchema.parse(JSON.parse(readFileSync(file, 'utf8'))), env);
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);
/** A redirect-type URI a deployment may register: https anywhere, http only on loopback, or a custom (native app) scheme. No wildcards, no fragments, no credentials. */
export function isAllowedClientUri(u: string): boolean {
  if (/[*\\\s]/.test(u)) return false;
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return !!url.hostname;
  if (url.protocol === 'http:') return LOOPBACK.has(url.hostname);
  return /^[a-z][a-z0-9+.-]*:$/.test(url.protocol) && url.protocol !== 'javascript:' && url.protocol !== 'data:' && url.protocol !== 'file:';
}
const uriList = z.array(z.string().refine(isAllowedClientUri, 'redirect URI must be https (http only on localhost) or a custom app scheme, with no wildcard or fragment'));
const overrideSchema = z.record(z.string(), z.strictObject({
  redirectUris: uriList.optional(),
  postLogoutRedirectUris: uriList.optional(),
  backchannelLogoutUri: z.string().refine((u) => isAllowedClientUri(u) && /^https?:/.test(u), 'back-channel logout URI must be http(s)').optional(),
  clientSecret: z.string().min(16).optional(),
}));
export type ClientOverrides = z.infer<typeof overrideSchema>;

/**
 * KX_CLIENT_OVERRIDES_JSON (deploy-time, no code change): `{"<clientId>": {"redirectUris": [...], "postLogoutRedirectUris": [...],
 * "backchannelLogoutUri": "https://...", "clientSecret": "..."}}`. Each present field REPLACES the matching idp.json `environments.local` value for that
 * client; absent fields keep the committed (localhost) default. Unknown client ids, unknown keys, wildcards and non-https non-localhost URIs are rejected
 * so a typo fails at start-up instead of silently registering nothing. Unset = no change (local defaults).
 */
export function parseClientOverrides(env: NodeJS.ProcessEnv = process.env): ClientOverrides {
  const raw = env.KX_CLIENT_OVERRIDES_JSON;
  if (raw === undefined || raw.trim() === '') return {};
  let json: unknown;
  try { json = JSON.parse(raw); } catch { throw new Error('KX_CLIENT_OVERRIDES_JSON is not valid JSON'); }
  const r = overrideSchema.safeParse(json);
  if (!r.success) throw new Error(`KX_CLIENT_OVERRIDES_JSON invalid: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
}
export function applyClientOverrides(cfg: IdpConfig, env: NodeJS.ProcessEnv = process.env): IdpConfig {
  const o = parseClientOverrides(env);
  for (const [id, v] of Object.entries(o)) {
    const c = cfg.clients.find((x) => x.clientId === id);
    if (!c) throw new Error(`KX_CLIENT_OVERRIDES_JSON names unknown client "${id}"`);
    if (v.clientSecret !== undefined && c.type !== 'confidential') throw new Error(`KX_CLIENT_OVERRIDES_JSON: "${id}" is a public client and has no secret`);
    const e = c.environments.local;
    if (v.redirectUris) e.redirectUris = v.redirectUris;
    if (v.postLogoutRedirectUris) e.postLogoutRedirectUris = v.postLogoutRedirectUris;
    if (v.backchannelLogoutUri) e.backchannelLogoutUri = v.backchannelLogoutUri;
    if (v.clientSecret) e.clientSecret = v.clientSecret;
  }
  return cfg;
}
/**
 * Seed users. `totp: true` accounts get a LOCAL generated secret (git-ignored file, local-totp.ts) in `totpSecret`; `totp: 'none'` (hosted deployments) leaves them without.
 */
export function loadSeedUsers(file = path.join(REPO_ROOT, 'config/seed-users.json'), o: { totp?: 'local' | 'none'; env?: NodeJS.ProcessEnv } = {}): SeedUser[] {
  const users = seedSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).users;
  if ((o.totp ?? 'local') === 'none') return users.map(({ totpSecret: _drop, ...u }) => { void _drop; return u; });
  const want = users.filter((u) => u.totp);
  if (!want.length) return users;
  const secrets = ensureLocalTotpSecrets(localTotpFile(REPO_ROOT, o.env ?? process.env), want.map((u) => u.phone));
  return users.map((u) => (u.totp ? { ...u, totpSecret: secrets[u.phone] } : u));
}

/** Brand assets: tokens.css prefers ../_brand (workspace sibling, always fresh) and falls back to the committed copy (CI); everything else is the committed copy. */
export const BRAND_FILES: Record<string, string> = {
  'tokens.css': 'text/css', 'fonts.css': 'text/css', 'kiorex-mark.svg': 'image/svg+xml', 'favicon.svg': 'image/svg+xml', 'favicon.ico': 'image/x-icon', 'apple-touch-icon.png': 'image/png',
  'kiorex-logo-full.svg': 'image/svg+xml', 'kiorex-logo-full-dark.svg': 'image/svg+xml', 'fonts/PlusJakartaSans-SemiBold.woff2': 'font/woff2',
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
  /** Listen address. Default 127.0.0.1 (local); the container image sets HOST=0.0.0.0. */
  host?: string;
  /** Public DEV deployment (see public-mode.ts): hardened defaults. */
  publicMode?: boolean;
  /** Fixed demo OTP 000000 for seeded numbers. Default true locally; in public mode false unless KX_DEV_OTP_BYPASS=true. */
  devOtpBypass?: boolean;
  /** /dev/* helper routes (inbox, events, simulators). Default true locally; in public mode false unless KX_DEV_ENDPOINTS=true. */
  devEndpoints?: boolean;
  /** IDENTITY_PROMOTION_MODE (ask | carry | separate, default ask): read by the promotion tooling, validated at start-up so a typo fails early. */
  identityPromotionMode?: PromotionMode;
  /** Cookie signing keys (KX_COOKIE_KEYS, comma separated). Required in public mode. */
  cookieKeys?: string[];
}

export function runtimeFromEnv(cfg: IdpConfig, env: NodeJS.ProcessEnv = process.env): RuntimeOptions {
  const port = Number(env.PORT ?? 4400);
  const flagEnv = env.KX_FLAG_ACCOUNT_PASSKEYS;
  const ssoEnv = env.KX_FLAG_ACCOUNT_PROVIDER_SSO;
  const issuer = env.ISSUER ?? (port === 4400 ? cfg.issuer.local : `http://localhost:${port}`);
  const publicMode = isPublicDeployment(env, issuer);
  const cookieKeys = (env.KX_COOKIE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  return {
    port,
    issuer,
    databaseUrl: env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5433/kiorex_account',
    schema: env.KX_DB_SCHEMA ?? 'public',
    nodeEnv: env.NODE_ENV,
    trustProxy: env.KX_TRUST_PROXY === 'true',
    passkeysEnabled: flagEnv !== undefined ? flagEnv === 'true' : cfg.flags['account.passkeys'] ?? false,
    // the fake hospital IdP is a local-dev convenience: a hosted (public) deployment shows it only when KX_FLAG_ACCOUNT_PROVIDER_SSO=true is set explicitly
    providerSsoEnabled: ssoEnv !== undefined ? ssoEnv === 'true' : publicMode ? false : cfg.flags['account.provider_sso'] ?? false,
    upstreamPort: Number(env.KX_FAKE_UPSTREAM_PORT ?? cfg.federation.upstreams[0]?.local.port ?? 4401),
    logOtp: true,
    host: env.HOST ?? '127.0.0.1',
    publicMode,
    devOtpBypass: publicMode ? env.KX_DEV_OTP_BYPASS === 'true' : env.KX_DEV_OTP_BYPASS !== 'false',
    devEndpoints: publicMode ? env.KX_DEV_ENDPOINTS === 'true' : env.KX_DEV_ENDPOINTS !== 'false',
    identityPromotionMode: parsePromotionMode(env),
    cookieKeys: cookieKeys.length ? cookieKeys : undefined,
  };
}
