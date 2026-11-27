/** Static HTML rendering of the Kiorly page (one single-page experience per language) and its 404. Pure functions: config in, strings out (the build script writes the files). */
import { LANGS, type Lang, type SiteConfig } from './config';
import { ACCENT, connectionDiagram, heroArt, icon, mockup, pulseDivider, sprite } from './art';
import { COMMON, CONNECTED, FAQ, FLOWS, FOOT, HERO, JOIN, MODES, MODULES, MODULES_LEAD, MODULES_TITLE, MODULE_ORDER, MODULE_UI, NAV, PLANS, SECURITY, BRAND } from './content';

export const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export interface Assets { css: string; js: string; langJs: string; bootJs: string }
export interface OutFile { path: string; body: string }
export const SECTIONS = ['modules', 'connected', 'workflows', 'security', 'plans', 'faq', 'join'] as const;

const dir = (l: Lang) => (l === 'ar' ? 'rtl' : 'ltr');
export const urlPath = (l: Lang): string => `/${l}/`;
const other = (l: Lang): Lang => (l === 'ar' ? 'en' : 'ar');
const lockup = (l: Lang) => `/assets/brand/kiorly-lockup${l === 'ar' ? '-ar' : ''}.svg`;
const KIOREX_FULL = '/assets/brand/kiorex-logo-full.svg';

/** The platform marks unresolved human decisions with TODO_NEEDS_HUMAN. Preview builds show them; a production build drops the marker and keeps the neutral sentence. */
const clean = (cfg: SiteConfig, s: string): string => (cfg.previewBanner ? s : s.replace(/\s*\(TODO_NEEDS_HUMAN\)/g, '').replace(/^TODO_NEEDS_HUMAN:\s*/, ''));

function head(cfg: SiteConfig, l: Lang, title: string, description: string, a: Assets, noindex = false): string {
  const canonical = `${cfg.origin}${urlPath(l)}`;
  const alts = LANGS.map((x) => `<link rel="alternate" hreflang="${x}" href="${cfg.origin}${urlPath(x)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${cfg.origin}/">`;
  const robots = cfg.indexable && !noindex ? 'index,follow' : 'noindex,nofollow';
  const connect = ["'self'", ...(cfg.leadEndpoint ? [new URL(cfg.leadEndpoint).origin] : [])].join(' ');
  const csp = `default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'self'; script-src 'self'; connect-src ${connect}; base-uri 'none'; form-action 'none'; manifest-src 'none'`;
  const faq = FAQ.items[l].map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: clean(cfg, f.a) } }));
  const ld = JSON.stringify([{ '@context': 'https://schema.org', '@type': 'Organization', name: 'Kiorly', url: cfg.origin, logo: `${cfg.origin}/assets/brand/kiorly-mark.svg`, parentOrganization: { '@type': 'Organization', name: 'Kiorex' } }, { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }]).replace(/</g, '\\u003c');
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"><meta name="robots" content="${robots}"><meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="canonical" href="${canonical}">${alts}<meta name="color-scheme" content="light"><meta name="theme-color" content="#3730A3">
<meta property="og:type" content="website"><meta property="og:site_name" content="Kiorly"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${l === 'ar' ? 'ar_EG' : 'en_US'}"><meta name="twitter:card" content="summary">
<link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml"><link rel="preload" href="/assets/fonts/${l === 'ar' ? 'IBMPlexSansArabic_400Regular' : 'Jost_400Regular'}.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="${a.css}"><script src="${a.bootJs}"></script><script type="application/ld+json">${ld}</script>`;
}

function header(cfg: SiteConfig, l: Lang, base = ''): string {
  const links = [['modules', NAV.products], ['connected', NAV.connected], ['workflows', NAV.workflows], ['security', NAV.security], ['plans', NAV.plans], ['faq', NAV.faq]] as const;
  return `<a class="skip" href="#main">${esc(NAV.skip[l])}</a>${cfg.previewBanner ? `<aside class="preview" aria-label="${esc(COMMON.previewBanner[l])}">${esc(COMMON.previewBanner[l])}</aside>` : ''}
<header class="top"><div class="wrap bar">
<a class="logo" href="${base}#top" aria-label="${esc(BRAND[l])}"><img src="${lockup(l)}" width="156" height="37" alt="${esc(BRAND[l])}"></a>
<button type="button" class="menu-btn" data-menu-toggle aria-expanded="false" aria-controls="site-nav"><span class="sr">${esc(NAV.menu[l])}</span>${icon('menu', 'ic open-ic')}${icon('close', 'ic close-ic')}</button>
<nav id="site-nav" aria-label="${esc(NAV.primary[l])}">${links.map(([id, label]) => `<a href="${base}#${id}">${esc(label[l])}</a>`).join('')}<span class="nav-end"><a class="lang" href="${urlPath(other(l))}" hreflang="${other(l)}" lang="${other(l)}">${icon('globe')}${esc(NAV.language[l])}</a><a class="btn ghost small" href="${cfg.homeUrl}/signin">${esc(NAV.signIn[l])}</a><a class="btn small" href="${base}#join" data-join-mode="">${esc(NAV.join[l])}</a></span></nav>
</div></header>`;
}

function footer(cfg: SiteConfig, l: Lang, base = ''): string {
  return `<footer class="foot"><div class="wrap foot-grid"><div class="foot-brand"><div class="foot-logos"><img src="${lockup(l)}" width="150" height="36" alt="${esc(BRAND[l])}"><span class="by">${esc(l === 'ar' ? 'من' : 'by')}</span><img src="${KIOREX_FULL}" width="140" height="41" alt="Kiorex"></div><p>${esc(FOOT.blurb[l])}</p>${cfg.contactEmail ? `<p>${esc(FOOT.contact[l])}: <a href="mailto:${esc(cfg.contactEmail)}" dir="ltr">${esc(cfg.contactEmail)}</a></p>` : ''}</div>
<nav aria-label="${esc(FOOT.sections[l])}"><h2 class="foot-h">${esc(FOOT.sections[l])}</h2><ul>${[['modules', NAV.products], ['connected', NAV.connected], ['security', NAV.security], ['plans', NAV.plans], ['faq', NAV.faq], ['join', NAV.join]].map(([id, label]) => `<li><a href="${base}#${id}">${esc((label as Record<Lang, string>)[l])}</a></li>`).join('')}</ul></nav></div></footer>`;
}

const sectionHead = (id: string, eyebrow: string, title: string, lead: string) => `<div class="sec-head reveal"><p class="eyebrow">${esc(eyebrow)}</p><h2 id="${id}-h">${esc(title)}</h2><p class="lead">${esc(lead)}</p></div>`;
const needsHuman = (cfg: SiteConfig, text: string) => (cfg.previewBanner ? `<p class="nh" data-needs-human><span class="nh-tag">${esc(FOOT.needs.en)}</span> ${esc(text)}</p>` : '');

function hero(cfg: SiteConfig, l: Lang): string {
  return `<section class="hero" id="top" aria-labelledby="hero-h"><div class="wrap hero-grid">
<div class="hero-copy"><p class="eyebrow pill">${esc(HERO.eyebrow[l])}</p><h1 id="hero-h">${esc(HERO.h1[l])}</h1><p class="lead">${esc(HERO.lead[l])}</p>
<p class="row"><a class="btn big" href="#join" data-join-mode="">${esc(HERO.cta[l])}${icon('arrow', 'ic rtl-flip')}</a><a class="btn ghost big" href="#modules">${esc(HERO.ctaSecondary[l])}</a></p>
<ul class="ticks-row">${HERO.points[l].map((p) => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('')}</ul></div>
<figure class="hero-art">${heroArt(l, HERO.alt[l])}</figure></div></section>`;
}

function modules(cfg: SiteConfig, l: Lang): string {
  const tabs = MODULE_ORDER.map((id, i) => { const m = MODULES[id][l]; return `<button type="button" role="tab" id="tab-${id}" aria-controls="panel-${id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" class="mtab" style="--acc:${ACCENT[id]}">${icon(id === 'staff' ? 'staff' : id === 'enterprise' ? 'enterprise' : id)}<span><strong>${esc(m.name)}</strong><small>${esc(m.tag)}</small></span></button>`; }).join('');
  const panels = MODULE_ORDER.map((id, i) => {
    const m = MODULES[id][l];
    return `<div role="tabpanel" id="panel-${id}" aria-labelledby="tab-${id}" class="mpanel" style="--acc:${ACCENT[id]}"${i === 0 ? '' : ' hidden'} tabindex="0"><div class="mgrid">
<figure class="mshot">${mockup(id, l, m.mock)}</figure>
<div class="mtext"><h3>${esc(m.name)}</h3><p class="lead">${esc(m.pitch)}</p>
<h4>${esc(MODULE_UI.benefits[l])}</h4><ul class="ticks">${m.benefits.map((b) => `<li>${icon('check')}<span>${esc(b)}</span></li>`).join('')}</ul>
<div class="duo"><div class="duo-card"><h4>${esc(MODULE_UI.standalone[l])}</h4><ul>${m.standalone.map((b) => `<li>${esc(clean(cfg, b))}</li>`).join('')}</ul></div><div class="duo-card is-connected"><h4>${esc(MODULE_UI.connected[l])}</h4><ul>${m.connected.map((b) => `<li>${esc(clean(cfg, b))}</li>`).join('')}</ul></div></div>
<h4>${esc(MODULE_UI.flow[l])}</h4><ol class="flow-mini">${m.flow.map((s, n) => `<li><span class="n" aria-hidden="true">${n + 1}</span><span>${esc(s)}</span></li>`).join('')}</ol>
<p><a class="btn" href="#join" data-join-mode="" data-join-module="${id === 'enterprise' ? 'ENTERPRISE' : id === 'staff' ? 'STAFF_APP' : id.toUpperCase()}"${id === 'clinic' ? ' data-join-type="CLINIC"' : id === 'pharmacy' ? ' data-join-type="PHARMACY"' : id === 'lab' ? ' data-join-type="LAB"' : id === 'nurse' ? ' data-join-type="NURSE"' : id === 'enterprise' ? ' data-join-type="CHAIN"' : ''}>${esc(MODULE_UI.join[l])}</a></p></div></div></div>`;
  }).join('');
  return `<section class="sec alt" id="modules" aria-labelledby="modules-h"><div class="wrap">${sectionHead('modules', NAV.products[l], MODULES_TITLE[l], MODULES_LEAD[l])}
<div class="tabs reveal"><div role="tablist" aria-label="${esc(MODULE_UI.tabs[l])}" class="mtabs">${tabs}</div>${panels}</div></div></section>`;
}

function modes(cfg: SiteConfig, l: Lang): string {
  const card = (kind: 'standalone' | 'connected', mode: string) => { const m = MODES[kind]; return `<article class="mode-card ${kind === 'connected' ? 'is-connected' : ''} reveal"><h3>${esc(m.title[l])}</h3><p>${esc(m.text[l])}</p><ul class="ticks">${m.points[l].map((p) => `<li>${icon('check')}<span>${esc(p)}</span></li>`).join('')}</ul><p><a class="btn ${kind === 'connected' ? '' : 'ghost'}" href="#join" data-join-mode="${mode}">${esc(JOIN.title[l])}: ${esc(m.title[l])}</a></p></article>`; };
  return `<section class="sec" id="modes" aria-labelledby="modes-h"><div class="wrap">${sectionHead('modes', NAV.connected[l], MODES.title[l], MODES.lead[l])}<div class="mode-grid">${card('standalone', 'STANDALONE')}${card('connected', 'CONNECTED')}</div><p class="muted center-text reveal">${esc(clean(cfg, MODES.note[l]))}</p></div></section>`;
}

function connected(cfg: SiteConfig, l: Lang): string {
  return `<section class="sec alt" id="connected" aria-labelledby="connected-h"><div class="wrap">${sectionHead('connected', NAV.connected[l], CONNECTED.title[l], CONNECTED.lead[l])}
<figure class="diagram reveal">${connectionDiagram(l, CONNECTED.diagramAlt[l])}<figcaption class="by-line"><img src="${KIOREX_FULL}" width="180" height="53" alt="Kiorex"></figcaption></figure>
<ul class="cards">${CONNECTED.items[l].map((it) => `<li class="card reveal"><span class="ico">${icon(it.k)}</span><h3>${esc(it.title)}</h3><p>${esc(clean(cfg, it.text))}</p></li>`).join('')}</ul></div></section>`;
}

function flows(cfg: SiteConfig, l: Lang): string {
  const items = FLOWS.items[l];
  const tabs = items.map((f, i) => `<button type="button" role="tab" id="ftab-${f.id}" aria-controls="fpanel-${f.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}" class="ftab">${esc(f.title)}</button>`).join('');
  const panels = items.map((f, i) => `<div role="tabpanel" id="fpanel-${f.id}" aria-labelledby="ftab-${f.id}" class="fpanel"${i === 0 ? '' : ' hidden'} tabindex="0"><ol class="chain">${f.steps.map((s, n) => `<li><span class="n" aria-label="${esc(FLOWS.stepLabel[l])} ${n + 1}">${n + 1}</span><p>${esc(s)}</p></li>`).join('')}</ol></div>`).join('');
  return `<section class="sec" id="workflows" aria-labelledby="workflows-h"><div class="wrap">${sectionHead('workflows', NAV.workflows[l], FLOWS.title[l], FLOWS.lead[l])}<div class="tabs reveal"><div role="tablist" aria-label="${esc(FLOWS.title[l])}" class="ftabs">${tabs}</div>${panels}</div></div></section>`;
}

function security(cfg: SiteConfig, l: Lang): string {
  return `<section class="sec alt" id="security" aria-labelledby="security-h"><div class="wrap">${sectionHead('security', NAV.security[l], SECURITY.title[l], SECURITY.lead[l])}<ul class="cards three">${SECURITY.items[l].map((it) => `<li class="card reveal"><span class="ico">${icon(it.k)}</span><h3>${esc(it.title)}</h3><p>${esc(it.text)}</p></li>`).join('')}</ul>${cfg.previewBanner ? `<p class="nh reveal" data-needs-human>${esc(SECURITY.note[l])}</p>` : ''}</div></section>`;
}

/** Plans come only from configuration. Without it the page shows clearly marked placeholders and never a price or a plan name of its own. */
function plans(cfg: SiteConfig, l: Lang): string {
  let list: string;
  if (cfg.plans) list = `<ul class="plans">${cfg.plans.map((p) => `<li class="plan reveal" id="plan-${esc(p.id)}"><h3>${esc(p.name[l])}</h3><p>${esc(p.summary[l])}</p>${p.features[l].length ? `<p class="muted">${esc(PLANS.includes[l])}</p><ul class="ticks">${p.features[l].map((f) => `<li>${icon('check')}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}<p class="muted" data-pricing-note>${esc(PLANS.pricing[l])}</p><p><a class="btn ghost" href="#join" data-join-mode="">${esc(PLANS.contact[l])}</a></p></li>`).join('')}</ul>`;
  else if (cfg.previewBanner) list = `<ul class="plans placeholder">${[1, 2, 3].map(() => `<li class="plan is-placeholder reveal" data-plan-placeholder><h3>${esc(PLANS.placeholder[l])}</h3><ul>${PLANS.placeholderItems[l].map((x) => `<li>${esc(x)}</li>`).join('')}</ul><p class="muted">${esc(PLANS.pricing[l])}</p></li>`).join('')}</ul>${needsHuman(cfg, PLANS.needsHuman[l])}`;
  else list = `<div class="note-box reveal"><p>${esc(PLANS.prodNote[l])}</p><p><a class="btn" href="#join" data-join-mode="">${esc(PLANS.contact[l])}</a></p></div>`;
  return `<section class="sec" id="plans" aria-labelledby="plans-h"><div class="wrap">${sectionHead('plans', NAV.plans[l], PLANS.title[l], PLANS.lead[l])}${list}</div></section>`;
}

function faq(cfg: SiteConfig, l: Lang): string {
  return `<section class="sec alt" id="faq" aria-labelledby="faq-h"><div class="wrap narrow">${sectionHead('faq', NAV.faq[l], FAQ.title[l], '')}<div class="faq reveal">${FAQ.items[l].map((f) => `<details><summary>${esc(f.q)}${icon('plus', 'ic plus')}</summary><p>${esc(clean(cfg, f.a))}</p></details>`).join('')}</div></div></section>`;
}

function join(cfg: SiteConfig, l: Lang): string {
  return `<section class="sec join" id="join" aria-labelledby="join-h"><div class="wrap narrow"><div class="sec-head reveal"><p class="eyebrow">${esc(NAV.join[l])}</p><h2 id="join-h">${esc(JOIN.title[l])}</h2><p class="lead">${esc(JOIN.lead[l])}</p></div>
${cfg.leadEndpoint ? '' : `<div class="alert" role="note" data-mock-banner>${esc(JOIN.mockBanner[l])}</div>`}<noscript><p class="alert">${esc(JOIN.noscript[l])}${cfg.contactEmail ? ` <a href="mailto:${esc(cfg.contactEmail)}" dir="ltr">${esc(cfg.contactEmail)}</a>` : ''}</p></noscript>
<div class="join-card reveal" data-join data-lang="${l}" data-env="${esc(cfg.env)}" data-endpoint="${esc(cfg.leadEndpoint ?? '')}" data-preview="${cfg.previewBanner}"></div></div></section>`;
}

function shell(cfg: SiteConfig, l: Lang, title: string, description: string, a: Assets, main: string, opts: { noindex?: boolean; script?: boolean; bodyClass?: string; base?: string } = {}): string {
  return `<!doctype html><html lang="${l}" dir="${dir(l)}"><head>${head(cfg, l, title, description, a, opts.noindex)}</head><body class="${l}${opts.bodyClass ? ` ${opts.bodyClass}` : ''}">${sprite()}${header(cfg, l, opts.base)}<main id="main" tabindex="-1">${main}</main>${footer(cfg, l, opts.base)}${opts.script === false ? '' : `<script src="${a.js}" defer></script>`}</body></html>`;
}

function home(cfg: SiteConfig, l: Lang, a: Assets): string {
  const main = [hero(cfg, l), `<div class="divider">${pulseDivider()}</div>`, modules(cfg, l), modes(cfg, l), connected(cfg, l), flows(cfg, l), security(cfg, l), plans(cfg, l), faq(cfg, l), join(cfg, l)].join('\n');
  return shell(cfg, l, HERO.title[l], HERO.description[l], a, main);
}

function chooser(cfg: SiteConfig, a: Assets): string {
  const l: Lang = 'en';
  const h = head(cfg, l, 'Kiorly | كيورلي', `${HERO.description.ar} ${HERO.description.en}`, a).replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${cfg.origin}/">`).replace(`<script src="${a.bootJs}"></script>`, '');
  return `<!doctype html><html lang="en"><head>${h}</head><body class="en chooser"><main id="main" class="wrap center"><img src="/assets/brand/kiorly-lockup.svg" width="240" height="58" alt="Kiorly"><h1 class="sr">${esc(COMMON.chooser.en)} / ${esc(COMMON.chooser.ar)}</h1><p class="row"><a class="btn" href="/ar/" hreflang="ar" lang="ar">العربية</a><a class="btn ghost" href="/en/" hreflang="en" lang="en">English</a></p></main><script src="${a.langJs}" defer></script></body></html>`;
}

function notFound(cfg: SiteConfig, a: Assets): string {
  const l: Lang = 'en';
  const main = `<section class="hero small"><div class="wrap"><h1>${esc(COMMON.notFoundTitle.en)} / ${esc(COMMON.notFoundTitle.ar)}</h1><p class="lead" lang="ar" dir="rtl">${esc(COMMON.notFoundText.ar)}</p><p class="lead">${esc(COMMON.notFoundText.en)}</p><p><a class="btn" href="/">${esc(COMMON.backHome.en)} / ${esc(COMMON.backHome.ar)}</a></p></div></section>`;
  return shell(cfg, l, `${COMMON.notFoundTitle.en} | Kiorly`, COMMON.notFoundText.en, a, main, { noindex: true, script: false, base: '/en/' });
}

export function renderPages(cfg: SiteConfig, a: Assets): OutFile[] {
  const out: OutFile[] = [{ path: 'index.html', body: chooser(cfg, a) }, { path: '404.html', body: notFound(cfg, a) }];
  for (const l of LANGS) out.push({ path: `${l}/index.html`, body: home(cfg, l, a) });
  return out;
}

export function sitemapXml(cfg: SiteConfig): string {
  const alt = LANGS.map((x) => `<xhtml:link rel="alternate" hreflang="${x}" href="${cfg.origin}${urlPath(x)}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${LANGS.map((l) => `<url><loc>${cfg.origin}${urlPath(l)}</loc>${alt}</url>`).join('')}</urlset>\n`;
}
/** Non-indexable environments disallow everything and publish no sitemap. */
export function robotsTxt(cfg: SiteConfig): string {
  return cfg.indexable ? `User-agent: *\nAllow: /\nSitemap: ${cfg.origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n';
}
