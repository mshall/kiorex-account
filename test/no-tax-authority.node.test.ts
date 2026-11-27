import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Founder decision (CLAUDE.md, ADR-011 / KX-01 / FD-02, 19 Nov 2026): NO tax-authority reporting anywhere in the ecosystem.
 * No ETA / e-invoice / e-receipt submission, no ZATCA / FTA, no signing certificates or fiscal devices for that purpose.
 * This test fails if source, config or infra in this repo references any of them. Documentation (*.md) is excluded so the rule
 * itself can be written down.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', '.terraform', 'dist', 'coverage', 'Docs']);
const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.tf', '.tfvars', '.yml', '.yaml', '.sh', '.html', '.css', '.hcl', '.toml']);
const SKIP_FILES = new Set(['package-lock.json', 'no-tax-authority.node.test.ts']);

const FORBIDDEN: Array<[string, RegExp]> = [
  ['Egyptian Tax Authority / ETA', /\bETA\b|egyptian[\s_-]*tax[\s_-]*authority|eta\.gov\.eg|invoicing\.eta|preprod\.invoicing|submitToETA/i],
  ['e-invoice', /\be[\s_-]?invoic(e|ing)/i],
  ['e-receipt', /\be[\s_-]?receipt/i],
  ['ZATCA / FTA / fiscal reporting', /\bzatca\b|\bfatoora\b|federal[\s_-]*tax[\s_-]*authority|fiscal[\s_-]*(device|printer|memory)/i],
  ['tax submission / e-seal', /tax[\s_-]*(authority|submission|reporting)[\s_-]*(api|client|endpoint)|e[\s_-]?seal\b/i],
];

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (SCAN_EXT.has(path.extname(name)) && !SKIP_FILES.has(name)) yield full;
  }
}

describe('no-tax-authority (CLAUDE.md founder decision)', () => {
  it('scans a meaningful amount of source (guards against an empty scan)', () => {
    const files = [...walk(ROOT)];
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.endsWith(path.join('apps', 'dev-idp', 'src', 'app.ts')))).toBe(true);
  });

  it('no source, config or infra file references tax-authority reporting (ETA / e-invoice / e-receipt submission)', () => {
    const hits: string[] = [];
    for (const f of walk(ROOT)) {
      const text = readFileSync(f, 'utf8');
      for (const [label, re] of FORBIDDEN) {
        const m = re.exec(text);
        if (m) hits.push(`${path.relative(ROOT, f)}: ${label} -> "${m[0]}"`);
      }
    }
    expect(hits, `Tax-authority references are forbidden by founder decision:\n${hits.join('\n')}`).toEqual([]);
  });

  it('the detector itself catches the forbidden patterns and ignores normal words', () => {
    const samples = ['POST https://invoicing.eta.gov.eg/api/v1/documentsubmissions', 'submitToETA(invoice)', 'await eInvoice.send()', 'e-receipt upload', 'zatca client', 'Egyptian Tax Authority', 'tax authority client'];
    for (const s of samples) expect(FORBIDDEN.some(([, re]) => re.test(s)), s).toBe(true);
    for (const ok of ['beta release', 'metadata', 'phone number', 'VAT line on a Kiorly SaaS invoice', 'delta', 'seal the envelope']) expect(FORBIDDEN.some(([, re]) => re.test(ok)), ok).toBe(false);
  });
});
