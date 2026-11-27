/** Static HTML rendering of every page, both languages. Pure functions: config in, strings out (the build script writes the files). */
import { LANGS, type Lang, type SiteConfig } from './config';
import { BRAND, COMMON, HOME, HOW, NAV, ONBOARDING, PLANS, PRODUCTS, type ProductCopy } from './content';
import { LEAD_KINDS } from './lead';

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const SLUGS = ['clinics', 'pharmacies', 'labs', 'how-it-works', 'plans', 'onboarding'] as const;
export type Slug = (typeof SLUGS)[number];
export interface Assets { css: string; js: string; langJs: string }
export interface OutFile { path: string; body: string }

const dir = (l: Lang) => (l === 'ar' ? 'rtl' : 'ltr');
export const urlPath = (l: Lang, slug?: Slug | ''): string => `/${l}/${slug ? `${slug}/` : ''}`;
const other = (l: Lang): Lang => (l === 'ar' ? 'en' : 'ar');
const lockup = (l: Lang, variant: '' | '-inverse') => `/assets/brand/kiorly-lockup${l === 'ar' ? '-ar' : ''}${variant}.svg`;

interface Meta { title: string; description: string; slug: Slug | ''; noindex?: boolean }

function head(cfg: SiteConfig, l: Lang, m: Meta, a: Assets): string {
  const canonical = `${cfg.origin}${urlPath(l, m.slug)}`;
  const alts = LANGS.map((x) => `<link rel="alternate" hreflang="${x}" href="${cfg.origin}${urlPath(x, m.slug)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${cfg.origin}/">`;
  const robots = cfg.indexable && !m.noindex ? 'index,follow' : 'noindex,nofollow';
  const connect = ["'self'", ...(cfg.leadEndpoint ? [new URL(cfg.leadEndpoint).origin] : [])].join(' ');
  const csp = `default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src ${connect}; base-uri 'none'; form-action 'self'; manifest-src 'none'`;
  const ld = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Kiorly', url: cfg.origin, logo: `${cfg.origin}/assets/brand/kiorly-mark.svg` }).replace(/</g, '\\u003c');
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title>
<meta name="description" content="${esc(m.description)}"><meta name="robots" content="${robots}"><meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="canonical" href="${canonical}">${alts}<meta name="color-scheme" content="light dark"><meta name="theme-color" content="#3730A3">
<meta property="og:type" content="website"><meta property="og:site_name" content="Kiorly"><meta property="og:title" content="${esc(m.title)}"><meta property="og:description" content="${esc(m.description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${l === 'ar' ? 'ar_EG' : 'en_US'}"><meta name="twitter:card" content="summary">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/${l === 'ar' ? 'IBMPlexSansArabic_400Regular' : 'Jost_400Regular'}.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="${a.css}"><script type="application/ld+json">${ld}</script>`;
}

function header(cfg: SiteConfig, l: Lang, slug: Slug | ''): string {
  const link = (s: Slug, label: string) => `<a href="${urlPath(l, s)}"${slug === s ? ' aria-current="page"' : ''}>${esc(label)}</a>`;
  const links = [link('clinics', NAV.clinics[l]), link('pharmacies', NAV.pharmacies[l]), link('labs', NAV.labs[l]), link('how-it-works', NAV.how[l]), link('plans', NAV.plans[l])].join('');
  return `<a class="skip" href="#main">${esc(NAV.skip[l])}</a>${cfg.previewBanner ? `<div class="preview" role="note">${esc(COMMON.previewBanner[l])}</div>` : ''}
<header class="top"><div class="wrap bar">
<a class="logo" href="${urlPath(l)}" aria-label="${esc(BRAND[l])}"><picture><source srcset="${lockup(l, '-inverse')}" media="(prefers-color-scheme: dark)"><img src="${lockup(l, '')}" width="180" height="43" alt="${esc(BRAND[l])}"></picture></a>
<details class="menu"><summary>${esc(NAV.menu[l])}</summary><nav aria-label="${esc(NAV.primary[l])}">${links}<a class="lang" href="${urlPath(other(l), slug)}" hreflang="${other(l)}" lang="${other(l)}">${esc(NAV.language[l])}</a><a class="btn ghost" href="${cfg.homeUrl}/signin">${esc(NAV.signIn[l])}</a><a class="btn" href="${urlPath(l, 'onboarding')}">${esc(NAV.onboarding[l])}</a></nav></details>
</div></header>`;
}

function footer(cfg: SiteConfig, l: Lang): string {
  return `<footer class="foot"><div class="wrap"><img src="/assets/brand/kiorly-mark.svg" width="36" height="25" alt="" aria-hidden="true">
<p>${esc(COMMON.footerLine[l])}</p><ul><li><a href="${urlPath(l, 'clinics')}">${esc(NAV.clinics[l])}</a></li><li><a href="${urlPath(l, 'pharmacies')}">${esc(NAV.pharmacies[l])}</a></li><li><a href="${urlPath(l, 'labs')}">${esc(NAV.labs[l])}</a></li><li><a href="${urlPath(l, 'plans')}">${esc(NAV.plans[l])}</a></li></ul>
${cfg.contactEmail ? `<p>${esc(COMMON.contact[l])}: <a href="mailto:${esc(cfg.contactEmail)}" dir="ltr">${esc(cfg.contactEmail)}</a></p>` : ''}</div></footer>`;
}

function shell(cfg: SiteConfig, l: Lang, m: Meta, a: Assets, main: string, withScript = true): string {
  return `<!doctype html><html lang="${l}" dir="${dir(l)}"><head>${head(cfg, l, m, a)}</head><body class="${l}">${header(cfg, l, m.slug)}<main id="main" tabindex="-1">${main}</main>${footer(cfg, l)}${withScript ? `<script src="${a.js}" defer></script>` : ''}</body></html>`;
}

const cta = (l: Lang) => `<a class="btn" href="${urlPath(l, 'onboarding')}">${esc(NAV.onboarding[l])}</a>`;

function home(cfg: SiteConfig, l: Lang, a: Assets): string {
  const cards = (['clinics', 'pharmacies', 'labs'] as const).map((s) => { const p = PRODUCTS[s][l]; return `<li class="card"><h3>${esc(p.name)}</h3><p>${esc(p.lead)}</p><a href="${urlPath(l, s)}">${esc(HOME.learnMore[l])}<span class="sr"> - ${esc(p.name)}</span></a></li>`; }).join('');
  const main = `<section class="hero"><div class="wrap"><h1>${esc(HOME.h1[l])}</h1><p class="lead">${esc(HOME.lead[l])}</p><p class="row">${cta(l)}<a class="btn ghost" href="${urlPath(l, 'how-it-works')}">${esc(NAV.how[l])}</a></p></div></section>
<section class="wrap"><h2>${esc(HOME.productsTitle[l])}</h2><ul class="grid">${cards}</ul></section>
<section class="wrap band"><div><h3>${esc(HOME.oneAccountTitle[l])}</h3><p>${esc(HOME.oneAccountText[l])}</p></div><div><h3>${esc(HOME.teamTitle[l])}</h3><p>${esc(HOME.teamText[l])}</p></div><div><h3>${esc(HOME.bilingualTitle[l])}</h3><p>${esc(HOME.bilingualText[l])}</p></div></section>
<section class="wrap cta"><h2>${esc(HOME.ctaTitle[l])}</h2><p>${esc(HOME.ctaText[l])}</p><p>${cta(l)}</p></section>`;
  return shell(cfg, l, { title: HOME.title[l], description: HOME.description[l], slug: '' }, a, main);
}

function product(cfg: SiteConfig, l: Lang, s: ProductCopy['slug'], a: Assets): string {
  const p = PRODUCTS[s][l];
  const main = `<section class="hero small"><div class="wrap"><h1>${esc(p.title)}</h1><p class="lead">${esc(p.lead)}</p><p class="muted">${esc(p.forWho)}</p><p>${cta(l)}</p></div></section>
<section class="wrap"><ul class="grid">${p.features.map((f) => `<li class="card"><h2>${esc(f.title)}</h2><p>${esc(f.text)}</p></li>`).join('')}</ul>${p.extra ? `<aside class="note"><h2>${esc(p.extra.title)}</h2><p>${esc(p.extra.text)}</p></aside>` : ''}</section>`;
  return shell(cfg, l, { title: `${p.title} | ${BRAND[l]}`, description: p.lead, slug: s }, a, main);
}

function how(cfg: SiteConfig, l: Lang, a: Assets): string {
  const main = `<section class="hero small"><div class="wrap"><h1>${esc(HOW.title[l])}</h1><p class="lead">${esc(HOW.lead[l])}</p></div></section>
<section class="wrap"><ol class="steps">${HOW.steps[l].map((s) => `<li><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></li>`).join('')}</ol><aside class="note"><h2>${esc(HOW.accountTitle[l])}</h2><p>${esc(HOW.accountText[l])}</p></aside><p>${cta(l)}</p></section>`;
  return shell(cfg, l, { title: `${HOW.title[l]} | ${BRAND[l]}`, description: HOW.description[l], slug: 'how-it-works' }, a, main);
}

/** Plans come only from configuration. The page never renders a price: every plan carries the "pricing is set in Ops" line. */
function plans(cfg: SiteConfig, l: Lang, a: Assets): string {
  const list = cfg.plans
    ? `<ul class="grid">${cfg.plans.map((p) => `<li class="card" id="plan-${esc(p.id)}"><h2>${esc(p.name[l])}</h2><p>${esc(p.summary[l])}</p>${p.features[l].length ? `<p class="muted">${esc(PLANS.includes[l])}</p><ul class="ticks">${p.features[l].map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}<p class="muted" data-pricing-note>${esc(PLANS.pricingNote[l])}</p></li>`).join('')}</ul>`
    : `<aside class="note"><h2>${esc(PLANS.emptyTitle[l])}</h2><p>${esc(PLANS.emptyText[l])}</p></aside>`;
  const main = `<section class="hero small"><div class="wrap"><h1>${esc(PLANS.title[l])}</h1><p class="lead">${esc(PLANS.lead[l])}</p></div></section><section class="wrap">${list}<p class="muted">${esc(PLANS.pricingNote[l])}</p><p>${cta(l)}</p></section>`;
  return shell(cfg, l, { title: `${PLANS.title[l]} | ${BRAND[l]}`, description: PLANS.description[l], slug: 'plans' }, a, main);
}

function onboarding(cfg: SiteConfig, l: Lang, a: Assets): string {
  const O = ONBOARDING;
  const err = (n: string) => `<p class="err" data-error-for="${n}" role="alert" hidden></p>`;
  const field = (n: string, label: string, type: string, extra = '', hint = '') => `<div class="field"><label for="f-${n}">${esc(label)}</label><input id="f-${n}" name="${n}" type="${type}" ${extra} aria-invalid="false"${hint ? ` aria-describedby="h-${n}"` : ''}>${hint ? `<p class="hint" id="h-${n}">${esc(hint)}</p>` : ''}${err(n)}</div>`;
  const data = `data-lead-form data-lang="${l}" data-env="${esc(cfg.env)}" data-endpoint="${esc(cfg.leadEndpoint ?? '')}" data-err-required="${esc(O.required[l])}" data-err-invalid="${esc(O.invalid[l])}" data-sending="${esc(O.sending[l])}" data-sent="${esc(O.sent[l])}" data-mock-sent="${esc(O.mockSent[l])}" data-failed="${esc(O.failed[l])}"`;
  const main = `<section class="hero small"><div class="wrap"><h1>${esc(O.title[l])}</h1><p class="lead">${esc(O.lead[l])}</p></div></section>
<section class="wrap narrow">${cfg.leadEndpoint ? '' : `<div class="alert" role="note" data-mock-banner>${esc(O.mockBanner[l])}</div>`}<noscript><p class="alert">${esc(O.noscript[l])}</p></noscript>
<form ${data} novalidate method="post" action="${urlPath(l, 'onboarding')}">
<div class="field"><label for="f-kind">${esc(O.kind[l])}</label><select id="f-kind" name="kind" aria-invalid="false"><option value="">${esc(O.kindChoose[l])}</option>${LEAD_KINDS.map((k) => `<option value="${k}">${esc(O.kinds[l][k])}</option>`).join('')}</select>${err('kind')}</div>
${field('organisation', O.organisation[l], 'text', 'autocomplete="organization" maxlength="120"')}${field('contactName', O.contactName[l], 'text', 'autocomplete="name" maxlength="120"')}
${field('phone', O.phone[l], 'tel', 'autocomplete="tel" inputmode="tel" dir="ltr" maxlength="24"', O.phoneHint[l])}${field('email', O.email[l], 'email', 'autocomplete="email" dir="ltr" maxlength="254"')}${field('city', O.city[l], 'text', 'autocomplete="address-level2" maxlength="80"')}
<div class="field"><label for="f-message">${esc(O.message[l])}</label><textarea id="f-message" name="message" rows="4" maxlength="1000"></textarea></div>
<div class="field trap" aria-hidden="true"><label for="f-website">Website</label><input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
<div class="field check"><input id="f-consent" name="consent" type="checkbox" aria-invalid="false" aria-describedby="h-consent"><label for="f-consent">${esc(O.consent[l])}</label><p class="hint" id="h-consent"><span class="draft">${esc(O.consentDraft[l])}</span></p>${err('consent')}</div>
<p><button class="btn" type="submit">${esc(O.submit[l])}</button></p><p class="status" data-status role="status" tabindex="-1"></p></form></section>`;
  return shell(cfg, l, { title: `${O.title[l]} | ${BRAND[l]}`, description: O.description[l], slug: 'onboarding' }, a, main, true);
}

function chooser(cfg: SiteConfig, a: Assets): string {
  const m: Meta = { title: 'Kiorly | كيورلي', description: `${HOME.description.ar} ${HOME.description.en}`, slug: '' };
  const csp = head(cfg, 'en', m, a).replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${cfg.origin}/">`);
  return `<!doctype html><html lang="en"><head>${csp}</head><body class="en chooser"><main id="main" class="wrap center"><img src="/assets/brand/kiorly-lockup.svg" width="240" height="58" alt="Kiorly"><h1 class="sr">${esc(COMMON.chooser.en)} / ${esc(COMMON.chooser.ar)}</h1><p class="row"><a class="btn" href="/ar/" hreflang="ar" lang="ar" dir="rtl">العربية</a><a class="btn ghost" href="/en/" hreflang="en" lang="en">English</a></p></main><script src="${a.langJs}" defer></script></body></html>`;
}

function notFound(cfg: SiteConfig, a: Assets): string {
  const l: Lang = 'en';
  const main = `<section class="hero small"><div class="wrap"><h1>${esc(COMMON.notFoundTitle.en)} / ${esc(COMMON.notFoundTitle.ar)}</h1><p class="lead" lang="ar" dir="rtl">${esc(COMMON.notFoundText.ar)}</p><p class="lead">${esc(COMMON.notFoundText.en)}</p><p><a class="btn" href="/">${esc(COMMON.backHome.en)} / ${esc(COMMON.backHome.ar)}</a></p></div></section>`;
  return shell(cfg, l, { title: `${COMMON.notFoundTitle.en} | Kiorly`, description: COMMON.notFoundText.en, slug: '', noindex: true }, a, main);
}

export function renderPages(cfg: SiteConfig, a: Assets): OutFile[] {
  const out: OutFile[] = [{ path: 'index.html', body: chooser(cfg, a) }, { path: '404.html', body: notFound(cfg, a) }];
  for (const l of LANGS) {
    out.push({ path: `${l}/index.html`, body: home(cfg, l, a) });
    for (const s of ['clinics', 'pharmacies', 'labs'] as const) out.push({ path: `${l}/${s}/index.html`, body: product(cfg, l, s, a) });
    out.push({ path: `${l}/how-it-works/index.html`, body: how(cfg, l, a) }, { path: `${l}/plans/index.html`, body: plans(cfg, l, a) }, { path: `${l}/onboarding/index.html`, body: onboarding(cfg, l, a) });
  }
  return out;
}

export function sitemapXml(cfg: SiteConfig): string {
  const slugs: Array<Slug | ''> = ['', ...SLUGS];
  const alt = (s: Slug | '') => LANGS.map((x) => `<xhtml:link rel="alternate" hreflang="${x}" href="${cfg.origin}${urlPath(x, s)}"/>`).join('');
  const urls = LANGS.flatMap((l) => slugs.map((s) => `<url><loc>${cfg.origin}${urlPath(l, s)}</loc>${alt(s)}</url>`));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>\n`;
}

/** Non-indexable environments disallow everything and publish no sitemap. */
export function robotsTxt(cfg: SiteConfig): string {
  return cfg.indexable ? `User-agent: *\nAllow: /\nSitemap: ${cfg.origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
}
