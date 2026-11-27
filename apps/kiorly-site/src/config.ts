/**
 * Build-time configuration of the Kiorly marketing site. EVERYTHING comes from the environment of the build (ADR-059: no host is typed in code):
 *
 *   KIORLY_SITE_ENV          local | dev | test | staging | pilot | prod   (required)
 *   KIORLY_SITE_ORIGIN       https origin of this site (required), generated from the registry service `kiorly.marketing`
 *   KIORLY_HOME_URL          https origin of Kiorly Home (`kiorly.app`), the sign-in link target (required)
 *   KIORLY_LEAD_ENDPOINT     https URL the onboarding form POSTs JSON to. Unset = MOCK mode (nothing is sent). pilot and prod refuse to build without it
 *                            unless KIORLY_ALLOW_MOCK_LEADS=true (a form that silently drops leads must never ship by accident).
 *   KIORLY_PLANS_ENDPOINT    https URL the page reads the subscription plans from at runtime (GET, public, read-only), generated from the registry (`kiorex.api` + /api/v1/public/plans).
 *                            Unset: the Plans section shows only the neutral 'being finalised' text. The site holds NO plan, price or feature of its own: they come from the platform, so a change
 *                            made by a Kiorly super admin shows without a release.
 *   KIORLY_INDEXABLE         optional override: "true" | "false". Default: indexable only when KIORLY_SITE_ENV is prod.
 *   KIORLY_CONTACT_EMAIL     optional public contact address shown in the footer
 *
 * `npm run env:emit -w @kiorex/kiorly-site -- --env test` prints the two registry-derived values for an environment.
 */

export const ENVS = ['local', 'dev', 'test', 'staging', 'pilot', 'prod'] as const;
export type SiteEnv = (typeof ENVS)[number];
export type Lang = 'ar' | 'en';
export const LANGS: readonly Lang[] = ['ar', 'en'];
export type L10n<T = string> = Record<Lang, T>;

export interface SiteConfig {
  env: SiteEnv;
  origin: string;
  homeUrl: string;
  /** null = mock mode */
  leadEndpoint: string | null;
  /** null = the page does not fetch plans (static fallback text only) */
  plansEndpoint: string | null;
  indexable: boolean;
  contactEmail: string | null;
  /** non-production builds carry a visible "preview, copy under review" strip */
  previewBanner: boolean;
}

function httpsOrigin(name: string, v: string | undefined, env: SiteEnv): string {
  if (!v) throw new Error(`${name} is required (generate it from the registry: npm run env:emit -w @kiorex/kiorly-site -- --env <env>)`);
  let u: URL;
  try { u = new URL(v); } catch { throw new Error(`${name} must be an absolute URL, got "${v}"`); }
  // plain http only for the local preview/e2e tier; every real environment is https
  if (u.protocol !== 'https:' && !(env === 'local' && u.protocol === 'http:')) throw new Error(`${name} must be an https URL, got "${v}"`);
  if (u.pathname !== '/' || u.search || u.hash) throw new Error(`${name} must be an origin without a path, got "${v}"`);
  return u.origin;
}

export function resolveConfig(e: Record<string, string | undefined>): SiteConfig {
  const env = e.KIORLY_SITE_ENV as SiteEnv | undefined;
  if (!env || !ENVS.includes(env)) throw new Error(`KIORLY_SITE_ENV must be one of ${ENVS.join(', ')}`);
  const origin = httpsOrigin('KIORLY_SITE_ORIGIN', e.KIORLY_SITE_ORIGIN, env);
  const homeUrl = httpsOrigin('KIORLY_HOME_URL', e.KIORLY_HOME_URL, env);
  const lead = e.KIORLY_LEAD_ENDPOINT?.trim() || null;
  if (lead) {
    let u: URL; try { u = new URL(lead); } catch { throw new Error(`KIORLY_LEAD_ENDPOINT must be an absolute URL, got "${lead}"`); }
    if (u.protocol !== 'https:' && !(env === 'local' && u.protocol === 'http:')) throw new Error('KIORLY_LEAD_ENDPOINT must be an https URL');
  }
  if (!lead && (env === 'pilot' || env === 'prod') && e.KIORLY_ALLOW_MOCK_LEADS !== 'true') throw new Error(`KIORLY_LEAD_ENDPOINT is required for ${env} (a mock form would drop real leads). Set KIORLY_ALLOW_MOCK_LEADS=true only to build a deliberately inert site`);
  const plansEndpoint = e.KIORLY_PLANS_ENDPOINT?.trim() || null;
  if (plansEndpoint) {
    let u: URL; try { u = new URL(plansEndpoint); } catch { throw new Error(`KIORLY_PLANS_ENDPOINT must be an absolute URL, got "${plansEndpoint}"`); }
    if (u.protocol !== 'https:' && !(env === 'local' && u.protocol === 'http:')) throw new Error('KIORLY_PLANS_ENDPOINT must be an https URL');
    if (u.search || u.hash) throw new Error('KIORLY_PLANS_ENDPOINT must not carry a query or fragment');
  }
  const idx = e.KIORLY_INDEXABLE;
  if (idx !== undefined && idx !== 'true' && idx !== 'false') throw new Error('KIORLY_INDEXABLE must be "true" or "false"');
  const indexable = idx ? idx === 'true' : env === 'prod';
  return { env, origin, homeUrl, leadEndpoint: lead, plansEndpoint, indexable, contactEmail: e.KIORLY_CONTACT_EMAIL?.trim() || null, previewBanner: env !== 'prod' };
}
