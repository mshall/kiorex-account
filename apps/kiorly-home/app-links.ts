import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

/**
 * Universal Links / App Links association files for the Kiorly staff app, served BY Kiorly Home at
 *   /.well-known/apple-app-site-association   (no extension, Content-Type application/json, no redirect)
 *   /.well-known/assetlinks.json
 * on the Home host of the environment (the registry service kiorly.app: app.<env>.kiorly.com). The committed templates are
 * config/app-links/apple-app-site-association.json and assetlinks.json; this module renders them at build time from environment values:
 *
 *   APPLE_TEAM_ID                     Apple Developer Team ID (founder item D9). Unset keeps the TODO_NEEDS_HUMAN placeholder: the file is valid
 *                                     JSON, iOS simply does not verify the domain.
 *   ANDROID_SHA256_CERT_FINGERPRINTS  comma separated SHA-256 fingerprints of the Play app-signing key (and the upload key for internal builds)
 *   KX_STAFF_APP_ID_SUFFIX            the suffix of the build installed for this environment, the same value as the app's APP_ID_SUFFIX build
 *                                     variable ("" for production, ".test" if a test build uses a suffixed id). Bundle id and package get it.
 *
 * Only `/open/*` is claimed (the app never captures the web sign-in callback). The static host must send Content-Type: application/json for
 * both paths (CloudFront response headers policy or S3 object metadata); Vite's dev and preview servers do it below.
 */
const TEAM_PLACEHOLDER = 'TODO_NEEDS_HUMAN_APPLE_TEAM_ID';
const FINGERPRINT_PLACEHOLDER = 'TODO_NEEDS_HUMAN_SHA256_CERT_FINGERPRINT';
const DIR = new URL('../../config/app-links/', import.meta.url);
const readJson = (name: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(name, DIR)), 'utf8'));

export interface AppLinkInput { APPLE_TEAM_ID?: string; ANDROID_SHA256_CERT_FINGERPRINTS?: string; KX_STAFF_APP_ID_SUFFIX?: string }

export function appIdSuffix(env: AppLinkInput): string {
  const s = (env.KX_STAFF_APP_ID_SUFFIX ?? '').trim();
  if (s !== '' && !/^\.[a-z0-9]+$/.test(s)) throw new Error(`KX_STAFF_APP_ID_SUFFIX must be empty or a dot and lower-case letters/digits (got "${s}")`);
  return s;
}

type Aasa = { $comment?: string; applinks: { details: Array<{ appIDs: string[]; components: unknown[] }> } };
export function renderAasa(template: Aasa, env: AppLinkInput): Omit<Aasa, '$comment'> {
  const team = (env.APPLE_TEAM_ID ?? '').trim() || TEAM_PLACEHOLDER;
  if (team !== TEAM_PLACEHOLDER && !/^[A-Z0-9]{10}$/.test(team)) throw new Error('APPLE_TEAM_ID must be the 10-character Apple Developer Team ID');
  const suffix = appIdSuffix(env);
  const { $comment: _c, ...rest } = structuredClone(template);
  void _c;
  for (const d of rest.applinks.details) d.appIDs = d.appIDs.map((id) => `${team}${id.slice(TEAM_PLACEHOLDER.length)}${suffix}`);
  return rest;
}

type AssetLinks = Array<{ relation: string[]; target: { namespace: string; package_name: string; sha256_cert_fingerprints: string[] } }>;
export function renderAssetlinks(template: AssetLinks, env: AppLinkInput): AssetLinks {
  const raw = (env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '').split(',').map((f) => f.trim().toUpperCase()).filter(Boolean);
  for (const f of raw) if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f)) throw new Error('ANDROID_SHA256_CERT_FINGERPRINTS: each value must be a SHA-256 fingerprint, 32 colon-separated hex bytes');
  const suffix = appIdSuffix(env);
  return structuredClone(template).map((e) => ({ ...e, target: { ...e.target, package_name: `${e.target.package_name}${suffix}`, sha256_cert_fingerprints: raw.length ? raw : [FINGERPRINT_PLACEHOLDER] } }));
}

export function renderAppLinks(env: AppLinkInput = process.env): { aasa: string; assetlinks: string; placeholders: boolean } {
  const aasa = JSON.stringify(renderAasa(readJson('apple-app-site-association.json') as Aasa, env), null, 2);
  const assetlinks = JSON.stringify(renderAssetlinks(readJson('assetlinks.json') as AssetLinks, env), null, 2);
  return { aasa, assetlinks, placeholders: aasa.includes(TEAM_PLACEHOLDER) || assetlinks.includes(FINGERPRINT_PLACEHOLDER) };
}

const AASA_PATH = '/.well-known/apple-app-site-association';
const LINKS_PATH = '/.well-known/assetlinks.json';

/** Vite plugin: emits both files into the build output and serves them (application/json) from the dev and preview servers. */
export function kiorlyAppLinks(env: AppLinkInput = process.env): Plugin {
  const serve = (server: { middlewares: { use: (fn: (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(b: string): void }, next: () => void) => void) => void } }) => {
    server.middlewares.use((req, res, next) => {
      const p = (req.url ?? '').split('?')[0];
      if (p !== AASA_PATH && p !== LINKS_PATH) return next();
      const r = renderAppLinks(env);
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-cache');
      res.end(p === AASA_PATH ? r.aasa : r.assetlinks);
    });
  };
  return {
    name: 'kiorly-app-links',
    configureServer: serve,
    configurePreviewServer: serve,
    generateBundle() {
      const r = renderAppLinks(env);
      if (r.placeholders) this.warn('app links: APPLE_TEAM_ID and/or ANDROID_SHA256_CERT_FINGERPRINTS are not set; the association files carry TODO_NEEDS_HUMAN placeholders (founder item D9), so the staff app domain cannot verify yet');
      this.emitFile({ type: 'asset', fileName: '.well-known/apple-app-site-association', source: r.aasa });
      this.emitFile({ type: 'asset', fileName: '.well-known/assetlinks.json', source: r.assetlinks });
    },
  };
}
