import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

type Env = { passport: string; home: string; clinic: string; nurse: string; pharmacy: string; lab: string };
const domains = JSON.parse(readFileSync(fileURLToPath(new URL('../../config/domains.json', import.meta.url)), 'utf8')).environments as Record<string, Env>;

/**
 * ADR-038. Only the selected environment's origins are baked into the bundle (KX_ENV = local | staging | production), so a production
 * build never contains a localhost URL. `VITE_PASSPORT_ISSUER` overrides the issuer (e2e uses a throwaway IdP).
 * Token + API calls go through the same-origin path `/idp/*` (the IdP token endpoint is not CORS-enabled): dev proxy below;
 * in staging/production a CDN behaviour `/idp/*` -> Passport origin does the same (NEEDS_HUMAN, infra/tofu kiorly-domains).
 */
export default defineConfig(({ mode }) => {
  const tier = process.env.KX_ENV ?? (mode === 'production' ? 'production' : 'local');
  const d = domains[tier];
  if (!d) throw new Error(`unknown KX_ENV ${tier}`);
  const issuer = process.env.VITE_PASSPORT_ISSUER ?? d.passport;
  const target = process.env.KX_IDP_PROXY_TARGET ?? issuer;
  return {
    // Vite 8 transforms JSX natively (no plugin dependency); tsconfig jsx=react-jsx
    oxc: { jsx: { runtime: 'automatic' } },
    define: { __KX_HOME__: JSON.stringify({ tier, issuer, home: d.home, products: { clinic: d.clinic, nurse: d.nurse, pharmacy: d.pharmacy, lab: d.lab } }) },
    server: { port: 5194, strictPort: true, watch: { ignored: ['**/e2e/**', '**/dist/**'] }, proxy: { '/idp': { target, changeOrigin: false, rewrite: (p) => p.replace(/^\/idp/, '') } } },
    preview: { port: 5194, strictPort: true, proxy: { '/idp': { target, rewrite: (p) => p.replace(/^\/idp/, '') } } },
    build: { sourcemap: false },
  };
});
