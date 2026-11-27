/** Browser behaviour of the Kiorly page: menu, scroll state, tabs, reveal animations, language memory and the join form. No framework, no network except the lead endpoint. */
import defaults from './form-defaults.json';
import { mountJoinForm } from './form';
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

// accessible tabs (module selector and journeys): arrow keys, Home and End, roving tabindex
for (const list of document.querySelectorAll<HTMLElement>('[role=tablist]')) {
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const select = (t: HTMLButtonElement, focus = false) => {
    for (const x of tabs) { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls') ?? ''); if (p) p.hidden = !on; }
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const rtl = document.documentElement.dir === 'rtl'; const next = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i + next + tabs.length) % tabs.length]!, true); }
      else if (e.key === 'Home') { e.preventDefault(); select(tabs[0]!, true); } else if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1]!, true); }
    });
  });
}

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
  const spy = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { for (const a of links) a.removeAttribute('aria-current'); byId.get(en.target.id)?.setAttribute('aria-current', 'true'); } }, { rootMargin: '-40% 0px -55% 0px' });
  for (const id of byId.keys()) { const s = document.getElementById(id); if (s) spy.observe(s); }
}

// the join form
const host = document.querySelector<HTMLElement>('[data-join]');
let join: ReturnType<typeof mountJoinForm> | null = null;
if (host) {
  join = mountJoinForm(host, { lang: host.dataset.lang === 'ar' ? 'ar' : 'en', env: host.dataset.env ?? '', endpoint: host.dataset.endpoint || null, defaults: defaults as unknown as FormConfig });
  host.dataset.ready = 'true';
}
for (const b of document.querySelectorAll<HTMLElement>('[data-join-mode],[data-join-module]')) {
  b.addEventListener('click', () => { join?.prefill({ mode: b.dataset.joinMode, module: b.dataset.joinModule, type: b.dataset.joinType }); });
}
