import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ADR-059 / ENVIRONMENT_CONFIGURATION_STANDARD rule 1: no Kiorex or Kiorly domain in runtime code. Hosts come from configuration
 * (the service URL registry in the workspace, config/domains.json, environment variables). This test fails when a new literal appears in
 * runtime source. Tests, fixtures, config JSON, docs and generated files are not scanned (they are data, not runtime code).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN_RE = /(?:https?:\/\/|["'`])((?:[a-z0-9-]+\.)*(?:kiorex\.com|kiorly\.com|kiorly\.link))\b/gi;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test', 'tests', '__tests__', 'e2e', 'Docs', 'docs', 'infra', 'coverage', 'build', '.results', 'brand', 'assets', 'public']);
const CODE = /\.(ts|tsx|js|mjs|cjs|sh)$/;
const SKIP_FILE = /(\.test\.|\.spec\.|\.d\.ts$)/;

export function scan(dir: string): Array<{ file: string; line: number; host: string }> {
  const hits: Array<{ file: string; line: number; host: string }> = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p); continue; }
      if (!CODE.test(e.name) || SKIP_FILE.test(e.name)) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        const t = line.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#')) return;
        for (const m of line.matchAll(DOMAIN_RE)) if (!m[1]!.toLowerCase().startsWith('schemas.')) hits.push({ file: path.relative(root, p), line: i + 1, host: m[1]!.toLowerCase() });
      });
    }
  };
  for (const top of ['apps', 'packages', 'scripts', 'config', 'docker']) { try { walk(path.join(root, top)); } catch { /* absent in a slim checkout */ } }
  return hits;
}

describe('no hardcoded Kiorex/Kiorly hosts in runtime code (ADR-059)', () => {
  it('runtime source has zero domain literals', () => {
    const hits = scan(root);
    expect(hits.map((h) => `${h.file}:${h.line} ${h.host}`), 'move the host to configuration (env var, config/domains.json or the registry)').toEqual([]);
  });
  it('the detector itself catches literals and ignores comments', () => {
    const re = (s: string) => [...s.matchAll(DOMAIN_RE)].map((m) => m[1]);
    expect(re(`const u = 'https://app.kiorly.com/x'`)).toEqual(['app.kiorly.com']);
    expect(re('fetch(`https://api.kiorex.com`)')).toEqual(['api.kiorex.com']);
    expect(re(`const h = "kiorly.link"`)).toEqual(['kiorly.link']);
    expect(re(`const t = process.env.X ?? ''`)).toEqual([]);
  });
});
