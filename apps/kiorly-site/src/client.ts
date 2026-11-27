/** Browser behaviour of the Kiorly page: menu, scroll state, tabs, reveal animations, language memory and the join form. No framework, no network except the lead endpoint. */
import defaults from './form-defaults.json';
import { mountJoinForm } from './form';
import { mountPlans, type PlansLabels } from './plans';
import { bindTabs } from './tabs';
import type { FormConfig } from './lead';

const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// language memory (the root page redirects by it)
for (const a of document.querySelectorAll<HTMLAnchorElement>('a.lang')) a.addEventListener('click', () => { try { localStorage.setItem('kiorly-lang', a.hreflang); } catch { /* ignore */ } });

// header state and mobile menu
const header = document.querySelector<HTMLElement>('.top');
const onScroll = () => header?.classList.toggle('is-stuck', window.scrollY > 8);
onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]'); const nav = document.querySelector<HTMLElement>('#site-nav');
if (toggle && nav) {
  const set = (open: boolean) => { toggle.setAttribute('aria-expanded', String(open)); nav.classList.toggle('open', open); };
  toggle.addEventListener('click', () => set(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if ((e.target as HTMLElement).closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') { set(false); toggle.focus(); } });
}

// accessible tabs (module selector and journeys)
for (const list of document.querySelectorAll<HTMLElement>('[role=tablist]')) bindTabs(list);

// reveal on scroll (skipped entirely when the visitor prefers reduced motion or the browser has no IntersectionObserver)
const reveals = [...document.querySelectorAll<HTMLElement>('.reveal')];
if (reduce || typeof IntersectionObserver !== 'function') for (const el of reveals) el.classList.add('is-in');
else {
  const io = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  for (const el of reveals) io.observe(el);
}

// the section the visitor is reading
const links = [...document.querySelectorAll<HTMLAnchorElement>('#site-nav a[href^="#"]:not(.btn)')];
if (links.length && typeof IntersectionObserver === 'function') {
  const byId = new Map(links.map((a) => [a.getAttribute('href')!.slice(1), a]));
  // every section is observed, not only the ones with a menu link: a section without one (standalone vs connected, Join us) clears the mark instead of leaving the previous section marked
  const spy = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { for (const a of links) a.removeAttribute('aria-current'); byId.get(en.target.id)?.setAttribute('aria-current', 'true'); } }, { rootMargin: '-40% 0px -55% 0px' });
  for (const s of document.querySelectorAll<HTMLElement>('main section[id]')) spy.observe(s);
}

// the join form
const host = document.querySelector<HTMLElement>('[data-join]');
let join: ReturnType<typeof mountJoinForm> | null = null;
if (host) {
  join = mountJoinForm(host, { lang: host.dataset.lang === 'ar' ? 'ar' : 'en', env: host.dataset.env ?? '', endpoint: host.dataset.endpoint || null, defaults: defaults as unknown as FormConfig });
  host.dataset.ready = 'true';
}
// one delegated listener: it also serves buttons that are added later (the live plans)
document.addEventListener('click', (e) => {
  const b = (e.target as Element | null)?.closest<HTMLElement>('[data-join-mode],[data-join-module]');
  if (b) join?.prefill({ mode: b.dataset.joinMode, module: b.dataset.joinModule, type: b.dataset.joinType });
});

// the live plans: read from the platform when the page loads; the static text stays when that fails
const plansHost = document.querySelector<HTMLElement>('[data-plans]');
if (plansHost?.dataset.endpoint) {
  let labels: PlansLabels | null = null;
  try { labels = JSON.parse(plansHost.dataset.labels ?? 'null') as PlansLabels | null; } catch { labels = null; }
  if (labels) void mountPlans(plansHost, { endpoint: plansHost.dataset.endpoint, lang: plansHost.dataset.lang === 'ar' ? 'ar' : 'en', labels, bind: bindTabs });
}
