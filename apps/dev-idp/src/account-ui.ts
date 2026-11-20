import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { REPO_ROOT } from './config.js';
import { esc } from './views.js';
import { createHash } from 'node:crypto';
import { send } from './http.js';

/** OIDC client id of the Passport self-service SPA (config/idp.json). */
export const PASSPORT_CLIENT_ID = 'kiorex-passport-web';

const UI_ROOT = path.join(REPO_ROOT, 'apps/passport-ui');
const SRC = path.join(UI_ROOT, 'src');

function newestMtime(dir: string): number {
  let m = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    m = Math.max(m, e.isDirectory() ? newestMtime(p) : statSync(p).mtimeMs);
  }
  return m;
}

interface Bundle { js: string; css: string }
let cached: Promise<Bundle> | undefined;
let cachedStamp = -1;

/** Bundles the React SPA in memory with esbuild (no build step, no files written). Rebuilt when a source file changes. */
export function passportBundle(): Promise<Bundle> {
  const stamp = newestMtime(SRC);
  if (!cached || stamp !== cachedStamp) {
    cachedStamp = stamp;
    const p = build({
      entryPoints: [path.join(SRC, 'main.tsx')], bundle: true, write: false, outdir: 'out', format: 'iife', platform: 'browser', target: 'es2020',
      jsx: 'automatic', sourcemap: false, minify: false, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
    }).then((r) => ({
      js: r.outputFiles.find((f) => f.path.endsWith('.js'))?.text ?? '',
      css: r.outputFiles.find((f) => f.path.endsWith('.css'))?.text ?? '',
    }));
    p.catch(() => { cached = undefined; cachedStamp = -1; });
    cached = p;
  }
  return cached;
}

const BOOT = `try{var l=localStorage.getItem('kx-lang')||'ar';var h=document.documentElement;h.lang=l;h.dir=l==='ar'?'rtl':'ltr';var t=localStorage.getItem('kx-theme');h.dataset.theme=(t==='dark'||t==='light')?t:'auto';}catch(e){}`;
/** Own CSP for the SPA: external CSS/JS from this origin, the tiny boot script by hash (no 'unsafe-inline' for scripts), API calls to this origin only. */
const CSP = `default-src 'self'; script-src 'self' 'sha256-${createHash('sha256').update(BOOT).digest('base64')}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`;

export function shellHtml(issuer: string): string {
  const cfg = JSON.stringify({ issuer, clientId: PASSPORT_CLIENT_ID, kiorexWebUrl: 'http://localhost:5180' }).replace(/</g, '\\u003c');
  // Language/theme are applied before first paint so there is no LTR/light flash (AR default, RTL).
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kiorex Passport</title><meta name="color-scheme" content="light dark"><link rel="icon" href="/static/brand/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/brand/apple-touch-icon.png">
<link rel="stylesheet" href="/static/brand/tokens.css"><link rel="stylesheet" href="/static/brand/fonts.css"><link rel="stylesheet" href="/account/assets/app.css">
<script>${BOOT}</script></head><body>
<div id="root"></div>
<noscript><p style="padding:24px;font-family:sans-serif">${esc('Kiorex Passport needs JavaScript. / يحتاج كيوريكس باسبورت إلى جافاسكربت.')}</p></noscript>
<script id="kx-config" type="application/json">${cfg}</script>
<script src="/account/assets/app.js" defer></script></body></html>`;
}

/** Serves the Passport web UI under /account: the HTML shell for every client-side route plus the in-memory bundle. */
export async function handleAccountUi(issuer: string, req: IncomingMessage, res: ServerResponse, p: string): Promise<void> {
  if (p === '/account/backchannel-logout' && req.method === 'POST') {
    for await (const _ of req) void _; // drain; the SPA keeps no server-side state, a revoked session shows up as a 401
    return send(res, 200, { ok: true });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
  if (p === '/account/assets/app.js' || p === '/account/assets/app.css') {
    try {
      const b = await passportBundle();
      return send(res, 200, p.endsWith('.js') ? b.js : b.css, { 'content-type': p.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/css; charset=utf-8', 'content-security-policy': CSP });
    } catch (e) {
      return send(res, 500, { error: 'ui_build_failed', detail: String((e as Error).message).slice(0, 500) });
    }
  }
  if (p.startsWith('/account/assets/')) return send(res, 404, { error: 'not_found' });
  return send(res, 200, shellHtml(issuer), { 'content-security-policy': CSP });
}
