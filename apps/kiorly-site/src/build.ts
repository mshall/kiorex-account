/** Assembles dist/: rendered pages, one content-hashed stylesheet and script, the Kiorly brand files, robots.txt, sitemap.xml. No network, no host typed here. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';
import type { SiteConfig } from './config';
import { renderPages, robotsTxt, sitemapXml } from './render';

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(here, '..');
/** The vendored Kiorly brand set (identical to _brand/dist/svg/kiorly-*.svg, which the Kiorly guard checksums). The Kiorex logo is never copied. */
const BRAND_DIR = path.resolve(APP_DIR, '../kiorly-home/public/brand');
const BRAND_FILES = ['kiorly-lockup.svg', 'kiorly-lockup-inverse.svg', 'kiorly-lockup-ar.svg', 'kiorly-lockup-ar-inverse.svg', 'kiorly-mark.svg', 'kiorly-mark-inverse.svg', 'favicon.svg'];
const FONT_FILES = ['Jost_400Regular.ttf', 'Jost_600SemiBold.ttf', 'IBMPlexSansArabic_400Regular.ttf', 'IBMPlexSansArabic_600SemiBold.ttf'];

const hash = (b: string | Buffer) => createHash('sha256').update(b).digest('hex').slice(0, 10);
async function bundle(entry: string): Promise<string> {
  const r = await esbuild({ entryPoints: [path.join(APP_DIR, 'src', entry)], bundle: true, minify: true, format: 'iife', target: 'es2020', write: false, legalComments: 'none' });
  return r.outputFiles[0]!.text;
}

export async function buildSite(cfg: SiteConfig, outDir = path.join(APP_DIR, 'dist')): Promise<void> {
  rmSync(outDir, { recursive: true, force: true });
  const put = (rel: string, body: string | Buffer) => { const f = path.join(outDir, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, body); };
  const css = readFileSync(path.join(APP_DIR, 'assets/site.css'), 'utf8');
  const js = await bundle('client.ts'); const langJs = await bundle('client-lang.ts');
  const assets = { css: `/assets/site.${hash(css)}.css`, js: `/assets/site.${hash(js)}.js`, langJs: `/assets/lang.${hash(langJs)}.js` };
  put(assets.css.slice(1), css); put(assets.js.slice(1), js); put(assets.langJs.slice(1), langJs);
  for (const f of BRAND_FILES) { const src = path.join(BRAND_DIR, f); if (!existsSync(src)) throw new Error(`Kiorly brand file missing: ${src}`); put(`assets/brand/${f}`, readFileSync(src)); }
  for (const f of FONT_FILES) put(`assets/fonts/${f}`, readFileSync(path.join(BRAND_DIR, 'fonts', f)));
  for (const p of renderPages(cfg, assets)) put(p.path, p.body);
  put('robots.txt', robotsTxt(cfg));
  if (cfg.indexable) put('sitemap.xml', sitemapXml(cfg));
}
