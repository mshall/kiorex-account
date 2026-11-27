import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../src/build';
import { resolveConfig, type SiteConfig } from '../src/config';
import { SECTIONS } from '../src/render';
import { FAQ, MODULES, MODULE_ORDER } from '../src/content';

const ENV = { KIORLY_SITE_ENV: 'test', KIORLY_SITE_ORIGIN: 'https://site.example', KIORLY_HOME_URL: 'https://home.example' };
const PLANS = { plans: [{ id: 'one', name: { ar: 'باقة أولى', en: 'First plan' }, summary: { ar: 'ملخص', en: 'Summary of the first plan' }, features: { ar: ['ميزة أ'], en: ['Feature A'] } }] };
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
const read = (root: string, rel: string) => readFileSync(path.join(root, rel), 'utf8');
const tmp: string[] = [];
async function make(env: Record<string, string>) {
  const cfg: SiteConfig = resolveConfig(env, () => JSON.stringify(PLANS));
  const out = mkdtempSync(path.join(os.tmpdir(), 'kiorly-site-')); tmp.push(out);
  await buildSite(cfg, out);
  return { cfg, out };
}
afterAll(() => { for (const t of tmp) rmSync(t, { recursive: true, force: true }); });

describe('built site (test environment, mock leads, no plans)', () => {
  let out = ''; let cfg: SiteConfig;
  beforeAll(async () => { ({ out, cfg } = await make(ENV)); });

  it('writes the home page in both languages plus the root chooser and the 404, and nothing else', () => {
    const pages = walk(out).filter((f) => f.endsWith('.html')).map((f) => path.relative(out, f)).sort();
    expect(pages).toEqual(['404.html', 'ar/index.html', 'en/index.html', 'index.html']);
  });
  it('Arabic is right to left, English left to right', () => { expect(read(out, 'ar/index.html')).toMatch(/<html lang="ar" dir="rtl">/); expect(read(out, 'en/index.html')).toMatch(/<html lang="en" dir="ltr">/); });
  it('has exactly one h1, a title, a description, a canonical and hreflang pairs; every section has a heading and an id', () => {
    for (const l of ['ar', 'en']) {
      const h = read(out, `${l}/index.html`);
      expect(h.match(/<h1[ >]/g)).toHaveLength(1); expect(h).toMatch(/<title>[^<]{5,}<\/title>/); expect(h).toMatch(/<meta name="description" content="[^"]{20,}"/);
      expect(h).toContain(`<link rel="canonical" href="https://site.example/${l}/">`); expect(h).toContain('hreflang="ar"'); expect(h).toContain('hreflang="en"'); expect(h).toContain('hreflang="x-default"');
      for (const s of SECTIONS) { expect(h, s).toContain(`id="${s}"`); expect(h, `${s} heading`).toContain(`id="${s}-h"`); }
      expect(h.match(/<h2[ >]/g)!.length).toBeGreaterThanOrEqual(SECTIONS.length);
    }
  });
  it('shows every product with benefits, standalone and connected, a flow and a screenshot mock-up (both languages)', () => {
    for (const l of ['ar', 'en'] as const) {
      const h = read(out, `${l}/index.html`);
      for (const id of MODULE_ORDER) { const m = MODULES[id][l]; expect(h, `${l} ${id}`).toContain(`id="panel-${id}"`); expect(h).toContain(m.name); for (const b of m.benefits) expect(h).toContain(b.replace(/&/g, '&amp;').replace(/'/g, '&#39;')); expect(h).toContain(`<title id="m-${id}-t">`); }
      expect(h.match(/role="tabpanel"/g)!.length).toBeGreaterThanOrEqual(MODULE_ORDER.length + 4);
    }
  });
  it('explains the connected benefits: marketplace, booking, Passport, Pay, growth engine, commission visible to both sides, reconciliation, orders', () => {
    const h = read(out, 'en/index.html');
    for (const w of ['Patient discovery', 'Bookings on your live slots', 'Kiorex Passport', 'Kiorex Pay', 'Growth engine', 'Commission, visible to both sides', 'Reconciliation and settlement', 'Orders, labs and pharmacy', 'From search to visit', 'From prescription to pharmacy', 'From request to lab result', 'The home visit']) expect(h, w).toContain(w);
  });
  it('offers the two join choices in the page and in the form container', () => {
    const h = read(out, 'en/index.html');
    expect(h).toContain('data-join-mode="STANDALONE"'); expect(h).toContain('data-join-mode="CONNECTED"'); expect(h).toContain('data-join data-lang="en"'); expect(h).toContain('data-endpoint=""');
    expect(h).toContain('data-mock-banner'); expect(h).toContain('<noscript>');
  });
  it('non-production: noindex everywhere, robots disallows all, no sitemap, preview strip', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) expect(readFileSync(f, 'utf8'), f).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(read(out, 'robots.txt')).toBe('User-agent: *\nDisallow: /\n'); expect(existsSync(path.join(out, 'sitemap.xml'))).toBe(false);
    expect(cfg.previewBanner).toBe(true); expect(read(out, 'en/index.html')).toContain('class="preview"');
  });
  it('plans: clearly marked placeholders with TODO_NEEDS_HUMAN, never a price or a plan name of our own', () => {
    for (const l of ['ar', 'en']) { const h = read(out, `${l}/index.html`); expect(h).toContain('data-plan-placeholder'); expect(h).toContain('data-needs-human'); expect(h).toContain('TODO_NEEDS_HUMAN'); }
    for (const f of ['ar/index.html', 'en/index.html']) expect(read(out, f)).not.toMatch(/\b(EGP|USD|E£)\b|ج\.م|جنيه|\$\s?\d|\d\s?(EGP|جنيه)|\d+\s?%/);
  });
  it('the consent text is a draft marked TODO_NEEDS_HUMAN in the form script, with a version', () => {
    const js = read(out, 'assets/' + readdirSync(path.join(out, 'assets')).find((n) => /^site\..*\.js$/.test(n))!);
    expect(js).toContain('TODO_NEEDS_HUMAN'); expect(js).toContain('draft-2');
  });
  it('sign-in links go to the Home origin from the build environment', () => { expect(read(out, 'en/index.html')).toContain('href="https://home.example/signin"'); });
  it('contains no localhost or hardcoded host: every absolute URL is one the build was given', () => {
    const allowed = new Set(['https://site.example', 'https://home.example', 'https://schema.org', 'http://www.w3.org', 'http://www.sitemaps.org']);
    for (const f of walk(out).filter((x) => /\.(html|js|css|txt|xml|svg)$/.test(x) && !x.endsWith('OFL.txt'))) { // the font licence text names its own project
      const t = readFileSync(f, 'utf8'); expect(t, f).not.toMatch(/localhost|127\.0\.0\.1/);
      for (const m of t.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) expect(allowed.has(m[0].replace(/\/$/, '')), `${f}: ${m[0]}`).toBe(true);
    }
  });
  it('CSP allows scripts and connections only to self (mock mode adds no remote origin) and no inline script runs', () => {
    const h = read(out, 'en/index.html'); expect(h).toContain("script-src 'self'"); expect(h).toContain("connect-src 'self';"); expect(h).toContain("form-action 'none'");
    expect(h.match(/<script(?![^>]*type="application\/ld\+json")[^>]*>/g)!.every((s) => /\bsrc="/.test(s))).toBe(true);
  });
  it('brand: Kiorly marks are the ones the Kiorly guard checksums; the Kiorex logo is the founder spec file, byte for byte', () => {
    const kx = path.resolve(__dirname, '../../../../_brand'); const sum = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    for (const f of ['kiorly-lockup.svg', 'kiorly-lockup-ar.svg', 'kiorly-mark.svg']) expect(read(out, 'en/index.html') + read(out, 'ar/index.html') + read(out, 'index.html')).toContain(f);
    expect(read(out, 'en/index.html')).toContain('/assets/brand/kiorex-logo-full.svg');
    if (!existsSync(kx)) return;
    for (const f of ['kiorex-logo-full.svg', 'kiorex-mark.svg']) expect(sum(readFileSync(path.join(out, 'assets/brand', f))), f).toBe(sum(readFileSync(path.join(kx, f))));
    for (const f of ['kiorly-lockup.svg', 'kiorly-lockup-inverse.svg', 'kiorly-lockup-ar.svg', 'kiorly-lockup-ar-inverse.svg', 'kiorly-mark.svg', 'kiorly-mark-inverse.svg']) expect(sum(readFileSync(path.join(out, 'assets/brand', f))), f).toBe(sum(readFileSync(path.join(kx, 'dist/svg', f))));
  });
  it('no legacy Kiorex chevron mark anywhere (the Kiorex logo is the waveform)', () => {
    for (const f of walk(out).filter((x) => /kiorex/i.test(path.basename(x)) && x.endsWith('.svg'))) expect(readFileSync(f, 'utf8'), f).toMatch(/<rect x="37"/);
  });
  it('every internal link and asset reference resolves to a built file; every in-page link targets an existing id', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) {
      const h = readFileSync(f, 'utf8');
      for (const m of h.matchAll(/(?:href|src|srcset)="(\/[^"#?]*)"/g)) { let rel = m[1]!; if (rel.endsWith('/')) rel += 'index.html'; expect(existsSync(path.join(out, rel)), `${path.relative(out, f)} -> ${m[1]}`).toBe(true); }
      for (const m of h.matchAll(/href="#([a-z-]+)"/g)) if (m[1] !== 'main' && m[1] !== 'top') expect(h, `#${m[1]}`).toContain(`id="${m[1]}"`);
      for (const m of h.matchAll(/<use href="#([a-z-]+)"/g)) expect(h, m[1]).toContain(`<symbol id="${m[1]}"`);
    }
  });
  it('all images have alt text, every inline illustration has a title, and ids are unique', () => {
    for (const l of ['ar', 'en']) {
      const h = read(out, `${l}/index.html`); for (const m of h.matchAll(/<img\b[^>]*>/g)) expect(m[0]).toMatch(/\balt="/);
      expect((h.match(/<svg class="art"[^>]*role="img"[^>]*aria-labelledby="/g) ?? []).length).toBe((h.match(/<svg class="art"/g) ?? []).length);
      const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!); expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
    }
  });
  it('the FAQ is in the page and in the structured data', () => { const h = read(out, 'en/index.html'); for (const f of FAQ.items.en) expect(h).toContain(f.q.replace(/'/g, '&#39;')); expect(h).toContain('"@type":"FAQPage"'); });
  it('the script stays small', () => { const js = readdirSync(path.join(out, 'assets')).find((n) => /^site\..*\.js$/.test(n))!; expect(statSync(path.join(out, 'assets', js)).size).toBeLessThan(80_000); });
});

describe('built site (production, live lead endpoint, plans from config)', () => {
  let out = '';
  beforeAll(async () => { ({ out } = await make({ ...ENV, KIORLY_SITE_ENV: 'prod', KIORLY_LEAD_ENDPOINT: 'https://api.example/api/v1/public/leads', KIORLY_PLANS_FILE: 'plans.json', KIORLY_CONTACT_EMAIL: 'hello@site.example' })); });
  it('is indexable: robots allows, sitemap lists both languages with alternates, no preview strip, 404 not indexable', () => {
    expect(read(out, 'robots.txt')).toContain('Sitemap: https://site.example/sitemap.xml');
    const x = read(out, 'sitemap.xml'); expect((x.match(/<url>/g) ?? []).length).toBe(2); expect(x).toContain('hreflang="en" href="https://site.example/en/"');
    expect(read(out, 'en/index.html')).toContain('<meta name="robots" content="index,follow">'); expect(read(out, 'en/index.html')).not.toContain('class="preview"'); expect(read(out, '404.html')).toContain('noindex');
  });
  it('lists configured plans with the pricing note and no price; the TODO markers and placeholders are gone', () => {
    const h = read(out, 'en/index.html');
    expect(h).toContain('First plan'); expect(h).toContain('Feature A'); expect(h).toContain('data-pricing-note'); expect(h).not.toContain('data-plan-placeholder'); expect(h).not.toContain('data-needs-human'); expect(h).not.toContain('TODO_NEEDS_HUMAN');
    expect(read(out, 'ar/index.html')).toContain('باقة أولى');
  });
  it('the form posts to the configured endpoint, which is the only extra CSP connect origin; no mock banner; footer shows the contact', () => {
    const h = read(out, 'en/index.html'); expect(h).toContain('data-endpoint="https://api.example/api/v1/public/leads"'); expect(h).toContain("connect-src 'self' https://api.example;"); expect(h).not.toContain('data-mock-banner'); expect(h).toContain('mailto:hello@site.example');
  });
});

describe('built site (production without plans)', () => {
  it('shows a neutral note instead of placeholders', async () => {
    const { out } = await (async () => { const cfg = resolveConfig({ ...ENV, KIORLY_SITE_ENV: 'prod', KIORLY_ALLOW_MOCK_LEADS: 'true' }); const o = mkdtempSync(path.join(os.tmpdir(), 'kiorly-site-')); tmp.push(o); await buildSite(cfg, o); return { out: o }; })();
    const h = read(out, 'en/index.html'); expect(h).toContain('Plans are being prepared'); expect(h).not.toContain('data-plan-placeholder'); expect(h).not.toContain('TODO_NEEDS_HUMAN');
  });
});
