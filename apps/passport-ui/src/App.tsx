import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Api } from './api';
import type { Auth, AuthConfig } from './auth';
import { AppProvider, useApp } from './app-context';
import { useI18n, type TKey } from './i18n';
import { Link, navigate, useRoute } from './router';
import { Loading, ToastProvider, Alert, Button } from './ui';
import { safeReturn } from './util';
import { HomePage } from './pages/Home';
import { SecurityPage } from './pages/Security';
import { FamilyPage } from './pages/Family';
import { LinkedPage } from './pages/Linked';
import { OpsLinksPage } from './pages/OpsLinks';
import { OrgsPage } from './pages/Orgs';
import { PrivacyPage } from './pages/Privacy';
import { AppsPage } from './pages/Apps';
import { StepUpPage } from './pages/StepUp';

type Theme = 'system' | 'light' | 'dark';
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => { try { const v = localStorage.getItem('kx-theme'); return v === 'light' || v === 'dark' ? v : 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const h = document.documentElement;
    if (theme === 'system') delete h.dataset.theme; else h.dataset.theme = theme;
    try { if (theme === 'system') localStorage.removeItem('kx-theme'); else localStorage.setItem('kx-theme', theme); } catch { /* ignore */ }
  }, [theme]);
  return [theme, setTheme];
}

function Brand() {
  return (
    <span className="brand">
      <img src="/static/brand/kiorex-mark.svg" alt="" width="32" height="32" />
      <span className="wordmark" aria-hidden="true" dir="ltr">KIORE<b>X</b></span>
      <span className="brand-sub">Passport</span>
    </span>
  );
}

function Toolbar() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useTheme();
  return (
    <div className="toolbar">
      <label className="sr-only" htmlFor="kx-theme">{t('app.theme')}</label>
      <select id="kx-theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
        <option value="system">{t('theme.system')}</option><option value="light">{t('theme.light')}</option><option value="dark">{t('theme.dark')}</option>
      </select>
      <button type="button" className="btn btn-ghost" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</button>
    </div>
  );
}

const NAV: Array<{ to: string; key: TKey; ops?: boolean }> = [
  { to: '/account', key: 'nav.home' }, { to: '/account/security', key: 'nav.security' }, { to: '/account/family', key: 'nav.family' },
  { to: '/account/linked', key: 'nav.linked' }, { to: '/account/orgs', key: 'nav.orgs' }, { to: '/account/privacy', key: 'nav.privacy' },
  { to: '/account/apps', key: 'nav.apps' }, { to: '/account/ops/links', key: 'nav.ops', ops: true },
];

function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { account, signOut } = useApp();
  const { path } = useRoute();
  const isOps = account.roles.some((r) => r === 'ops_admin' || r === 'super_admin');
  return (
    <>
      <a className="skip" href="#main">{t('app.skip')}</a>
      <header className="topbar">
        <Link to="/account" className="brand-link" aria-label={t('app.name')}><Brand /></Link>
        <Toolbar />
        <Button variant="ghost" onClick={signOut}>{t('app.signOut')}</Button>
      </header>
      <nav className="tabs" aria-label={t('app.mainNav')}>
        {NAV.filter((n) => !n.ops || isOps).map((n) => (
          <Link key={n.to} to={n.to} aria-current={path === n.to ? 'page' : undefined} className={path === n.to ? 'tab active' : 'tab'}>{t(n.key)}</Link>
        ))}
      </nav>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="foot"><span>{t('app.devNote')}</span></footer>
    </>
  );
}

function Routes() {
  const { path } = useRoute();
  const { t } = useI18n();
  switch (path) {
    case '/account': return <HomePage />;
    case '/account/security': return <SecurityPage />;
    case '/account/family': return <FamilyPage />;
    case '/account/linked': return <LinkedPage />;
    case '/account/orgs': return <OrgsPage />;
    case '/account/privacy': return <PrivacyPage />;
    case '/account/apps': return <AppsPage />;
    case '/account/step-up': return <StepUpPage />;
    case '/account/ops/links': return <OpsLinksPage />;
    default: return <><h1>404</h1><p>{t('app.notFound')}</p><Link to="/account">{t('nav.home')}</Link></>;
  }
}

export function SignInPage({ notice, auth }: { notice?: 'expired' | 'failed' | 'deleted'; auth: Auth }) {
  const { t, lang } = useI18n();
  const { path, query } = useRoute();
  const invite = query.get('invite');
  const go = () => { const ret = path === '/account/callback' || query.get('deleted') ? '/account' : safeReturn(path) + (invite ? `?invite=${encodeURIComponent(invite)}` : ''); void auth.startLogin(ret, lang); };
  return (
    <>
      <header className="topbar"><span className="brand-link"><Brand /></span><Toolbar /></header>
      <main id="main" className="signin" tabIndex={-1}>
        {notice === 'deleted' ? <Alert kind="success"><strong>{t('signin.deleted.title')}</strong> {t('signin.deleted.body')}</Alert> : null}
        {notice === 'expired' ? <Alert kind="warning">{t('signin.expired')}</Alert> : null}
        {notice === 'failed' ? <Alert kind="error">{t('signin.failed')}</Alert> : null}
        <h1>{t('signin.title')}</h1>
        <p className="lead">{t('signin.lead')}</p>
        <Button onClick={go}>{t('signin.cta')}</Button>
      </main>
      <footer className="foot"><span>{t('app.devNote')}</span></footer>
    </>
  );
}

function Callback({ auth }: { auth: Auth }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    auth.handleCallback(window.location.search).then((r) => { if (live) navigate(safeReturn(r.returnTo), true); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [auth]);
  if (failed) return <SignInPage auth={auth} notice="failed" />;
  return <main id="main" className="signin"><Loading label={t('signin.working')} /></main>;
}

export function App({ auth, api, cfg }: { auth: Auth; api: Api; cfg: AuthConfig }) {
  const { path, query } = useRoute();
  const [signedIn, setSignedIn] = useState(() => auth.hasSession());
  const [notice, setNotice] = useState<'expired' | undefined>();
  const onAuthError = useCallback(() => { auth.clear(); setNotice('expired'); setSignedIn(false); }, [auth]);
  useEffect(() => { if (path !== '/account/callback') setSignedIn(auth.hasSession()); }, [path, auth]);
  if (path === '/account/callback') return <Callback auth={auth} />;
  if (!signedIn) return <SignInPage auth={auth} notice={query.get('deleted') ? 'deleted' : notice} />;
  return (
    <ToastProvider>
      <AppProvider api={api} auth={auth} cfg={cfg} onAuthError={onAuthError}>
        <Shell><Routes /></Shell>
      </AppProvider>
    </ToastProvider>
  );
}
