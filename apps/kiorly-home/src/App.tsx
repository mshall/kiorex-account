import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { DICT, LangCtx, initialLang, useT, type Lang } from './i18n';
import { CARD_KEYS, DEFAULT_THEME, PRODUCTS, THEME_KEY, initialTile, needsOrg, parseMethod, parseTheme, parseTo, productEntryUrl, signupUrl, toCards, workspaceHint, type Card, type CardKey, type SignInMethod, type Theme } from './core';
import { fetchWorkspaces, handleCallback, hasSession, signOut, startLogin } from './oidc';
import { handoffLogin } from './handoff';
import { ENV } from './env';
import type { PasswordPersona } from './dev/personas';

// DEV ONLY quick-pick: the condition is inline so Vite folds it to false in production builds and drops the import and the whole ./dev folder.
const DevTestUsers = import.meta.env.DEV && import.meta.env.VITE_DEV_TEST_USERS !== 'false' ? lazy(() => import('./dev/TestUsers')) : null;

const LAST = 'kh.last'; const METHOD = 'kh.method';
const read = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* storage blocked: applies to this visit only */ } };
const KIOREX_URL = (import.meta.env.VITE_KIOREX_URL as string | undefined) ?? 'https://www.kiorex.com';
const isDark = (theme: Theme) => theme === 'dark' || (theme === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);

type View = { s: 'form' } | { s: 'callback' } | { s: 'error' } | { s: 'opening'; key: CardKey } | { s: 'hint'; chosen: CardKey; card: Card } | { s: 'signingOut' };

/** 24x24 stroke icons, the same shapes as the Kiorly app's tiles (stethoscope, heart for Nurse, pill, flask). */
const ICONS: Record<CardKey, ReactNode> = {
  clinic: <><path d="M6 3v6a4 4 0 008 0V3" /><path d="M10 13v2a5 5 0 0010 0v-2" /><circle cx="20" cy="11" r="2" /></>,
  nurse: <path d="M20.8 5.6a5.5 5.5 0 00-7.8 0L12 6.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l1 1.1L12 22l7.8-7.5 1-1.1a5.5 5.5 0 000-7.8z" />,
  pharmacy: <><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)" /><line x1="10" y1="7.5" x2="14.5" y2="16" /></>,
  lab: <><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 001.3 2.2h12.4a1.5 1.5 0 001.3-2.2L14 9V3" /><line x1="7.5" y1="15" x2="16.5" y2="15" /></>,
};
const Icon = ({ k }: { k: CardKey }) => <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[k]}</svg>;

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(() => { try { return parseTheme(localStorage.getItem(THEME_KEY)); } catch { return DEFAULT_THEME; } });
  // only an explicit choice is stored; light is the default and nothing is written on a plain visit
  const setTheme = (next: Theme) => { setThemeState(next); write(THEME_KEY, next); };
  const [, tick] = useState(0);
  useEffect(() => { const el = document.documentElement; el.lang = lang; el.dir = lang === 'ar' ? 'rtl' : 'ltr'; write('kh.lang', lang); }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const mq = matchMedia('(prefers-color-scheme: dark)'); const f = () => tick((n) => n + 1); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, [theme]);
  const t = DICT[lang];
  return (
    <LangCtx.Provider value={{ lang, t }}>
      <a className="skip" href="#main">{t.skip}</a>
      <Shell lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} dark={isDark(theme)} />
    </LangCtx.Provider>
  );
}

function Shell({ lang, setLang, theme, setTheme, dark }: { lang: Lang; setLang: (l: Lang) => void; theme: Theme; setTheme: (t: Theme) => void; dark: boolean }) {
  const { t } = useT();
  const search = window.location.search; const path = window.location.pathname;
  const to = useMemo(() => parseTo(search, path), [search, path]);
  const switching = useMemo(() => new URLSearchParams(search).get('switch') === '1', [search]);
  const [tile, setTile] = useState<CardKey>(() => initialTile(to, read(LAST)));
  const [method, setMethodState] = useState<SignInMethod>(() => parseMethod(read(METHOD)));
  const [view, setView] = useState<View>(() => (path.startsWith('/signin/callback') ? { s: 'callback' } : { s: 'form' }));
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [org, setOrg] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const ran = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (view.s !== 'form') heading.current?.focus(); }, [view.s]);
  const choose = (k: CardKey) => { setTile(k); setError(null); };
  const chooseMethod = (m: SignInMethod) => { setMethodState(m); setError(null); };

  const openProduct = useCallback((key: CardKey) => { write(LAST, key); setView({ s: 'opening', key }); window.location.replace(productEntryUrl({ key, url: ENV.products[key] })); }, []);

  // Passport callback: finish the code exchange, then open the chosen product (silent code flow there). The workspaces call only feeds the optional hint.
  useEffect(() => {
    if (ran.current || !path.startsWith('/signin/callback')) return; ran.current = true;
    handleCallback(search).then(async ({ to: dl }) => {
      const chosen = ((CARD_KEYS as string[]).includes(dl ?? '') ? dl : tile) as CardKey;
      window.history.replaceState(null, '', `/signin?to=${chosen}`);
      setTile(chosen); write(METHOD, 'passport');
      let hint: Card | null = null;
      try { hint = workspaceHint(toCards(await fetchWorkspaces()), chosen); } catch { /* the hint is optional: never block */ }
      if (hint) setView({ s: 'hint', chosen, card: hint }); else openProduct(chosen);
    }).catch(() => setView({ s: 'error' }));
  }, [path, search, tile, openProduct]);

  const begin = (loginHint?: string, forTile: CardKey = tile) => { write(LAST, forTile); void startLogin({ to: forTile, lang, loginHint }); };
  const out = () => { setView({ s: 'signingOut' }); signOut(); };
  const signedIn = hasSession();
  useEffect(() => { try { const idt = sessionStorage.getItem('kh.idt'); if (idt) setName((JSON.parse(atob(idt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { name?: string }).name ?? null); } catch { /* ignore */ } }, [view.s]);

  const lab = needsOrg(tile);
  const valid = email.includes('@') && (lab ? org.trim().length > 1 : password.length > 0);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!valid || busy) return;
    setError(null); setBusy(true);
    const r = await handoffLogin(tile, { email, password, org });
    if (r.kind === 'redirect') { write(LAST, tile); write(METHOD, 'password'); setPassword(''); setView({ s: 'opening', key: tile }); window.location.replace(r.url); return; }
    setBusy(false);
    if (r.code === 'passwordDisabled') { chooseMethod('passport'); setError(t.passwordDisabled(t.short[tile])); return; }
    setError(r.code === 'invalid' ? (lab ? t.invalidLab : t.invalid) : r.code === 'rateLimited' ? t.rateLimited : r.code === 'network' ? t.network : r.code === 'notAllowed' ? t.notAllowed : t.serverError);
  };
  const fill = (u: PasswordPersona) => { setMethodState('password'); setEmail(u.email); setPassword(u.password); setOrg(u.org); setError(null); };

  return (
    <div className="page">
      <header className="band">
        <div className="band-row">
          <a className="lockup" href="/signin" aria-label={t.appName} data-testid="brand-lockup">
            <img src={`/brand/kiorex-mark-inverse.svg`} alt="" width="52" height="35" />
            <span className="rule" aria-hidden="true" />
            <span className="appname">{t.appName}</span>
          </a>
          <div className="tools">
            <div className="langs" role="group" aria-label={t.langToggle}>
              {(['ar', 'en'] as Lang[]).map((l) => (
                <button key={l} type="button" className={lang === l ? 'pill on' : 'pill'} aria-pressed={lang === l} aria-label={l === 'ar' ? 'ع, العربية' : 'EN, English'} lang={l} data-testid={`lang-${l}`} onClick={() => setLang(l)}>{l === 'ar' ? 'ع' : 'EN'}</button>
              ))}
            </div>

            {signedIn && view.s === 'form' ? <button type="button" className="pill ghosty" onClick={out}>{t.signOut}</button> : null}
          </div>
        </div>
        <hr className="hair" aria-hidden="true" />
        <p className="tagline" data-testid="brand-tagline">{t.tagline}</p>
      </header>
      <main id="main" className="main" aria-live="polite">
        {view.s === 'form' ? (
          <section className="card-wrap" aria-labelledby="h1">
            <div className="signcard">
              <h1 id="h1" ref={heading} tabIndex={-1}>{t.signInTitle}</h1>
              <p className="sub">{t.signInLede}</p>
              {switching ? <p className="note" data-testid="switch-note">{t.switchNote}{name ? ` ${t.signedInAs(name)}.` : ''}</p> : null}
              <TileGrid tile={tile} onChoose={choose} />
              {tile === 'nurse' ? <p className="note" data-testid="nurse-hint">{t.nurseHint}</p> : null}
              <MethodTabs method={method} onChange={chooseMethod} />
              {error ? <p className="error" role="alert" data-testid="signin-error">{error}</p> : null}
              {method === 'passport' ? (
                <div role="tabpanel" id="panel-passport" aria-labelledby="tab-passport" className="panel-body" data-testid="signin-passport-panel">
                  <button type="button" className="btn primary lg" data-testid="signin-passport" onClick={() => begin()}>{t.signInBtn}</button>
                  <p className="note center">{t.passportHint}</p>
                </div>
              ) : (
                <form role="tabpanel" id="panel-password" aria-labelledby="tab-password" className="panel-body" data-testid="signin-password-panel" onSubmit={(e) => void submit(e)} noValidate>
                  <label className="field"><span>{t.email}</span><input type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="signin-email" /></label>
                  {lab
                    ? <label className="field"><span>{t.org}</span><input type="text" autoCapitalize="none" spellCheck={false} required placeholder={t.orgHint} value={org} onChange={(e) => setOrg(e.target.value)} data-testid="signin-org" /></label>
                    : <label className="field"><span>{t.password}</span><input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="signin-password" /></label>}
                  <button type="submit" className="btn primary lg" disabled={!valid || busy} data-testid="signin-submit">{busy ? t.submitting : t.submit}</button>
                </form>
              )}
              <p className="note center create"><span>{t.newHere}</span> <a href={signupUrl(tile, ENV.products[tile])} data-testid="create-workspace">{t.createWorkspace(t.short[tile])}</a></p>
            </div>
            {DevTestUsers ? <Suspense fallback={null}><DevTestUsers tile={tile} onPassport={(phone, k) => { setTile(k); begin(phone, k); }} onFill={fill} /></Suspense> : null}
          </section>
        ) : null}
        {view.s === 'callback' ? <Status heading={heading} text={t.callbackWorking} /> : null}
        {view.s === 'signingOut' ? <Status heading={heading} text={t.signingOut} /> : null}
        {view.s === 'opening' ? <Opening heading={heading} k={view.key} /> : null}
        {view.s === 'error' ? <ErrorView heading={heading} retry={() => { window.history.replaceState(null, '', '/signin'); setView({ s: 'form' }); }} /> : null}
        {view.s === 'hint' ? <Hint heading={heading} chosen={view.chosen} card={view.card} lang={lang} dark={dark} open={openProduct} out={out} name={name} /> : null}
      </main>
      <footer className="foot">
        <label className="sel"><span>{t.theme}</span>
              <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label={t.theme} data-testid="theme-select">
                <option value="light">{t.themeLight}</option><option value="dark">{t.themeDark}</option><option value="auto">{t.themeAuto}</option>
              </select></label>
        <span>{t.patientNote} <a href={KIOREX_URL}>{t.patientLink}</a></span>
      </footer>
    </div>
  );
}

function TileGrid({ tile, onChoose }: { tile: CardKey; onChoose: (k: CardKey) => void }) {
  const { t } = useT();
  // radiogroup: arrow keys move the choice, Tab enters the checked tile only
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = CARD_KEYS.indexOf(tile); const rtl = document.documentElement.dir === 'rtl';
    const d = e.key === 'ArrowRight' ? (rtl ? -1 : 1) : e.key === 'ArrowLeft' ? (rtl ? 1 : -1) : e.key === 'ArrowDown' ? 2 : e.key === 'ArrowUp' ? -2 : 0;
    if (!d) return; e.preventDefault();
    const next = CARD_KEYS[Math.min(CARD_KEYS.length - 1, Math.max(0, i + d))]!; onChoose(next);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="product-${next}"]`)?.focus());
  };
  return (
    <div className="tiles" role="radiogroup" aria-label={t.signInLede} data-testid="product-grid" onKeyDown={onKey}>
      {CARD_KEYS.map((k) => (
        <button key={k} type="button" role="radio" aria-checked={tile === k} tabIndex={tile === k ? 0 : -1} data-testid={`product-${k}`} data-tile={k} className={tile === k ? 'tile on' : 'tile'}
          style={{ ['--accent' as string]: PRODUCTS[k].accent, ['--accent-text' as string]: `var(--kx-product-${k}-text)` }} onClick={() => onChoose(k)}>
          <span className="ico"><Icon k={k} /></span><span className="tname">{t.tile[k]}</span>
        </button>
      ))}
    </div>
  );
}

function MethodTabs({ method, onChange }: { method: SignInMethod; onChange: (m: SignInMethod) => void }) {
  const { t } = useT();
  const items: Array<[SignInMethod, string]> = [['passport', t.methodPassport], ['password', t.methodPassword]];
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const n = method === 'passport' ? 'password' : 'passport'; onChange(n); requestAnimationFrame(() => document.getElementById(`tab-${n}`)?.focus()); } };
  return (
    <div className="seg" role="tablist" aria-label={t.method} data-testid="signin-method" onKeyDown={onKey}>
      {items.map(([m, label]) => (
        <button key={m} type="button" role="tab" id={`tab-${m}`} aria-selected={method === m} aria-controls={`panel-${m}`} tabIndex={method === m ? 0 : -1} className={method === m ? 'on' : ''} data-testid={`signin-method-${m}`} onClick={() => onChange(m)}>{label}</button>
      ))}
    </div>
  );
}

function Hd({ h, children }: { h: React.RefObject<HTMLHeadingElement | null>; children: ReactNode }) { return <h1 ref={h} tabIndex={-1}>{children}</h1>; }
function Status({ heading, text }: { heading: React.RefObject<HTMLHeadingElement | null>; text: string }) {
  return <section className="panel narrow center" role="status"><span className="spin" aria-hidden="true" /><Hd h={heading}>{text}</Hd></section>;
}
function Opening({ heading, k }: { heading: React.RefObject<HTMLHeadingElement | null>; k: CardKey }) {
  const { t } = useT();
  return (
    <section className="panel narrow center" role="status">
      <span className="spin" aria-hidden="true" /><Hd h={heading}>{t.opening(t.short[k])}</Hd>
      <p className="note">{t.openingFallback} <a href={productEntryUrl({ key: k, url: ENV.products[k] })}>{t.openNow}</a></p>
    </section>
  );
}
function ErrorView({ heading, retry }: { heading: React.RefObject<HTMLHeadingElement | null>; retry: () => void }) {
  const { t } = useT();
  return (
    <section className="panel narrow center" role="alert">
      <Hd h={heading}>{t.callbackFailed}</Hd>
      <div className="row"><button type="button" className="btn primary" onClick={retry}>{t.tryAgain}</button></div>
    </section>
  );
}
/** Gentle hint (never a block): the person has exactly one workspace and it is not the product they chose. Both options stay available. */
function Hint({ heading, chosen, card, lang, dark, open, out, name }: { heading: React.RefObject<HTMLHeadingElement | null>; chosen: CardKey; card: Card; lang: Lang; dark: boolean; open: (k: CardKey) => void; out: () => void; name: string | null }) {
  const { t } = useT();
  void lang; void dark;
  return (
    <section className="panel narrow" aria-labelledby="h1" data-testid="workspace-hint">
      <Hd h={heading}>{t.hintTitle(t.short[card.key])}</Hd>
      {name ? <p className="who">{t.signedInAs(name)}</p> : null}
      <p className="lede">{t.hintLede(t.short[chosen], t.short[card.key])}</p>
      <div className="stack">
        <button type="button" className="btn primary lg" data-testid="hint-open-own" onClick={() => open(card.key)}>{t.hintOpen(t.short[card.key])}</button>
        <button type="button" className="btn lg" data-testid="hint-continue" onClick={() => open(chosen)}>{t.hintContinue(t.short[chosen])}</button>
        <button type="button" className="btn ghost" onClick={out}>{t.signOut}</button>
      </div>
    </section>
  );
}
