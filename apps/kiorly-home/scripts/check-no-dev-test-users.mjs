#!/usr/bin/env node
// Asserts the DEV ONLY "Test users (dev only)" panel, its synthetic phones and the dev OTP are NOT in a production build and that a
// production build contains no localhost URL; sanity-checks that a development build DOES contain the panel (so the check cannot pass vacuously).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARKERS = ['Test users (dev only)', 'مستخدمو الاختبار (للتطوير فقط)', '+201000002031', '000000', 'data-dev-test-users'];
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const text = (dir) => walk(dir).filter((f) => /\.(js|mjs|html|json|css|map)$/.test(f) && !f.includes('/brand/')).map((f) => [f, readFileSync(f, 'utf8')]);
const hits = (dir) => text(dir).flatMap(([f, s]) => MARKERS.filter((m) => s.includes(m)).map((m) => `${f}: ${m}`));
const build = (out, mode, extra = {}) => execFileSync('npx', ['vite', 'build', root, '--mode', mode, '--outDir', out, '--emptyOutDir'], { stdio: 'pipe', env: { ...process.env, ...extra, NODE_ENV: mode === 'production' ? 'production' : 'development' } });

const prod = mkdtempSync(join(tmpdir(), 'kh-prod-')), dev = mkdtempSync(join(tmpdir(), 'kh-dev-'));
try {
  build(prod, 'production');
  const leaked = hits(prod);
  const local = text(prod).flatMap(([f, s]) => (/localhost|127\.0\.0\.1/.test(s) ? [`${f}: localhost`] : []));
  if (leaked.length || local.length) { console.error('FAIL: production build leaks dev-only content:\n' + [...leaked, ...local].join('\n')); process.exit(1); }
  build(dev, 'development', { KX_ENV: 'local' });
  if (!hits(dev).length) { console.error('FAIL: sanity check, the development build does not contain the panel (check is vacuous)'); process.exit(1); }
  console.log('OK: no dev test users and no localhost in the production build; panel present in the development build');
} finally { rmSync(prod, { recursive: true, force: true }); rmSync(dev, { recursive: true, force: true }); }
