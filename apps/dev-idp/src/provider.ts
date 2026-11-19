import Provider, { type Configuration, type ClientMetadata } from 'oidc-provider';
import type { IdpConfig } from './config.js';
import type { Accounts } from './accounts.js';
import { identityClaims } from './accounts.js';
import type { SigningKey } from './keys.js';
import type { Pool } from './db.js';
import { makePgAdapter } from './adapter.js';
import { logoutPage, loggedOutPage, type Lang } from './views.js';

/** Resource indicators must be absolute URIs (RFC 8707); the access-token `aud` claim is the friendly name `kiorex-api`. */
export const RESOURCE_INDICATOR = 'urn:kiorex:api';

export function buildClients(cfg: IdpConfig): ClientMetadata[] {
  return cfg.clients.map((c) => {
    const env = c.environments.local;
    const confidential = c.type === 'confidential';
    return {
      client_id: c.clientId,
      client_name: c.name,
      ...(confidential ? { client_secret: env.clientSecret } : {}),
      token_endpoint_auth_method: confidential ? (c.tokenEndpointAuthMethod ?? 'client_secret_basic') : 'none',
      redirect_uris: env.redirectUris,
      post_logout_redirect_uris: env.postLogoutRedirectUris,
      grant_types: c.grantTypes,
      response_types: ['code'],
      scope: c.scopes.join(' '),
      application_type: c.applicationType ?? 'web',
      id_token_signed_response_alg: 'RS256',
      ...(env.backchannelLogoutUri
        ? { backchannel_logout_uri: env.backchannelLogoutUri, backchannel_logout_session_required: true }
        : {}),
    } as ClientMetadata;
  });
}

export interface ProviderDeps {
  cfg: IdpConfig; pool: Pool; accounts: Accounts; key: SigningKey; issuer: string;
}

export function createProvider({ cfg, pool, accounts, key, issuer }: ProviderDeps): Provider {
  const L = cfg.tokenLifetimes;
  const claims: Record<string, string[]> = {};
  for (const s of cfg.scopes) claims[s.name] = s.claims;
  const aud = cfg.defaultAudience;
  const allScopes = cfg.scopes.map((s) => s.name).join(' ');
  const langOf = (ctx: { oidc?: { params?: { ui_locales?: unknown } } }): Lang =>
    String(ctx.oidc?.params?.ui_locales ?? '').startsWith('ar') ? 'ar' : 'en';

  const configuration: Configuration = {
    adapter: makePgAdapter(pool),
    clients: buildClients(cfg),
    jwks: { keys: [key.privateJwk as never] },
    cookies: { keys: ['kx-dev-cookie-key-1-not-a-secret', 'kx-dev-cookie-key-2-not-a-secret'] },
    claims,
    scopes: cfg.scopes.map((s) => s.name),
    conformIdTokenClaims: false,
    pkce: { required: () => true, methods: ['S256'] },
    ttl: {
      AccessToken: L.accessTokenSeconds,
      IdToken: L.idTokenSeconds,
      AuthorizationCode: L.authorizationCodeSeconds,
      RefreshToken: L.refreshTokenDays * 86400,
      Grant: L.refreshTokenDays * 86400,
      Session: L.sessionDays * 86400,
      Interaction: L.interactionSeconds,
    },
    rotateRefreshToken: () => true, // KA-04: rotation; reuse of a rotated token revokes the whole grant
    issueRefreshToken: async (_ctx, client) => client.grantTypeAllowed('refresh_token'),
    findAccount: async (_ctx, id) => {
      const a = await accounts.findBySub(id);
      if (!a) return undefined;
      return { accountId: a.sub, claims: async () => identityClaims(a) as never };
    },
    extraTokenClaims: async (_ctx, token) => {
      const accountId = (token as { accountId?: string }).accountId;
      if (!accountId || (token as { kind?: string }).kind !== 'AccessToken') return undefined;
      const a = await accounts.findBySub(accountId);
      if (!a) return undefined;
      const { sub: _sub, ...rest } = identityClaims(a); // sub is set by the library
      void _sub;
      const sid = (token as { sid?: string }).sid;
      return sid ? { ...rest, sid } : rest; // sid lets products match back-channel logout tokens
    },
    interactions: { url: (_ctx, interaction) => `/interaction/${interaction.uid}` },
    features: {
      devInteractions: { enabled: false },
      introspection: { enabled: true },
      revocation: { enabled: true },
      backchannelLogout: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: async (ctx, form) => {
          ctx.type = 'html';
          ctx.body = logoutPage(langOf(ctx as never), form);
        },
        postLogoutSuccessSource: async (ctx) => {
          ctx.type = 'html';
          ctx.body = loggedOutPage(langOf(ctx as never));
        },
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: () => RESOURCE_INDICATOR,
        useGrantedResource: () => true,
        getResourceServerInfo: async () => ({
          scope: allScopes,
          audience: aud,
          accessTokenFormat: 'jwt',
          accessTokenTTL: L.accessTokenSeconds,
          jwt: { sign: { alg: 'RS256' } },
        }),
      },
    },
    renderError: async (ctx, out) => {
      ctx.type = 'application/json';
      ctx.body = out;
    },
  };
  void issuer;
  return new Provider(issuer, configuration);
}
