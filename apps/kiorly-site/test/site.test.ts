import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { buildSite } from '../src/build';
import { resolveConfig, type SiteConfig } from '../src/config';
import { SLUGS } from '../src/render';

const ENV = { KIORLY_SITE_ENV: 'test', KIORLY_SITE_ORIGIN: 'https://site.example', KIORLY_HOME_URL: 'https://home.example' };
const PLANS = { plans: [{ id: 'one', name: { ar: 'باقة أولى', en: 'First plan' }, summary: { ar: 'ملخص', en: 'Summary of the first plan' }, features: { ar: ['ميزة أ'], en: ['Feature A'] } }] };
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n)) : [path.join(d, n)]));
const read = (root: string, rel: string) => readFileSync(path.join(root, rel), 'utf8');

const tmp: string[] = [];
async function make(env: Record<string, string>, plans = false) {
  const cfg: SiteConfig = resolveConfig(env, () => JSON.stringify(PLANS));
  void plans;
  const out = mkdtempSync(path.join(os.tmpdir(), 'kiorly-site-')); tmp.push(out);
  await buildSite(cfg, out);
  return { cfg, out };
}
afterAll(() => { for (const t of tmp) rmSync(t, { recursive: true, force: true }); });

describe('built site (test environment, mock leads, no plans)', () => {
  let out = ''; let cfg: SiteConfig;
  beforeAll(async () => { ({ out, cfg } = await make(ENV)); });

  it('writes both languages for every page plus the root chooser and the 404', () => {
    for (const l of ['ar', 'en']) { expect(existsSync(path.join(out, l, 'index.html'))).toBe(true); for (const s of SLUGS) expect(existsSync(path.join(out, l, s, 'index.html')), `${l}/${s}`).toBe(true); }
    expect(existsSync(path.join(out, 'index.html'))).toBe(true); expect(existsSync(path.join(out, '404.html'))).toBe(true);
  });
  it('Arabic pages are right to left, English left to right, each with the right lang', () => {
    for (const s of ['', ...SLUGS]) {
      expect(read(out, `ar/${s}${s ? '/' : ''}index.html`)).toMatch(/<html lang="ar" dir="rtl">/);
      expect(read(out, `en/${s}${s ? '/' : ''}index.html`)).toMatch(/<html lang="en" dir="ltr">/);
    }
  });
  it('has exactly one h1, a title, a description, a canonical and hreflang pairs on every page', () => {
    for (const f of walk(out).filter((x) => /\/(ar|en)\/.*index\.html$/.test(x))) {
      const h = readFileSync(f, 'utf8');
      expect(h.match(/<h1[ >]/g), f).toHaveLength(1);
      expect(h).toMatch(/<title>[^<]{5,}<\/title>/); expect(h).toMatch(/<meta name="description" content="[^"]{20,}"/);
      expect(h).toMatch(/<link rel="canonical" href="https:\/\/site\.example\/(ar|en)\//);
      expect(h).toContain('hreflang="ar"'); expect(h).toContain('hreflang="en"'); expect(h).toContain('hreflang="x-default"');
    }
  });
  it('non-production: noindex everywhere, robots disallows all, no sitemap', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) expect(readFileSync(f, 'utf8'), f).toContain('<meta name="robots" content="noindex,nofollow">');
    expect(read(out, 'robots.txt')).toBe('User-agent: *\nDisallow: /\n'); expect(existsSync(path.join(out, 'sitemap.xml'))).toBe(false);
    expect(cfg.previewBanner).toBe(true); expect(read(out, 'en/index.html')).toContain('class="preview"');
  });
  it('contains no localhost or hardcoded host: every absolute URL is one the build was given', () => {
    const allowed = new Set(['https://site.example', 'https://home.example', 'https://schema.org', 'http://www.w3.org', 'http://www.sitemaps.org']);
    for (const f of walk(out).filter((x) => /\.(html|js|css|txt|xml|svg)$/.test(x))) {
      const t = readFileSync(f, 'utf8'); expect(t, f).not.toMatch(/localhost|127\.0\.0\.1/);
      for (const m of t.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) expect(allowed.has(m[0].replace(/\/$/, '')), `${f}: ${m[0]}`).toBe(true);
    }
  });
  it('plans page without config shows the neutral placeholder and never a price', () => {
    for (const l of ['ar', 'en']) { const h = read(out, `${l}/plans/index.html`); expect(h).not.toMatch(/data-pricing-note/); expect(h).not.toMatch(/\b(EGP|USD|E£)\b|ج\.م|جنيه|\$\s?\d|\d\s?(EGP|جنيه)/); }
    expect(read(out, 'en/plans/index.html')).toContain('Plans are being set up');
  });
  it('onboarding form: mock banner, labelled fields, consent marked as draft, honeypot, no endpoint', () => {
    const h = read(out, 'en/onboarding/index.html');
    expect(h).toContain('data-mock-banner'); expect(h).toContain('data-endpoint=""'); expect(h).toContain('Draft wording, pending legal review');
    for (const id of ['kind', 'organisation', 'contactName', 'phone', 'email', 'city', 'message', 'consent', 'website']) expect(h, id).toContain(`for="f-${id}"`);
    expect(h).toContain('name="website"');
    expect(read(out, 'ar/onboarding/index.html')).toContain('صياغة مبدئية بانتظار المراجعة القانونية');
  });
  it('sign-in links go to the Home origin from the build environment', () => { expect(read(out, 'en/index.html')).toContain('href="https://home.example/signin"'); });
  it('CSP allows scripts and connections only to self (mock mode adds no remote origin)', () => {
    const h = read(out, 'en/onboarding/index.html'); expect(h).toContain("script-src 'self'"); expect(h).toContain("connect-src 'self';");
  });
  it('uses only the Kiorly marks: no Kiorex logo file or reference anywhere in dist', () => {
    const files = walk(out);
    expect(files.filter((f) => /kiorex/i.test(path.basename(f)))).toEqual([]);
    for (const f of files.filter((x) => /\.(html|css|js|svg)$/.test(x))) expect(readFileSync(f, 'utf8'), f).not.toMatch(/kiorex-(logo|mark|badge|wordmark)|KIOREX<\/text>/i);
    for (const f of ['kiorly-lockup.svg', 'kiorly-lockup-ar.svg', 'kiorly-mark.svg']) expect(read(out, `en/index.html`) + read(out, 'ar/index.html') + read(out, 'index.html')).toContain(f);
  });
  it('brand files are byte-identical to the workspace Kiorly set that the Kiorly guard checksums (when the workspace is present)', () => {
    const src = path.resolve(__dirname, '../../../../_brand/dist/svg');
    if (!existsSync(src)) return;
    for (const f of ['kiorly-lockup.svg', 'kiorly-lockup-inverse.svg', 'kiorly-lockup-ar.svg', 'kiorly-lockup-ar-inverse.svg', 'kiorly-mark.svg', 'kiorly-mark-inverse.svg']) {
      const a = createHash('sha256').update(readFileSync(path.join(src, f))).digest('hex'); const b = createHash('sha256').update(readFileSync(path.join(out, 'assets/brand', f))).digest('hex');
      expect(b, f).toBe(a);
    }
  });
  it('every internal link and asset reference resolves to a built file', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/(?:href|src|srcset)="(\/[^"#?]*)"/g)) {
        let rel = m[1]!; if (rel.endsWith('/')) rel += 'index.html';
        expect(existsSync(path.join(out, rel)), `${path.relative(out, f)} -> ${m[1]}`).toBe(true);
      }
    }
  });
  it('all images have alt text (decorative ones an empty alt) and the page is small', () => {
    for (const f of walk(out).filter((x) => x.endsWith('.html'))) { const h = readFileSync(f, 'utf8'); for (const m of h.matchAll(/<img\b[^>]*>/g)) expect(m[0], f).toMatch(/\balt="/); expect(h.length, f).toBeLessThan(20_000); }
    expect(statSync(path.join(out, 'assets', readdirSync(path.join(out, 'assets')).find((n) => /^site\..*\.js$/.test(n))!)).size).toBeLessThan(6_000);
  });
});

describe('built site (production, live lead endpoint, plans from config)', () => {
  let out = '';
  beforeAll(async () => { ({ out } = await make({ ...ENV, KIORLY_SITE_ENV: 'prod', KIORLY_LEAD_ENDPOINT: 'https://api.example/public/leads', KIORLY_PLANS_FILE: 'plans.json', KIORLY_CONTACT_EMAIL: 'hello@site.example' }, true)); });
  it('is indexable: robots allows, sitemap lists every page in both languages with alternates', () => {
    expect(read(out, 'robots.txt')).toContain('Sitemap: https://site.example/sitemap.xml');
    const x = read(out, 'sitemap.xml'); expect((x.match(/<url>/g) ?? []).length).toBe(2 * (1 + SLUGS.length));
    expect(x).toContain('<loc>https://site.example/ar/clinics/</loc>'); expect(x).toContain('hreflang="en" href="https://site.example/en/plans/"');
    expect(read(out, 'en/index.html')).toContain('<meta name="robots" content="index,follow">'); expect(read(out, 'en/index.html')).not.toContain('class="preview"');
    expect(read(out, '404.html')).toContain('noindex'); // an error page is never indexable
  });
  it('lists configured plans with the "pricing set in Ops" note and no price', () => {
    const h = read(out, 'en/plans/index.html');
    expect(h).toContain('First plan'); expect(h).toContain('Feature A'); expect(h).toContain('Pricing is set in Kiorly Ops and is not published on this page.'); expect(h).toContain('data-pricing-note');
    expect(read(out, 'ar/plans/index.html')).toContain('باقة أولى');
  });
  it('the form posts to the configured endpoint, which is the only extra CSP connect origin; no mock banner', () => {
    const h = read(out, 'en/onboarding/index.html'); expect(h).toContain('data-endpoint="https://api.example/public/leads"'); expect(h).toContain("connect-src 'self' https://api.example;"); expect(h).not.toContain('data-mock-banner');
  });
  it('shows the configured contact address', () => { expect(read(out, 'en/index.html')).toContain('mailto:hello@site.example'); });
});
