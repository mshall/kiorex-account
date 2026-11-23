import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DICT, LangCtx, initialLang, useT, type Lang } from './i18n';
import { CARD_KEYS, DEFAULT_THEME, PRODUCTS, THEME_KEY, decide, parseTheme, parseTo, productEntryUrl, signupUrl, toCards, type Card, type CardKey, type Decision, type Theme } from './core';
import { fetchWorkspaces, handleCallback, hasSession, signOut, startLogin, Unauthorized } from './oidc';
import { ENV } from './env';

// DEV ONLY quick-pick: the condition is inline so Vite folds it to false in production builds and drops the import and the whole ./dev folder.
const DevTestUsers = import.meta.env.DEV && import.meta.env.VITE_DEV_TEST_USERS !== 'false' ? lazy(() => import('./dev/TestUsers')) : null;

const LAST = 'kh.last';
const readLast = (): CardKey | null => { try { const v = localStorage.getItem(LAST); return (CARD_KEYS as string[]).includes(v ?? '') ? (v as CardKey) : null; } catch { return null; } };
const writeLast = (k: CardKey) => { try { localStorage.setItem(LAST, k); } catch { /* ignore */ } };
const KIOREX_URL = (import.meta.env.VITE_KIOREX_URL as string | undefined) ?? 'https://www.kiorex.com';
const isDark = (theme: Theme) => theme === 'dark' || (theme === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);

type View =
  | { s: 'landing' } | { s: 'callback' } | { s: 'loading' } | { s: 'error'; msg: 'callback' | 'load' }
  | { s: 'decided'; d: Decision } | { s: 'opening'; card: Card } | { s: 'signingOut' };

function Lockup({ k, lang, dark, height = 44 }: { k: CardKey | 'kiorex'; lang: Lang; dark: boolean; height?: number }) {
  const ar = lang === 'ar' && k !== 'nurse' && k !== 'kiorex' ? '-ar' : '';
  const name = k === 'kiorex' ? 'kiorex-lockup' : PRODUCTS[k].lockup;
  return <img src={`/brand/${name}${ar}${dark ? '-inverse' : ''}.svg`} alt="" height={height} style={{ height }} />;
}

export function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setThemeState] = useState<Theme>(() => { try { return parseTheme(localStorage.getItem(THEME_KEY)); } catch { return DEFAULT_THEME; } });
  // only an explicit choice is stored; light is the default and nothing is written on a plain visit
  const setTheme = (next: Theme) => { setThemeState(next); try { localStorage.setItem(THEME_KEY, next); } catch { /* storage blocked: applies to this visit only */ } };
  const [, tick] = useState(0);
  useEffect(() => { const el = document.documentElement; el.lang = lang; el.dir = lang === 'ar' ? 'rtl' : 'ltr'; try { localStorage.setItem('kh.lang', lang); } catch { /* ignore */ } }, [lang]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const mq = matchMedia('(prefers-color-scheme: dark)'); const f = () => tick((n) => n + 1); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f);
  }, [theme]);
  const t = DICT[lang];
  const dark = isDark(theme);
  return (
    <LangCtx.Provider value={{ lang, t }}>
      <a className="skip" href="#main">{t.skip}</a>
      <Shell lang={lang} setLang={setLang} theme={theme} setTheme={setTheme} dark={dark} />
    </LangCtx.Provider>
  );
}

function Shell({ lang, setLang, theme, setTheme, dark }: { lang: Lang; setLang: (l: Lang) => void; theme: Theme; setTheme: (t: Theme) => void; dark: boolean }) {
  const { t } = useT();
  const search = window.location.search; const path = window.location.pathname;
  const to = useMemo(() => parseTo(search, path), [search, path]);
  const switching = useMemo(() => new URLSearchParams(search).get('switch') === '1', [search]);
  const [view, setView] = useState<View>(() => (path.startsWith('/signin/callback') ? { s: 'callback' } : hasSession() ? { s: 'loading' } : { s: 'landing' }));
  const [name, setName] = useState<string | null>(null);
  const ran = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [view.s]);

  const route = useCallback((card: Card) => { writeLast(card.key); setView({ s: 'opening', card }); window.location.replace(productEntryUrl(card)); }, []);
  const load = useCallback(async (target: CardKey | null) => {
    setView({ s: 'loading' });
    try {
      const cards = toCards(await fetchWorkspaces());
      const d = decide(cards, { to: target, last: readLast(), switching });
      if (d.kind === 'route') route(d.card); else setView({ s: 'decided', d });
    } catch (e) { setView(e instanceof Unauthorized ? { s: 'landing' } : { s: 'error', msg: 'load' }); }
  }, [route, switching]);

  useEffect(() => {
    if (ran.current) return; ran.current = true;
    if (path.startsWith('/signin/callback')) {
      handleCallback(search).then(({ to: dl }) => { window.history.replaceState(null, '', dl ? `/signin?to=${dl}` : '/signin'); return load(dl as CardKey | null); }).catch(() => setView({ s: 'error', msg: 'callback' }));
    } else if (hasSession()) { void load(to); }
  }, [path, search, to, load]);

  const begin = (loginHint?: string) => { void startLogin({ to, lang, loginHint }); };
  const out = () => { setView({ s: 'signingOut' }); signOut(); };
  const signedIn = view.s === 'decided' || view.s === 'opening';
  useEffect(() => { try { const idt = sessionStorage.getItem('kh.idt'); if (idt) setName((JSON.parse(atob(idt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { name?: string }).name ?? null); } catch { /* ignore */ } }, [view.s]);

  return (
    <div className="page">
      <header className="top">
        <a className="brand" href="/signin" aria-label={t.appName}><Lockup k="kiorex" lang={lang} dark={dark} height={34} /></a>
        <div className="tools">
          <button type="button" className="ghost" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} lang={lang === 'ar' ? 'en' : 'ar'}>{t.language}</button>
          <label className="sel"><span className="sr">{t.theme}</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label={t.theme}>
              <option value="light">{t.themeLight}</option><option value="dark">{t.themeDark}</option><option value="auto">{t.themeAuto}</option>
            </select></label>
          {signedIn ? <button type="button" className="ghost" onClick={out}>{t.signOut}</button> : null}
        </div>
      </header>
      <main id="main" className="main" aria-live="polite">
        {view.s === 'landing' ? <Landing heading={heading} begin={begin} lang={lang} dark={dark} /> : null}
        {view.s === 'callback' || view.s === 'loading' ? <Status heading={heading} text={view.s === 'callback' ? t.callbackWorking : t.loading} /> : null}
        {view.s === 'signingOut' ? <Status heading={heading} text={t.signingOut} /> : null}
        {view.s === 'opening' ? <Opening heading={heading} card={view.card} /> : null}
        {view.s === 'error' ? <ErrorView heading={heading} kind={view.msg} retry={() => (view.msg === 'load' ? void load(to) : begin())} out={out} /> : null}
        {view.s === 'decided' ? <Decided heading={heading} d={view.d} lang={lang} dark={dark} route={route} out={out} name={name} /> : null}
        {DevTestUsers && (view.s === 'landing' || view.s === 'error') ? <Suspense fallback={null}><DevTestUsers onPick={(p) => begin(p)} /></Suspense> : null}
      </main>
      <footer className="foot"><span>{t.patientNote} <a href={KIOREX_URL}>{t.patientLink}</a></span></footer>
    </div>
  );
}

function Hd({ h, children }: { h: React.RefObject<HTMLHeadingElement | null>; children: ReactNode }) { return <h1 ref={h} tabIndex={-1}>{children}</h1>; }
function Status({ heading, text }: { heading: React.RefObject<HTMLHeadingElement | null>; text: string }) {
  return <section className="panel narrow center" role="status"><span className="spin" aria-hidden="true" /><Hd h={heading}>{text}</Hd></section>;
}
function Landing({ heading, begin, lang, dark }: { heading: React.RefObject<HTMLHeadingElement | null>; begin: () => void; lang: Lang; dark: boolean }) {
  const { t } = useT();
  return (
    <section className="panel narrow" aria-labelledby="h1">
      <div className="strip" aria-hidden="true">{CARD_KEYS.map((k) => <Lockup key={k} k={k} lang={lang} dark={dark} height={30} />)}</div>
      <h1 id="h1" ref={heading} tabIndex={-1}>{t.signInTitle}</h1>
      <p className="lede">{t.signInLede}</p>
      <button type="button" className="btn primary lg" onClick={() => begin()}>{t.signInBtn}</button>
      <p className="note">{t.signInNote}</p>
    </section>
  );
}
function Opening({ heading, card }: { heading: React.RefObject<HTMLHeadingElement | null>; card: Card }) {
  const { t } = useT();
  return (
    <section className="panel narrow center" role="status">
      <span className="spin" aria-hidden="true" /><Hd h={heading}>{t.opening(t.short[card.key])}</Hd>
      <p className="note">{t.openingFallback} <a href={productEntryUrl(card)}>{t.openNow}</a></p>
    </section>
  );
}
function ErrorView({ heading, kind, retry, out }: { heading: React.RefObject<HTMLHeadingElement | null>; kind: 'callback' | 'load'; retry: () => void; out: () => void }) {
  const { t } = useT();
  return (
    <section className="panel narrow center" role="alert">
      <Hd h={heading}>{kind === 'callback' ? t.callbackFailed : t.loadFailed}</Hd>
      <div className="row"><button type="button" className="btn primary" onClick={retry}>{t.tryAgain}</button>{kind === 'load' ? <button type="button" className="btn" onClick={out}>{t.signOut}</button> : null}</div>
    </section>
  );
}

function Decided({ heading, d, lang, dark, route, out, name }: { heading: React.RefObject<HTMLHeadingElement | null>; d: Decision; lang: Lang; dark: boolean; route: (c: Card) => void; out: () => void; name: string | null }) {
  const { t } = useT();
  const who = name ? <p className="who">{t.signedInAs(name)}</p> : null;
  if (d.kind === 'picker') {
    return (
      <section aria-labelledby="h1">
        <Hd h={heading}>{t.pickerTitle}</Hd>{who}
        <p className="lede">{t.pickerLede}</p>
        <ul className="grid" data-testid="workspace-cards">
          {d.cards.map((c) => (
            <li key={c.key}>
              <a className="card" data-card={c.key} style={{ ['--accent' as string]: PRODUCTS[c.key].accent, ['--accent-text' as string]: `var(--kx-product-${c.key}-text)` }} href={productEntryUrl(c)} onClick={(e) => { e.preventDefault(); route(c); }}>
                <Lockup k={c.key} lang={lang} dark={dark} height={56} />
                <span className="name">{t.product[c.key]}</span>
                {c.key === 'nurse' ? <span className="meta">{t.editionOf}</span> : null}
                <span className="meta">{t.blurb[c.key]}</span>
                <span className="meta strong">{c.orgs.length === 1 ? `${c.orgs[0]!.name} ${t.asRole(c.orgs[0]!.role.replace(/_/g, ' '))}` : t.orgs(c.orgs.length)}</span>
                {d.last === c.key ? <span className="badge">{t.lastUsed}</span> : null}
                <span className="go">{t.open}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return (
    <section aria-labelledby="h1">
      {d.kind === 'empty' ? <><Hd h={heading}>{t.emptyTitle}</Hd>{who}<p className="lede">{t.emptyLede}</p></> : null}
      {d.kind === 'missing' ? <><Hd h={heading}>{t.missingTitle(t.short[d.wanted])}</Hd>{who}<p className="lede">{t.missingLede}</p></> : null}
      <h2>{t.createOrJoin}</h2>
      <ul className="grid" data-testid="create-or-join">
        {(d.kind === 'missing' ? [d.wanted] : CARD_KEYS).map((k) => (
          <li key={k}>
            <a className="card" data-create={k} style={{ ['--accent' as string]: PRODUCTS[k].accent, ['--accent-text' as string]: `var(--kx-product-${k}-text)` }} href={signupUrl(k, ENV.products[k])}>
              <Lockup k={k} lang={lang} dark={dark} height={56} /><span className="name">{t.product[k]}</span><span className="meta">{t.blurb[k]}</span><span className="go">{t.createOrJoin}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="note">{t.joinHint}</p>
      {d.kind === 'missing' && d.cards.length ? <button type="button" className="btn" onClick={() => { window.location.assign('/signin?switch=1'); }}>{t.chooseOther}</button> : null}
      {d.kind === 'empty' ? <button type="button" className="btn" onClick={out}>{t.signOut}</button> : null}
    </section>
  );
}
