/**
 * Build-time configuration of the Kiorly marketing site. EVERYTHING comes from the environment of the build (ADR-059: no host is typed in code):
 *
 *   KIORLY_SITE_ENV          local | dev | test | staging | pilot | prod   (required)
 *   KIORLY_SITE_ORIGIN       https origin of this site (required), generated from the registry service `kiorly.marketing`
 *   KIORLY_HOME_URL          https origin of Kiorly Home (`kiorly.app`), the sign-in link target (required)
 *   KIORLY_LEAD_ENDPOINT     https URL the onboarding form POSTs JSON to. Unset = MOCK mode (nothing is sent). pilot and prod refuse to build without it
 *                            unless KIORLY_ALLOW_MOCK_LEADS=true (a form that silently drops leads must never ship by accident).
 *   KIORLY_PLANS_FILE        optional path to a JSON file describing the plans to list (names and features only; any price field fails the build)
 *   KIORLY_INDEXABLE         optional override: "true" | "false". Default: indexable only when KIORLY_SITE_ENV is prod.
 *   KIORLY_CONTACT_EMAIL     optional public contact address shown in the footer
 *
 * `npm run env:emit -w @kiorex/kiorly-site -- --env test` prints the two registry-derived values for an environment.
 */
import { readFileSync } from 'node:fs';

export const ENVS = ['local', 'dev', 'test', 'staging', 'pilot', 'prod'] as const;
export type SiteEnv = (typeof ENVS)[number];
export type Lang = 'ar' | 'en';
export const LANGS: readonly Lang[] = ['ar', 'en'];
export type L10n<T = string> = Record<Lang, T>;

export interface Plan { id: string; name: L10n; summary: L10n; features: L10n<string[]> }
export interface SiteConfig {
  env: SiteEnv;
  origin: string;
  homeUrl: string;
  /** null = mock mode */
  leadEndpoint: string | null;
  plans: Plan[] | null;
  indexable: boolean;
  contactEmail: string | null;
  /** non-production builds carry a visible "preview, copy under review" strip */
  previewBanner: boolean;
}

const FORBIDDEN_PRICE_KEY = /price|pricing|amount|fee|cost|currency|egp|usd|tariff|rate|discount|tax|vat/i;

function httpsOrigin(name: string, v: string | undefined, env: SiteEnv): string {
  if (!v) throw new Error(`${name} is required (generate it from the registry: npm run env:emit -w @kiorex/kiorly-site -- --env <env>)`);
  let u: URL;
  try { u = new URL(v); } catch { throw new Error(`${name} must be an absolute URL, got "${v}"`); }
  // plain http only for the local preview/e2e tier; every real environment is https
  if (u.protocol !== 'https:' && !(env === 'local' && u.protocol === 'http:')) throw new Error(`${name} must be an https URL, got "${v}"`);
  if (u.pathname !== '/' || u.search || u.hash) throw new Error(`${name} must be an origin without a path, got "${v}"`);
  return u.origin;
}

/** Plans file: names, summaries and features per language only. Pricing is set in the Ops console, never in site config. */
export function parsePlans(raw: unknown): Plan[] {
  const scan = (o: unknown, path: string): void => {
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (FORBIDDEN_PRICE_KEY.test(k)) throw new Error(`plans config: "${path}${k}" looks like pricing. Prices are set in Ops and are never shown by this site`); scan(v, `${path}${k}.`); }
  };
  scan(raw, '');
  const list = (raw as { plans?: unknown })?.plans;
  if (!Array.isArray(list) || list.length === 0) throw new Error('plans config: expected { "plans": [ ... ] } with at least one plan');
  const str = (v: unknown, p: string): string => { if (typeof v !== 'string' || !v.trim()) throw new Error(`plans config: ${p} must be a non-empty string`); return v.trim(); };
  return list.map((p: Record<string, unknown>, i) => {
    const l = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
    const feats = (lang: Lang) => { const a = (l('features')[lang] ?? []) as unknown; if (!Array.isArray(a)) throw new Error(`plans config: plans[${i}].features.${lang} must be a list`); return a.map((x, j) => str(x, `plans[${i}].features.${lang}[${j}]`)); };
    return {
      id: str(p.id, `plans[${i}].id`).toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      name: { ar: str(l('name').ar, `plans[${i}].name.ar`), en: str(l('name').en, `plans[${i}].name.en`) },
      summary: { ar: str(l('summary').ar, `plans[${i}].summary.ar`), en: str(l('summary').en, `plans[${i}].summary.en`) },
      features: { ar: feats('ar'), en: feats('en') },
    };
  });
}

export function resolveConfig(e: Record<string, string | undefined>, readFile: (p: string) => string = (p) => readFileSync(p, 'utf8')): SiteConfig {
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
  const plans = e.KIORLY_PLANS_FILE ? parsePlans(JSON.parse(readFile(e.KIORLY_PLANS_FILE))) : null;
  const idx = e.KIORLY_INDEXABLE;
  if (idx !== undefined && idx !== 'true' && idx !== 'false') throw new Error('KIORLY_INDEXABLE must be "true" or "false"');
  const indexable = idx ? idx === 'true' : env === 'prod';
  return { env, origin, homeUrl, leadEndpoint: lead, plans, indexable, contactEmail: e.KIORLY_CONTACT_EMAIL?.trim() || null, previewBanner: env !== 'prod' };
}
