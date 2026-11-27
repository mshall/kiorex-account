/**
 * The multi-step join form (browser). Rendered from the form configuration: the offline defaults embedded at build time (form-defaults.json, generated from the platform)
 * replaced by the live answer of GET <endpoint>/config when the site has a lead endpoint. Everything the visitor types stays in memory (no storage, no URL).
 * Spam control on this side: a hidden honeypot field. The server adds the rate limits, size limits and strict validation; the site never touches a CAPTCHA.
 */
import { FORM, type FormText } from './form-text';
import { buildPayload, emptyState, fieldsOf, applies, LICENCE_FIELDS, normalisePhone, stepOfField, validateAll, validateStep, type Errors, type FormConfig, type FormState, type PickItem } from './lead';
import type { L10n } from './config';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const TOTAL = 5;
export interface JoinOptions { lang: 'ar' | 'en'; env: string; endpoint: string | null; defaults: FormConfig; contactEmail?: string | null }

export function mountJoinForm(root: HTMLElement, o: JoinOptions): { prefill: (p: { mode?: string; type?: string; module?: string }) => void } {
  const lang = o.lang; const tx = <T = string>(v: L10n<T> | string): T => (typeof v === 'string' ? (v as unknown as T) : v[lang]);
  let cfg: FormConfig = o.defaults; let step = 1; let state: FormState = emptyState(lang, cfg.markets[0]?.key); let errors: Errors = {}; let idem = ''; let busy = false; let sentRef = '';
  const lab = (i: PickItem) => (lang === 'ar' ? i.ar : i.en);
  const t = (k: keyof FormText) => tx(FORM[k] as unknown as L10n<string>);
  const errText = (c: string, f: string): string => {
    if (c === 'phone') return t('errPhone'); if (c === 'email') return t('errEmail'); if (f === 'consent') return t('errConsent'); if (f === 'branches' && c === 'too_short') return t('errBranches2');
    if ((f === 'phone' || f === 'email') && c !== 'required' && c !== 'too_long') return t(f === 'phone' ? 'errPhone' : 'errEmail'); // the server answers `invalid` for a malformed number or address
    return ({ required: t('errRequired'), invalid: t('errInvalid'), too_long: t('errTooLong'), too_short: t('errTooShort'), too_many: t('errTooMany'), phone: t('errPhone'), email: t('errEmail') } as Record<string, string>)[c] ?? t('errInvalid');
  };

  root.innerHTML = `<div class="wiz" data-wiz>
  <ol class="wiz-steps" aria-label="${esc(t('progress'))}">${(FORM.steps[lang]).map((s, i) => `<li data-step-li="${i + 1}"><span class="num" aria-hidden="true">${i + 1}</span><span class="lbl">${esc(s)}</span></li>`).join('')}</ol>
  <p class="sr" role="status" aria-live="polite" data-live></p>
  <form novalidate data-form autocomplete="on"><div class="err-summary" data-summary role="alert" tabindex="-1" hidden></div><div data-body></div>
  <div class="field trap" aria-hidden="true"><label for="jf-website">Website</label><input id="jf-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
  <div class="wiz-nav"><button type="button" class="btn ghost" data-back>${esc(t('back'))}</button><button type="button" class="btn" data-next>${esc(t('next'))}</button><button type="submit" class="btn" data-submit hidden>${esc(t('submit'))}</button></div>
  <p class="status" data-status role="status" tabindex="-1"></p></form>
  <div class="wiz-done" data-done hidden></div></div>`;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const body = $('[data-body]'); const summary = $('[data-summary]'); const status = $('[data-status]'); const form = $<HTMLFormElement>('[data-form]'); const done = $('[data-done]');

  const fieldErr = (f: string) => (errors[f] ? `<p class="err" id="e-${f.replace('.', '-')}">${esc(errText(errors[f]!, f))}</p>` : '');
  const inv = (f: string) => (errors[f] ? ` aria-invalid="true" aria-describedby="e-${f.replace('.', '-')}"` : '');
  const input = (f: string, label: string, v: string, opt: { type?: string; req?: boolean; attrs?: string; hint?: string; dir?: string } = {}) => `<div class="field"><label for="f-${f.replace('.', '-')}">${esc(label)}${opt.req ? ` <span class="req">*</span>` : ''}</label><input id="f-${f.replace('.', '-')}" name="${f}" type="${opt.type ?? 'text'}" value="${esc(v)}"${opt.dir ? ` dir="${opt.dir}"` : ''} ${opt.attrs ?? ''}${inv(f)}>${opt.hint ? `<p class="hint">${esc(opt.hint)}</p>` : ''}${fieldErr(f)}</div>`;
  const select = (f: string, label: string, items: PickItem[], v: string, req = false) => `<div class="field"><label for="f-${f}">${esc(label)}${req ? ` <span class="req">*</span>` : ''}</label><select id="f-${f}" name="${f}"${inv(f)}><option value="">${esc(t('choose'))}</option>${items.map((i) => `<option value="${esc(i.key)}"${i.key === v ? ' selected' : ''}>${esc(lab(i))}</option>`).join('')}</select>${fieldErr(f)}</div>`;
  const group = (f: string, legend: string, items: PickItem[], vals: string[], type: 'checkbox' | 'radio', req = false, hint = '') => `<fieldset class="field chips"${inv(f)}><legend>${esc(legend)}${req ? ` <span class="req">*</span>` : ''}</legend>${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<div class="chip-row">${items.map((i, n) => `<label class="chip"><input type="${type}" name="${f}" value="${esc(i.key)}"${vals.includes(i.key) ? ' checked' : ''}${n === 0 && errors[f] ? ` id="f-${f}"` : ''}><span>${esc(lab(i))}</span></label>`).join('')}</div>${fieldErr(f)}</fieldset>`;
  const req = (f: string) => cfg.requiredFields.includes(f) && applies(cfg, state.providerType, f);

  function stepHtml(n: number): string {
    const spec = fieldsOf(cfg, state.providerType); const type = state.providerType; const A = (f: string) => applies(cfg, type, f);
    if (n === 1) return `<fieldset class="field choices"${inv('mode')}><legend>${esc(t('modeTitle'))} <span class="req">*</span></legend><div class="choice-row">
      ${(['STANDALONE', 'CONNECTED'] as const).map((m) => `<label class="choice mode ${m === 'CONNECTED' ? 'is-connected' : ''}"><input type="radio" name="mode" value="${m}"${state.mode === m ? ' checked' : ''} id="${m === 'STANDALONE' ? 'f-mode' : 'f-mode-2'}"><span class="choice-body"><strong>${esc(t(m === 'STANDALONE' ? 'modeStandalone' : 'modeConnected'))}</strong><span>${esc(t(m === 'STANDALONE' ? 'modeStandaloneText' : 'modeConnectedText'))}</span></span></label>`).join('')}</div>${fieldErr('mode')}</fieldset>
      <fieldset class="field choices"${inv('providerType')}><legend>${esc(t('typeTitle'))} <span class="req">*</span></legend><div class="choice-row types">${cfg.providerTypes.map((p, i) => `<label class="choice type"><input type="radio" name="providerType" value="${esc(p.key)}"${state.providerType === p.key ? ' checked' : ''}${i === 0 ? ' id="f-providerType"' : ''}><span class="choice-body"><strong>${esc(lab(p))}</strong></span></label>`).join('')}</div>${fieldErr('providerType')}</fieldset>`;
    if (n === 2) {
      let h = input('legalName', t('legalName'), state.legalName, { req: true, attrs: `autocomplete="organization" maxlength="${cfg.limits.legalName}"` });
      if (A('tradeName')) h += input('tradeName', t('tradeName'), state.tradeName, { req: req('tradeName'), attrs: 'maxlength="120"' });
      if (A('branches')) h += input('branches', t('branches'), state.branches, { req: req('branches') || !!spec.minBranches, attrs: 'inputmode="numeric" maxlength="3"', hint: spec.minBranches ? t('errBranches2') : undefined });
      if (A('staffCount')) h += input('staffCount', t('staffCount'), state.staffCount, { req: req('staffCount'), attrs: 'inputmode="numeric" maxlength="4"' });
      if (A('specialties')) h += group('specialties', t('specialties'), cfg.specialties, state.specialties, 'checkbox', req('specialties'));
      if (A('services')) h += `<div class="field"><label for="f-services">${esc(t('services'))}${req('services') ? ' <span class="req">*</span>' : ''}</label><textarea id="f-services" name="services" rows="3" maxlength="${cfg.limits.services}"${inv('services')}>${esc(state.services)}</textarea>${fieldErr('services')}</div>`;
      if (A('currentSoftware')) h += `<div class="field"><label for="f-currentSoftware">${esc(t('currentSoftware'))}${req('currentSoftware') ? ' <span class="req">*</span>' : ''}</label><input id="f-currentSoftware" name="currentSoftware" list="dl-software" maxlength="80" value="${esc(state.currentSoftware)}"${inv('currentSoftware')}><datalist id="dl-software">${cfg.software.map((s) => `<option value="${esc(lab(s))}"></option>`).join('')}</datalist><p class="hint">${esc(t('currentSoftwareHint'))}</p>${fieldErr('currentSoftware')}</div>`;
      for (const [k, a] of Object.entries(spec.answers)) {
        const f = `answers.${k}`; const label = FORM.answers[k] ? tx(FORM.answers[k]!) : k; const v = state.answers[k];
        if (a.kind === 'bool') h += `<div class="field check"><input id="f-${f.replace('.', '-')}" name="${f}" type="checkbox"${v === true ? ' checked' : ''}><label for="f-${f.replace('.', '-')}">${esc(label)}</label></div>`;
        else if (a.kind === 'int') h += input(f, label, typeof v === 'string' ? v : '', { attrs: 'inputmode="numeric" maxlength="5"' });
        else if (a.kind === 'enum') h += `<div class="field"><label for="f-${f.replace('.', '-')}">${esc(label)}</label><select id="f-${f.replace('.', '-')}" name="${f}"${inv(f)}><option value="">${esc(t('choose'))}</option>${a.values.map((x) => `<option value="${x}"${v === x ? ' selected' : ''}>${esc(FORM.enums[x] ? tx(FORM.enums[x]!) : x)}</option>`).join('')}</select>${fieldErr(f)}</div>`;
        else h += input(f, label, typeof v === 'string' ? v : '', { req: type === 'OTHER' && k === 'otherDescription', attrs: `maxlength="${a.max}"` });
      }
      return h;
    }
    if (n === 3) {
      const m = cfg.markets.find((x) => x.key === state.market) ?? cfg.markets[0]; let h = input('contactName', t('contactName'), state.contactName, { req: true, attrs: 'autocomplete="name" maxlength="100"' }) + input('contactRole', t('contactRole'), state.contactRole, { req: req('contactRole'), attrs: 'autocomplete="organization-title" maxlength="80"' });
      h += input('phone', t('phone'), state.phone, { type: 'tel', req: true, dir: 'ltr', attrs: 'autocomplete="tel" inputmode="tel" maxlength="30"', hint: `${t('phoneHint')} (${m?.dialCode ?? '+20'})` }) + input('email', t('email'), state.email, { type: 'email', req: req('email'), dir: 'ltr', attrs: 'autocomplete="email" maxlength="254"' });
      if (cfg.markets.length > 1) h += select('market', t('market'), cfg.markets, state.market, true);
      if (m?.governorates.length) h += select('governorate', t('governorate'), m.governorates, state.governorate, req('governorate'));
      return h + input('city', t('city'), state.city, { req: req('city'), attrs: 'autocomplete="address-level2" maxlength="80"' });
    }
    if (n === 4) {
      const lics = LICENCE_FIELDS.filter((f) => A(f)); let h = `<div class="note-box" data-licence-note><strong>${esc(t('licenceTitle'))}</strong><p>${esc(t('licenceNote'))}</p></div>`;
      for (const f of lics) h += input(`licences.${f}`, `${t(f)} (${req(f) ? t('required') : t('optional')})`, state.licences[f] ?? '', { dir: 'ltr', attrs: `maxlength="${cfg.limits.licence}" autocomplete="off"` });
      h += group('modules', t('modules'), cfg.modules, state.modules, 'checkbox', req('modules')) + select('goLive', t('goLive'), cfg.goLive, state.goLive, req('goLive'));
      return h;
    }
    const langItems: PickItem[] = [{ key: 'ar', en: 'العربية', ar: 'العربية' }, { key: 'en', en: 'English', ar: 'English' }];
    return `<div class="field"><fieldset class="chips"><legend>${esc(t('language'))}</legend><div class="chip-row">${langItems.map((i) => `<label class="chip"><input type="radio" name="locale" value="${i.key}"${state.locale === i.key ? ' checked' : ''}><span>${esc(lab(i))}</span></label>`).join('')}</div></fieldset></div>`
      + group('contactChannel', t('contactChannel'), cfg.contactChannels, state.contactChannel ? [state.contactChannel] : [], 'radio', req('contactChannel')) + group('contactTime', t('contactTime'), cfg.contactTimes, state.contactTime ? [state.contactTime] : [], 'radio', req('contactTime'))
      + `<div class="field"><label for="f-note">${esc(t('note'))}</label><textarea id="f-note" name="note" rows="3" maxlength="${cfg.limits.note}"${inv('note')}>${esc(state.note)}</textarea>${fieldErr('note')}</div>`
      + `<div class="review" data-review><h3>${esc(t('review'))}</h3><p class="hint">${esc(t('reviewHint'))}</p><dl>${reviewRows()}</dl></div>`
      + `<div class="field check consent"><input id="f-consent" name="consent" type="checkbox"${state.consent ? ' checked' : ''}${inv('consent')}><label for="f-consent">${esc(t('consent'))}</label><p class="hint draft" data-needs-human="consent">${esc(t('consentDraft'))}</p>${fieldErr('consent')}</div>`;
  }
  function reviewRows(): string {
    const pt = cfg.providerTypes.find((p) => p.key === state.providerType); const gov = cfg.markets.find((m) => m.key === state.market)?.governorates.find((g) => g.key === state.governorate);
    const rows: Array<[string, string]> = [[t('mode'), t(state.mode === 'CONNECTED' ? 'modeConnected' : 'modeStandalone')], [t('type'), pt ? lab(pt) : ''], [t('legalName'), state.legalName], [t('contactName'), state.contactName], [t('phone'), normalisePhone(state.phone, cfg.markets.find((m) => m.key === state.market)?.dialCode) ?? state.phone], [t('email'), state.email], [t('governorate'), gov ? lab(gov) : ''], [t('modules'), state.modules.map((k) => { const i = cfg.modules.find((x) => x.key === k); return i ? lab(i) : k; }).join(', ')]];
    return rows.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd dir="auto">${esc(v)}</dd></div>`).join('');
  }

  function render(focus: 'heading' | 'none' = 'none') {
    body.innerHTML = `<h3 class="step-title" tabindex="-1" data-step-title>${esc(tx(FORM.steps)[step - 1]!)}<span class="sr"> (${esc(t('stepOf').replace('{n}', String(step)).replace('{total}', String(TOTAL)))})</span></h3>${stepHtml(step)}`;
    root.querySelectorAll<HTMLElement>('[data-step-li]').forEach((li) => { const n = Number(li.dataset.stepLi); li.classList.toggle('is-done', n < step); li.classList.toggle('is-current', n === step); if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    $<HTMLButtonElement>('[data-back]').hidden = step === 1; $<HTMLButtonElement>('[data-next]').hidden = step === TOTAL; $<HTMLButtonElement>('[data-submit]').hidden = step !== TOTAL;
    $('[data-live]').textContent = `${t('stepOf').replace('{n}', String(step)).replace('{total}', String(TOTAL))}: ${tx(FORM.steps)[step - 1]}`;
    if (focus === 'heading') $<HTMLElement>('[data-step-title]').focus({ preventScroll: false });
  }
  function showErrors(e: Errors) {
    errors = e; const keys = Object.keys(e);
    if (!keys.length) { summary.hidden = true; summary.innerHTML = ''; return; }
    summary.hidden = false;
    summary.innerHTML = `<p>${esc(t('errSummary'))}</p><ul>${keys.map((k) => `<li><a href="#f-${k.replace('.', '-')}" data-jump="${k}">${esc(fieldLabel(k))}: ${esc(errText(e[k]!, k))}</a></li>`).join('')}</ul>`;
  }
  function fieldLabel(k: string): string {
    const base = k.split('.')[1] ?? k; const ans = FORM.answers[base]; if (k.startsWith('answers.') && ans) return tx(ans);
    if (k.startsWith('licences.')) return tx((FORM as unknown as Record<string, L10n<string>>)[base]!);
    const alias: Record<string, keyof FormText> = { mode: 'modeTitle', providerType: 'typeTitle', legalName: 'legalName', consent: 'consent' };
    const key = (alias[k] ?? k) as keyof FormText; const m = (FORM as unknown as Record<string, L10n<string>>)[key];
    return m && typeof m === 'object' && 'en' in m ? tx(m).slice(0, 60) : k;
  }
  function focusField(k: string) { const el = root.querySelector<HTMLElement>(`#f-${k.replace('.', '-')}`) ?? root.querySelector<HTMLElement>(`[name="${k}"]`); el?.focus(); }

  function go(n: number, focus: 'heading' | 'none' = 'heading') { step = Math.min(Math.max(n, 1), TOTAL); status.textContent = ''; status.className = 'status'; render(focus); }
  $('[data-next]').addEventListener('click', () => {
    const e = validateStep(step, state, cfg);
    if (Object.keys(e).length) { errors = e; render('none'); showErrors(e); summary.focus(); return; }
    errors = {}; showErrors({}); go(step + 1);
  });
  $('[data-back]').addEventListener('click', () => { showErrors({}); go(step - 1); });
  summary.addEventListener('click', (ev) => { const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>('a[data-jump]'); if (a) { ev.preventDefault(); focusField(a.dataset.jump!); } });

  // state follows the inputs
  const onInput = (ev: Event) => {
    const el = ev.target as HTMLInputElement; const n = el.name; if (!n) return;
    if (n === 'website') { state.website = el.value; return; }
    if (n === 'mode') state.mode = el.value; else if (n === 'providerType') { if (state.providerType !== el.value) state.answers = {}; state.providerType = el.value; }
    else if (n === 'consent') state.consent = el.checked; else if (n === 'locale') state.locale = el.value === 'ar' ? 'ar' : 'en';
    else if (n === 'specialties' || n === 'modules') { const set = new Set(state[n]); if (el.checked) set.add(el.value); else set.delete(el.value); state[n] = [...set]; }
    else if (n === 'contactChannel' || n === 'contactTime') state[n] = el.value;
    else if (n.startsWith('answers.')) state.answers[n.slice(8)] = el.type === 'checkbox' ? el.checked : el.value;
    else if (n.startsWith('licences.')) state.licences[n.slice(9)] = el.value;
    else if (n in state) (state as unknown as Record<string, string>)[n] = el.value;
    if (errors[n]) { delete errors[n]; el.removeAttribute('aria-invalid'); root.querySelector(`#e-${n.replace('.', '-')}`)?.remove(); if (!Object.keys(errors).length) { summary.hidden = true; } }
    if (n === 'market') render('none');
  };
  form.addEventListener('input', onInput); form.addEventListener('change', onInput);

  async function submit() {
    if (busy) return; const e = validateAll(state, cfg); showErrors(e);
    if (Object.keys(e).length) { const first = Object.keys(e).map((k) => stepOfField(k)).sort((a, b) => a - b)[0]!; step = first; errors = e; render('none'); showErrors(e); summary.focus(); return; }
    busy = true; const btn = $<HTMLButtonElement>('[data-submit]'); btn.disabled = true; status.className = 'status'; status.textContent = t('sending');
    idem ||= (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, '');
    const payload = buildPayload(state, cfg, { env: o.env, now: new Date() });
    try {
      if (!o.endpoint) { await new Promise((r) => setTimeout(r, 400)); finish('KL-SAMPLE00', true); return; }
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20_000);
      const r = await fetch(o.endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': idem }, body: JSON.stringify(payload), credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal }).finally(() => clearTimeout(to));
      const j = (await r.json().catch(() => ({}))) as { reference?: string; code?: string; fields?: Record<string, string> };
      if (r.status === 201 || r.status === 200) { finish(j.reference ?? '', false); return; }
      if (r.status === 400 && j.code === 'VALIDATION_FAILED' && j.fields) {
        const fe: Errors = {}; for (const [k, v] of Object.entries(j.fields)) fe[(LICENCE_FIELDS as readonly string[]).includes(k) ? `licences.${k}` : k] = (['required', 'invalid', 'too_long', 'too_short', 'too_many'].includes(v) ? v : 'invalid') as Errors[string];
        const first = Object.keys(fe).map((k) => stepOfField(k)).sort((a, b) => a - b)[0] ?? 5; step = first; errors = fe; render('none'); showErrors(fe); summary.focus(); idem = ''; return;
      }
      status.className = 'status bad'; status.textContent = r.status === 429 ? t('rate') : r.status === 409 ? t('conflict') : t('failed'); if (r.status === 409) idem = '';
    } catch { status.className = 'status bad'; status.textContent = t('failed'); } finally { busy = false; btn.disabled = false; }
  }
  form.addEventListener('submit', (ev) => { ev.preventDefault(); if (state.website) { finish('KL-' + 'X'.repeat(8), false); return; } void submit(); }); // a filled honeypot gets a fake success (bots learn nothing)

  function finish(ref: string, mock: boolean) {
    busy = false; sentRef = ref; idem = '';
    form.hidden = true; root.querySelector<HTMLElement>('.wiz-steps')!.hidden = true; done.hidden = false;
    done.innerHTML = `<div class="done-art" aria-hidden="true"><svg viewBox="0 0 64 64" width="72" height="72"><circle cx="32" cy="32" r="30" fill="#E8F7EE"/><path d="m19 33 9 9 17-19" fill="none" stroke="#16A34A" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <h3 tabindex="-1" data-done-title>${esc(t('sentTitle'))}</h3>${mock ? `<p class="alert" role="note">${esc(t('mockSent'))}</p>` : ''}
    <p class="ref-label">${esc(t('sentRef'))}</p><p class="ref" dir="ltr" data-ref>${esc(sentRef)}</p><p><button type="button" class="btn ghost" data-copy>${esc(t('copy'))}</button> <span class="sr" role="status" data-copied></span></p>
    <h4>${esc(t('nextTitle'))}</h4><ol class="next-steps"><li>${esc(t('next1'))}</li><li>${esc(t('next2'))}</li><li>${esc(t('next3'))}</li></ol>${state.mode === 'CONNECTED' ? `<p class="hint">${esc(t('nextConnected'))}</p>` : ''}
    <p><button type="button" class="btn" data-another>${esc(t('another'))}</button></p>`;
    done.querySelector<HTMLElement>('[data-done-title]')!.focus();
    done.querySelector('[data-copy]')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(sentRef); done.querySelector('[data-copied]')!.textContent = t('copied'); } catch { /* clipboard blocked: the number is on screen */ } });
    done.querySelector('[data-another]')?.addEventListener('click', () => { state = emptyState(lang, cfg.markets[0]?.key); errors = {}; step = 1; done.hidden = true; form.hidden = false; root.querySelector<HTMLElement>('.wiz-steps')!.hidden = false; render('heading'); });
  }

  render('none');
  // live configuration (picklists the team edits in the admin settings); the embedded defaults keep the form usable offline
  if (o.endpoint) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 5_000);
    fetch(`${o.endpoint.replace(/\/$/, '')}/config`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal }).then((r) => (r.ok ? r.json() : null)).then((j: FormConfig | null) => {
      if (!j || !Array.isArray(j.providerTypes) || !j.providerTypes.length || !j.typeFields || !j.markets?.length) return;
      cfg = j; if (!cfg.markets.some((m) => m.key === state.market)) state.market = cfg.markets[0]!.key; render('none'); root.dataset.config = 'live';
    }).catch(() => { root.dataset.config = 'defaults'; }).finally(() => clearTimeout(to));
  }
  return {
    prefill: (p) => {
      if (p.mode === 'STANDALONE' || p.mode === 'CONNECTED') state.mode = p.mode;
      if (p.type && cfg.providerTypes.some((x) => x.key === p.type)) { if (state.providerType !== p.type) state.answers = {}; state.providerType = p.type; }
      if (p.module && cfg.modules.some((x) => x.key === p.module) && !state.modules.includes(p.module)) state.modules = [...state.modules, p.module];
      if (!done.hidden) return; if (step === 1) render('none'); else go(1, 'none');
    },
  };
}
