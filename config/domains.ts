import raw from './domains.json' with { type: 'json' };

/** ADR-038 typed accessor for the single per-environment domain table (config/domains.json). */
export type Tier = 'local' | 'staging' | 'production';
export type ProductKey = 'clinic' | 'nurse' | 'pharmacy' | 'lab';
export interface DomainEnv {
  passport: string; home: string; apexRedirect?: string; clinic: string; nurse: string; pharmacy: string; lab: string;
  api: { clinic: string; pharmacy: string; lab: string };
  aliases: Partial<Record<'home' | ProductKey, string[]>>;
  cookieDomain: string | null; secureCookies: boolean; sameSite: 'Lax' | 'Strict' | 'None';
}
export const DOMAINS = raw as unknown as { environments: Record<Tier, DomainEnv>; appLinks: { host: string; iosBundleId: string; androidPackage: string; paths: string[] } };
export const TIERS: Tier[] = ['local', 'staging', 'production'];
export const domainsFor = (tier: Tier): DomainEnv => DOMAINS.environments[tier];
export const tierFromEnv = (v: string | undefined): Tier => (v === 'production' || v === 'prod' ? 'production' : v === 'staging' ? 'staging' : 'local');
/** Every origin an environment may ever redirect to or call (the allow-list tests assert against). */
export function allOrigins(tier: Tier): string[] {
  const d = domainsFor(tier);
  return [d.passport, d.home, d.apexRedirect, d.clinic, d.nurse, d.pharmacy, d.lab, ...Object.values(d.api), ...Object.values(d.aliases).flat()].filter((x): x is string => !!x);
}
