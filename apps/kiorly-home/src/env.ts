import type { CardKey } from './core';
type HomeEnv = { tier: string; issuer: string; home: string; patient: string; products: Record<CardKey, string>; api: Record<CardKey, string> };
declare const __KX_HOME__: HomeEnv | undefined;
/** Build-time environment (vite.config.ts define). Falls back to local defaults under unit tests. */
const BASE: HomeEnv = typeof __KX_HOME__ !== 'undefined' ? __KX_HOME__ : { tier: 'local', issuer: 'http://localhost:4400', home: 'http://localhost:5194', patient: 'http://localhost:5180', products: { clinic: 'http://localhost:5174', nurse: 'http://localhost:5174', pharmacy: 'http://localhost:5192', lab: 'http://localhost:5193' }, api: { clinic: 'http://localhost:3010', nurse: 'http://localhost:3010', pharmacy: 'http://localhost:3100', lab: 'http://localhost:3200' } };

/**
 * DEV ONLY escape hatch for the real-stack e2e: when another checkout owns the default Clinic ports (:5174 web, :3010 API) this workspace runs
 * its Clinic on :5184 / :3011 and the test sets `localStorage['kh.dev.env'] = {"clinic":{"web":"http://localhost:5184","api":"http://localhost:3011"}}`
 * before the page loads. `import.meta.env.DEV` is false in production builds, so the branch (and the key) is dropped there.
 */
function devOverride(base: HomeEnv): HomeEnv {
  if (!import.meta.env.DEV) return base;
  try {
    const o = JSON.parse(localStorage.getItem('kh.dev.env') ?? 'null') as { clinic?: { web?: string; api?: string } } | null;
    const c = o?.clinic; if (!c) return base;
    const safe = (u: unknown) => (typeof u === 'string' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(u) ? u : null);
    const web = safe(c.web); const api = safe(c.api);
    return { ...base, products: { ...base.products, ...(web ? { clinic: web, nurse: web } : {}) }, api: { ...base.api, ...(api ? { clinic: api, nurse: api } : {}) } };
  } catch { return base; }
}
export const ENV: HomeEnv = devOverride(BASE);
export const IDP_BASE = '/idp';
export const CLIENT_ID = 'kiorly-home';
export const SCOPE = 'openid profile phone kx kx_org';
