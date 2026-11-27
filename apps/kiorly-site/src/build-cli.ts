/**
 * `npm run build -w @kiorex/kiorly-site` with the KIORLY_* variables of src/config.ts, or
 * `npm run build -w @kiorex/kiorly-site -- --env test [--registry <file>]` to derive KIORLY_SITE_ORIGIN and KIORLY_HOME_URL from the registry
 * (variables already set in the environment win, so a first stand-up on a default CDN host can override them).
 */
import path from 'node:path';
import { resolveConfig } from './config';
import { buildSite } from './build';
import { loadRegistryEnv } from './registry-env';

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
try {
  const env: Record<string, string | undefined> = { ...process.env };
  const id = val('--env');
  if (id) { const fromRegistry = await loadRegistryEnv(id, val('--registry')); for (const [k, v] of Object.entries({ KIORLY_SITE_ENV: id, ...fromRegistry })) env[k] ??= v; }
  const cfg = resolveConfig(env);
  await buildSite(cfg, val('--out') ? path.resolve(val('--out')!) : undefined);
  console.log(`kiorly-site built (env ${cfg.env}, origin ${cfg.origin}, indexable ${cfg.indexable}, lead form ${cfg.leadEndpoint ? 'live' : 'MOCK'}, plans ${cfg.plansEndpoint ? 'live' : 'fallback text only'})`);
} catch (e) { console.error(`kiorly-site build failed: ${(e as Error).message}`); process.exit(1); }
