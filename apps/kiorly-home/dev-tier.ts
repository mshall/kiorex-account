export type HomeEnvIn = { passport: string; home: string; clinic: string; nurse: string; pharmacy: string; lab: string; api: { clinic: string; pharmacy: string; lab: string } };

const bad = (u: string) => !/^https:\/\//.test(u) || /\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(u);

/**
 * "dev" tier for a deployed DEV environment (App Runner / one Docker host): every origin comes from environment values at build time, so the bundle
 * contains no localhost URL and nothing is edited in code. Required: VITE_PASSPORT_ISSUER, KX_HOME_ORIGIN, KX_PRODUCT_URL_CLINIC|PHARMACY|LAB,
 * KX_API_CLINIC|PHARMACY|LAB; optional KX_PRODUCT_URL_NURSE (defaults to the clinic web app). Every value must be an https origin.
 */
export function devTierFromEnv(env: NodeJS.ProcessEnv): HomeEnvIn {
  const need = (k: string): string => {
    const v = (env[k] ?? '').trim().replace(/\/+$/, '');
    if (!v) throw new Error(`KX_ENV=dev needs ${k} (https origin)`);
    if (bad(v)) throw new Error(`KX_ENV=dev: ${k} must be an https URL that is not localhost (got ${v})`);
    return v;
  };
  const clinic = need('KX_PRODUCT_URL_CLINIC');
  const nurse = (env.KX_PRODUCT_URL_NURSE ?? '').trim() ? need('KX_PRODUCT_URL_NURSE') : clinic;
  return {
    passport: need('VITE_PASSPORT_ISSUER'), home: need('KX_HOME_ORIGIN'), clinic, nurse, pharmacy: need('KX_PRODUCT_URL_PHARMACY'), lab: need('KX_PRODUCT_URL_LAB'),
    api: { clinic: need('KX_API_CLINIC'), pharmacy: need('KX_API_PHARMACY'), lab: need('KX_API_LAB') },
  };
}
