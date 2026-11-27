/**
 * Builds the value of KX_CLIENT_OVERRIDES_JSON (apps/dev-idp/src/config.ts) for one environment from the registry's redirect rows
 * (`validate-registry.mjs --emit redirects`, i.e. `redirectsFor`). Pure: no file, no network, no host typed here: every URI comes from the rows.
 *
 * Registry client id -> Passport client id:  kiorly-clinic and kiorly-clinic-nurse both register on `kiorly-clinic` (Nurse is an edition of Clinic, ADR-031);
 * `passport-account` is skipped (the Passport SPA client always follows ISSUER and is not overridable by design). Native clients come from the registry
 * `native_clients` (kiorex -> kiorex-mobile, kiorly -> kiorly); non-production environments also register the `<scheme>-<env>` scheme so a test build
 * (kiorly-test) can sign in next to the production one.
 */
export interface RedirectRow {
  client: string; env: string;
  redirect_uris: string[]; post_logout_redirect_uris: string[];
  backchannel_logout_uri: string | null;
}
export interface NativeClient { id: string; schemes: string[]; redirect_paths: string[] }
export interface ClientOverride { redirectUris?: string[]; postLogoutRedirectUris?: string[]; backchannelLogoutUri?: string; clientSecret?: string }
export type ClientOverrides = Record<string, ClientOverride>;

export const REGISTRY_TO_PASSPORT_CLIENT: Readonly<Record<string, string | null>> = {
  'kiorex-web': 'kiorex-web', 'kiorex-ops': 'kiorex-ops', 'kiorex-widget': 'kiorex-widget', 'kiorly-home': 'kiorly-home',
  'kiorly-clinic': 'kiorly-clinic', 'kiorly-clinic-nurse': 'kiorly-clinic', 'kiorly-pharmacy-web': 'kiorly-pharmacy-web', 'kiorly-lab-web': 'kiorly-lab-web',
  'passport-account': null,
};
export const NATIVE_TO_PASSPORT_CLIENT: Readonly<Record<string, string>> = { kiorex: 'kiorex-mobile', kiorly: 'kiorly' };
/** Product web clients whose post-logout list also accepts Kiorly Home's sign-in page (the local idp.json does the same). */
const RETURN_TO_HOME = new Set(['kiorly-clinic', 'kiorly-pharmacy-web', 'kiorly-lab-web']);
const PRODUCTION_CLASS = new Set(['prod', 'pilot']);

export interface BuildOptions {
  /** the environment asked for (test, pilot, prod, ...) */
  env: string;
  /** the environment whose IdP serves it (registry oidc.issuer_env): pilot -> prod */
  issuerEnv: string;
  nativeClients?: NativeClient[];
  /** extra origins to register next to the registry host, for example the default CDN host of a first stand-up: `{ "<registry origin>": "<cdn origin>" }` */
  originMap?: Record<string, string>;
  /** `registry` = the gateway URI from the registry; `same-origin` = the client's own origin + the path without its product prefix (a first stand-up where each web serves its own /api) */
  backchannel?: 'registry' | 'same-origin';
  /** client secrets by Passport client id (read from the environment by the CLI, never written anywhere else) */
  secrets?: Record<string, string>;
}

const uniq = (xs: string[]) => [...new Set(xs)];
const origin = (u: string) => new URL(u).origin;
const withMapped = (uris: string[], map: Record<string, string>): string[] => uniq(uris.flatMap((u) => {
  const o = origin(u);
  return map[o] ? [u, `${map[o]}${u.slice(o.length)}`] : [u];
}));
/** `/clinics/api/v1/x` -> `/api/v1/x` (the gateway strips the first segment; a web serving its own /api has none) */
const stripProduct = (p: string) => p.replace(/^\/(clinics|pharmacies|labs)(?=\/api\/)/, '');

export function buildClientOverrides(rows: RedirectRow[], o: BuildOptions): ClientOverrides {
  const out: ClientOverrides = {};
  const map = o.originMap ?? {};
  const envsServed = new Set(rows.map((r) => r.env));
  if (!envsServed.has(o.env)) throw new Error(`no registry rows for environment "${o.env}"`);
  // pilot runs on the production IdP: its URIs are registered next to prod's, the back-channel target is the issuer environment's
  const group = o.env === o.issuerEnv ? [o.issuerEnv] : [o.env, o.issuerEnv].filter((e) => envsServed.has(e));
  const mine = rows.filter((r) => group.includes(r.env));
  let homeLogout: string[] = [];
  for (const r of mine) if (r.client === 'kiorly-home') homeLogout = uniq([...homeLogout, ...r.post_logout_redirect_uris]);
  for (const r of mine) {
    const id = REGISTRY_TO_PASSPORT_CLIENT[r.client];
    if (id === undefined) throw new Error(`registry client "${r.client}" has no Passport client mapping (add it to REGISTRY_TO_PASSPORT_CLIENT)`);
    if (id === null) continue;
    const e = (out[id] ??= {});
    e.redirectUris = uniq([...(e.redirectUris ?? []), ...withMapped(r.redirect_uris, map)]);
    // a client with no post-logout path (the widget) registers an empty list, which the IdP accepts
    e.postLogoutRedirectUris = uniq([...(e.postLogoutRedirectUris ?? []), ...withMapped(r.post_logout_redirect_uris, map)]);
    if (r.backchannel_logout_uri && r.env === o.issuerEnv && !e.backchannelLogoutUri) {
      const own = r.redirect_uris[0] ? origin(r.redirect_uris[0]) : undefined;
      if (o.backchannel === 'same-origin') {
        const mappedOwn = own && map[own] ? map[own] : own;
        if (mappedOwn) { const u = new URL(r.backchannel_logout_uri); e.backchannelLogoutUri = `${mappedOwn}${stripProduct(u.pathname)}`; }
      } else e.backchannelLogoutUri = r.backchannel_logout_uri;
    }
  }
  for (const [id, e] of Object.entries(out)) if (RETURN_TO_HOME.has(id) && e.postLogoutRedirectUris) e.postLogoutRedirectUris = uniq([...e.postLogoutRedirectUris, ...withMapped(homeLogout, map)]);
  for (const [id, e] of Object.entries(out)) { if (!e.redirectUris?.length) delete e.redirectUris; if (e.backchannelLogoutUri === undefined) delete e.backchannelLogoutUri; void id; }

  for (const n of o.nativeClients ?? []) {
    const id = NATIVE_TO_PASSPORT_CLIENT[n.id];
    if (!id) continue;
    const extra = PRODUCTION_CLASS.has(o.env) ? [] : n.schemes.map((s) => `${s}-${o.env}`);
    const schemes = [...n.schemes, ...extra];
    out[id] = {
      redirectUris: uniq([...n.redirect_paths, ...extra.flatMap((s) => n.redirect_paths.map((p) => p.replace(/^[a-z][a-z0-9+.-]*:/i, `${s}:`)))]),
      postLogoutRedirectUris: schemes.map((s) => `${s}://auth/logout`),
    };
  }
  for (const [id, secret] of Object.entries(o.secrets ?? {})) { if (!out[id]) throw new Error(`secret given for "${id}" which has no override in this environment`); out[id]!.clientSecret = secret; }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

/** Name of the environment variable that carries a confidential client secret for the emitter: KX_CLIENT_SECRET_<CLIENT_ID_UPPER_SNAKE>. */
export const secretEnvName = (clientId: string) => `KX_CLIENT_SECRET_${clientId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
