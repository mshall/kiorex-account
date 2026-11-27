/** Serves dist/ for local checks and the Playwright suite, with the same directory-index and 404 behaviour as the CloudFront function in deploy/. Port from KIORLY_SITE_PORT. */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { APP_DIR } from './build';

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.txt': 'text/plain', '.xml': 'application/xml' };
export function startPreview(root: string, port: number) {
  return new Promise<import('node:http').Server>((resolve) => {
    const s = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x'); let rel = decodeURIComponent(u.pathname);
      if (rel.endsWith('/')) rel += 'index.html'; else if (!path.extname(rel)) rel += '/index.html';
      const f = path.normalize(path.join(root, rel));
      if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404, { 'content-type': TYPES['.html']! }).end(readFileSync(path.join(root, '404.html'))); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' }).end(readFileSync(f));
    }).listen(port, '127.0.0.1', () => resolve(s));
  });
}
if (process.argv[1]?.endsWith('preview-cli.ts')) {
  const port = Number(process.env.KIORLY_SITE_PORT ?? 5196);
  await startPreview(path.resolve(process.env.KIORLY_SITE_DIST ?? path.join(APP_DIR, 'dist')), port);
  console.log(`kiorly-site preview on http://127.0.0.1:${port}`);
}
