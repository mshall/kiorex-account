/** Browser script for the onboarding form (bundled by esbuild into assets/site.js; no dependencies). Reads its settings from data attributes of the form, so the HTML stays the single source. */
import { buildPayload, validateLead, type LeadErrors, type LeadField, type LeadInput } from './lead';

const form = document.querySelector<HTMLFormElement>('form[data-lead-form]');
if (form) {
  const lang = (form.dataset.lang === 'ar' ? 'ar' : 'en') as 'ar' | 'en';
  const endpoint = form.dataset.endpoint || '';
  const env = form.dataset.env || '';
  const status = form.querySelector<HTMLElement>('[data-status]')!;
  const msg = (k: string) => form.dataset[k] ?? '';
  const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
  const read = (): LeadInput => ({ kind: val('kind'), organisation: val('organisation'), contactName: val('contactName'), phone: val('phone'), email: val('email'), city: val('city'), message: val('message'), consent: (form.elements.namedItem('consent') as HTMLInputElement).checked, website: val('website') });
  const show = (errors: LeadErrors) => {
    for (const f of ['kind', 'organisation', 'contactName', 'phone', 'email', 'consent'] as LeadField[]) {
      const el = form.querySelector<HTMLElement>(`[name="${f}"]`); const out = form.querySelector<HTMLElement>(`[data-error-for="${f}"]`);
      const code = errors[f];
      if (el) el.setAttribute('aria-invalid', code ? 'true' : 'false');
      if (out) { out.textContent = code ? (code === 'required' ? msg('errRequired') : msg('errInvalid')) : ''; out.hidden = !code; }
    }
  };
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    status.className = 'status'; status.textContent = '';
    const input = read();
    if (input.website) return; // honeypot: bots fill the hidden field; humans never see it
    const errors = validateLead(input);
    show(errors);
    const first = Object.keys(errors)[0];
    if (first) { form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return; }
    const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    button.disabled = true; status.textContent = msg('sending');
    const payload = buildPayload(input, { env, locale: lang, now: new Date() });
    try {
      if (endpoint) {
        const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!r.ok) throw new Error(String(r.status));
      }
      form.reset(); show({});
      status.className = 'status ok'; status.textContent = endpoint ? msg('sent') : msg('mockSent');
      status.focus();
    } catch {
      status.className = 'status bad'; status.textContent = msg('failed'); button.disabled = false; return;
    }
    button.disabled = false;
  });
}

for (const a of document.querySelectorAll<HTMLAnchorElement>('a.lang')) a.addEventListener('click', () => { try { localStorage.setItem('kiorly-lang', a.hreflang); } catch { /* ignore */ } });

// The menu is a <details> (works without JavaScript on phones). On wide screens it is always shown: open it, and follow the viewport.
const menu = document.querySelector<HTMLDetailsElement>('details.menu');
if (menu && typeof matchMedia === 'function') {
  const wide = matchMedia('(min-width: 56rem)');
  const sync = () => { if (wide.matches) menu.open = true; };
  sync(); wide.addEventListener('change', (e) => { menu.open = e.matches; });
}
