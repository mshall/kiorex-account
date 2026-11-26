import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { devTierFromEnv } from './dev-tier';

type Env = { passport: string; home: string; clinic: string; nurse: string; pharmacy: string; lab: string; api: { clinic: string; pharmacy: string; lab: string } };
const domains = JSON.parse(readFileSync(fileURLToPath(new URL('../../config/domains.json', import.meta.url)), 'utf8')).environments as Record<string, Env>;

/**
 * ADR-038. Only the selected environment's origins are baked into the bundle (KX_ENV = local | staging | production | dev; `dev` reads every origin from env, see dev-tier.ts), so a production
 * build never contains a localhost URL. `VITE_PASSPORT_ISSUER` overrides the issuer (e2e uses a throwaway IdP).
 * Token + API calls go through the same-origin path `/idp/*` (the IdP token endpoint is not CORS-enabled): dev proxy below;
 * in staging/production a CDN behaviour `/idp/*` -> Passport origin does the same (NEEDS_HUMAN, infra/tofu kiorly-domains).
 */
export default defineConfig(({ mode }) => {
  const tier = process.env.KX_ENV ?? (mode === 'production' ? 'production' : 'local');
  // KX_ENV=dev: a deployed DEV environment; every origin comes from environment values (dev-tier.ts), nothing from domains.json.
  const d = tier === 'dev' ? devTierFromEnv(process.env) : domains[tier];
  if (!d) throw new Error(`unknown KX_ENV ${tier}`);
  const issuer = process.env.VITE_PASSPORT_ISSUER ?? d.passport;
  const target = process.env.KX_IDP_PROXY_TARGET ?? issuer;
  // Product API origins come from the domain table (`api`); the KX_API_* overrides exist for the real-stack e2e when a service listens on another local port.
  const apiClinic = process.env.KX_API_CLINIC ?? d.api.clinic; const apiPharmacy = process.env.KX_API_PHARMACY ?? d.api.pharmacy; const apiLab = process.env.KX_API_LAB ?? d.api.lab;
  return {
    // Vite 8 transforms JSX natively (no plugin dependency); tsconfig jsx=react-jsx
    oxc: { jsx: { runtime: 'automatic' } },
    define: { __KX_HOME__: JSON.stringify({ tier, issuer, home: process.env.KX_HOME_ORIGIN ?? d.home, products: { clinic: d.clinic, nurse: d.nurse, pharmacy: d.pharmacy, lab: d.lab }, api: { clinic: apiClinic, nurse: apiClinic, pharmacy: apiPharmacy, lab: apiLab } }) },
    server: { port: Number(process.env.KX_HOME_PORT ?? 5194), strictPort: true, watch: { ignored: ['**/e2e/**', '**/dist/**'] }, proxy: { '/idp': { target, changeOrigin: false, rewrite: (p) => p.replace(/^\/idp/, '') } } },
    preview: { port: 5194, strictPort: true, proxy: { '/idp': { target, rewrite: (p) => p.replace(/^\/idp/, '') } } },
    build: { sourcemap: false },
  };
});
